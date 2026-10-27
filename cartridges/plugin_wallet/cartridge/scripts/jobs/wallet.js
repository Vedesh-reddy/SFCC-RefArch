'use strict';

/**
 * Job steps of the wallet. Every step is bounded by MaxItems, resumes from record state or
 * WalletJobState, can be repeated without double effects, and reports counts in its status.
 */

var Status = require('dw/system/Status');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');
var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var walletHelpers = require('*/cartridge/scripts/helpers/walletHelpers');

var log = Logger.getLogger('plugin-wallet', 'wallet-jobs');
var DAY = 86400000;

/**
 * @param {Object} params - job parameters
 * @param {number} fallback - default
 * @returns {number} bounded batch size
 */
function maxItems(params, fallback) {
    var value = Number(params && params.MaxItems);
    return value > 0 && value <= 10000 ? Math.floor(value) : fallback;
}

/**
 * @param {string} name - step name
 * @param {Function} fn - work returning counts
 * @returns {dw.system.Status} OK, or ERROR when the step threw or reported failures or mismatches
 */
function run(name, fn) {
    if (!walletHelpers.isWalletEnabled()) return new Status(Status.OK, 'DISABLED', 'Wallet disabled');
    try {
        var counts = fn() || {};
        var summary = JSON.stringify(counts);
        log.info('{0}: {1}', name, summary);
        return counts.failed > 0 || counts.mismatches > 0 ? new Status(Status.ERROR, 'ATTENTION', summary) : new Status(Status.OK, 'OK', summary);
    } catch (e) {
        log.error('{0} failed: {1}', name, e.message);
        return new Status(Status.ERROR, 'ERROR', e.message);
    }
}

/**
 * Inside or outside a transaction: opens a reconciliation case.
 * @param {string} walletId - wallet
 * @param {?string} entityId - journal or hold
 * @param {Object} detail - safe detail
 * @param {string} dedupeKey - one open case per key
 */
function openMismatchCase(walletId, entityId, detail, dedupeKey) {
    Transaction.wrap(function () {
        walletHelpers.openCase({ caseType: 'RECONCILIATION_MISMATCH', walletId: walletId, entityId: entityId, severity: 'CRITICAL', detail: detail, dedupeKey: dedupeKey });
    });
}

/**
 * Captures holds of placed orders, releases holds of failed or cancelled ones, sends stuck
 * holds to review, and expires approvals and invitations.
 * @param {Object} params - {MaxItems}
 * @returns {dw.system.Status} status
 */
exports.holds = function (params) {
    return run('holds', function () {
        var paymentHelpers = require('*/cartridge/scripts/helpers/walletPaymentHelpers');
        var counts = paymentHelpers.processHolds(maxItems(params, 500));
        counts.approvalsExpired = paymentHelpers.expireApprovals(maxItems(params, 500));
        counts.invitationsExpired = require('*/cartridge/scripts/helpers/walletFamilyHelpers').expireInvitations(maxItems(params, 500));
        return counts;
    });
};

/**
 * Verifies open top-ups with the gateway and expires stale ones.
 * @param {Object} params - {MaxItems}
 * @returns {dw.system.Status} status
 */
exports.topUps = function (params) {
    return run('top-ups', function () {
        return require('*/cartridge/scripts/helpers/walletTopUpHelpers').reconcileTopUps(maxItems(params, 200));
    });
};

/**
 * Ledger reconciliation: replays wallets (cursor-based) against their balance snapshots,
 * checks that recent journals balance, and that captured holds match their orders.
 * @param {Object} params - {MaxItems}
 * @returns {dw.system.Status} status
 */
exports.reconcile = function (params) {
    return run('reconcile', function () {
        var accountHelpers = require('*/cartridge/scripts/helpers/walletAccountHelpers');
        var limit = maxItems(params, 200);
        var cursor = walletHelpers.getJobState('reconcile').cursor || '';
        var counts = { wallets: 0, journals: 0, holds: 0, mismatches: 0, truncated: 0 };
        var wallets = walletHelpers.queryPage('WalletAccount', 'custom.walletId > {0}', 'custom.walletId asc', [cursor], 0, limit).items;
        wallets.forEach(function (w) {
            var replay = accountHelpers.replayWallet(w, 20000);
            counts.wallets += 1;
            if (replay.truncated) {
                counts.truncated += 1;
            } else if (!replay.ok) {
                counts.mismatches += 1;
                openMismatchCase(w.custom.walletId, null, { replayAvailable: replay.available, replayHeld: replay.held, gaps: replay.gaps }, 'recon:' + w.custom.walletId);
            }
        });
        // The cursor wraps around once every wallet has been replayed.
        walletHelpers.saveJobState('reconcile', { cursor: wallets.length < limit ? '' : wallets[wallets.length - 1].custom.walletId });
        var since = new Date(Date.now() - 2 * DAY);
        walletHelpers.queryPage('WalletJournal', 'custom.createdAt >= {0}', null, [since], 0, limit * 10).items.forEach(function (j) {
            counts.journals += 1;
            if (!accountHelpers.isBalanced(j)) {
                counts.mismatches += 1;
                openMismatchCase(j.custom.walletId, j.custom.journalId, { reason: 'unbalanced-journal' }, 'journal:' + j.custom.journalId);
            }
        });
        var OrderMgr = require('dw/order/OrderMgr');
        var methodId = walletHelpers.getPreference('walletPaymentMethodId');
        walletHelpers.queryPage('WalletHold', 'custom.status = {0} AND custom.capturedAt >= {1}', null, ['CAPTURED', since], 0, limit).items.forEach(function (h) {
            counts.holds += 1;
            var order = OrderMgr.getOrder(h.custom.orderNo);
            var paid = order ? order.paymentInstruments.toArray().filter(function (pi) {
                return pi.paymentMethod === methodId && pi.paymentTransaction.transactionID === h.custom.holdId;
            }).reduce(function (sum, pi) { return sum + walletHelpers.centsOf(pi.paymentTransaction.amount); }, 0) : -1;
            if (paid !== h.custom.capturedCents) {
                counts.mismatches += 1;
                openMismatchCase(h.custom.walletId, h.custom.holdId, { orderNo: h.custom.orderNo, reason: 'order-amount' }, 'hold-recon:' + h.custom.holdId);
            }
        });
        return counts;
    });
};

/**
 * Funds expiry. Off unless walletFundsExpiryDays is at least 1825 (five years, as US gift card
 * rules require); expires the balance of wallets inactive for that long.
 * @param {Object} params - {MaxItems}
 * @returns {dw.system.Status} status
 */
exports.expiry = function (params) {
    return run('expiry', function () {
        var days = walletHelpers.getPreference('walletFundsExpiryDays');
        var counts = { expired: 0, failed: 0 };
        if (!days) return counts;
        if (days < 1825) {
            log.error('Funds expiry skipped: walletFundsExpiryDays must be 0 (off) or at least 1825');
            return counts;
        }
        var accountHelpers = require('*/cartridge/scripts/helpers/walletAccountHelpers');
        var before = new Date(Date.now() - days * DAY);
        walletHelpers.queryPage('WalletAccount', 'custom.lastActivityAt <= {0} AND custom.availableCents > {1}', null, [before, 0], 0, maxItems(params, 100)).items.forEach(function (w) {
            try {
                Transaction.wrap(function () {
                    accountHelpers.postTransaction({ key: 'EXPIRY:' + w.custom.walletId + ':' + w.custom.sequence, txType: 'EXPIRY', walletId: w.custom.walletId, amountCents: w.custom.availableCents, actor: walletHelpers.actor('SYSTEM', 'expiry') });
                    walletHelpers.notify(w.custom.walletId, 'FUNDS_EXPIRED', {});
                });
                counts.expired += 1;
            } catch (e) {
                counts.failed += 1;
                log.error('Funds expiry of wallet {0} failed: {1}', w.custom.walletId, e.errorCode || e.message);
            }
        });
        return counts;
    });
};

/**
 * Suspicious activity review: wallets with many recent refunds are flagged (refund abuse is
 * also checked on every refund).
 * @param {Object} params - {MaxItems}
 * @returns {dw.system.Status} status
 */
exports.risk = function (params) {
    return run('risk', function () {
        var counts = { flagged: 0 };
        var since = new Date(Date.now() - walletHelpers.getPreference('walletRefundAbuseWindowDays') * DAY);
        var perWallet = {};
        walletHelpers.queryPage('WalletJournal', 'custom.txType = {0} AND custom.createdAt >= {1}', null, ['REFUND', since], 0, maxItems(params, 5000)).items.forEach(function (j) {
            perWallet[j.custom.walletId] = (perWallet[j.custom.walletId] || 0) + 1;
        });
        Object.keys(perWallet).forEach(function (walletId) {
            if (perWallet[walletId] < walletHelpers.getPreference('walletRefundAbuseCount')) return;
            Transaction.wrap(function () {
                walletHelpers.openCase({ caseType: 'REFUND_ABUSE', walletId: walletId, severity: 'MEDIUM', detail: { refunds: perWallet[walletId] }, dedupeKey: 'refunds:' + walletId });
            });
            counts.flagged += 1;
        });
        return counts;
    });
};

/**
 * @param {Object} params - {MaxItems}
 * @returns {dw.system.Status} status
 */
exports.notifications = function (params) {
    return run('notifications', function () {
        return walletHelpers.deliverNotifications(maxItems(params, 500));
    });
};

/**
 * Removes expired rate buckets, old request keys and used codes.
 * @param {Object} params - {MaxItems}
 * @returns {dw.system.Status} status
 */
exports.cleanup = function (params) {
    return run('cleanup', function () {
        var limit = maxItems(params, 1000);
        var now = new Date();
        var removeWhere = function (type, query, args) {
            var records = walletHelpers.queryPage(type, query, null, args, 0, limit).items;
            records.forEach(function (r) {
                Transaction.wrap(function () { CustomObjectMgr.remove(r); });
            });
            return records.length;
        };
        return {
            buckets: removeWhere('WalletRateBucket', 'custom.expiresAt <= {0}', [now]),
            requestKeys: removeWhere('WalletRequestKey', 'custom.createdAt <= {0}', [new Date(now.getTime() - walletHelpers.getPreference('walletRequestKeyRetentionDays') * DAY)]),
            otps: removeWhere('WalletOtp', 'custom.expiresAt <= {0}', [new Date(now.getTime() - DAY)])
        };
    });
};
