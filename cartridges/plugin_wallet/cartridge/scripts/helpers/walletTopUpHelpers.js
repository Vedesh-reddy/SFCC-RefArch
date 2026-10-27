'use strict';

/**
 * Wallet top-ups. A top-up is a funding transaction, never a basket line: it does not touch
 * merchandise totals, promotions or shipping thresholds. Funds are credited only after the
 * gateway confirms the capture server side, exactly once per top-up.
 *
 * Gateway, provider independent:
 *   SANDBOX (default, "Not for Live Money"): the owner approves or declines on a sandbox page;
 *   the outcome is stored server side and read back by verifyPayment. Never on production.
 *   EXTERNAL: an integration cartridge implements hook app.plugin.wallet.gateway
 *     createPayment(topUp) -> {status: REDIRECT, redirectUrl (https), reference}
 *     verifyPayment(topUp) -> {status: CAPTURED|PENDING|FAILED, amountCents, currency, reference}
 *   verifyPayment must ask the provider server to server; a browser redirect or a webhook
 *   body alone never credits a wallet.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');
var URLUtils = require('dw/web/URLUtils');
var walletHelpers = require('*/cartridge/scripts/helpers/walletHelpers');
var walletAccountHelpers = require('*/cartridge/scripts/helpers/walletAccountHelpers');

var log = Logger.getLogger('plugin-wallet', 'wallet-transaction');
var HOOK = 'app.plugin.wallet.gateway';
var TOPUP_FLOW = {
    PENDING: ['AWAITING_PAYMENT', 'FAILED'],
    AWAITING_PAYMENT: ['CREDITED', 'FAILED', 'EXPIRED'],
    CREDITED: ['REVERSED'],
    FAILED: [],
    EXPIRED: ['CREDITED'],
    REVERSED: []
};

/**
 * @param {string} fn - hook function
 * @param {Object} snapshot - plain top-up data
 * @returns {?Object} provider answer, or null on any failure
 */
function callGateway(fn, snapshot) {
    var HookMgr = require('dw/system/HookMgr');
    var gatewayLog = Logger.getLogger('plugin-wallet', 'wallet-gateway');
    if (walletHelpers.getPreference('walletLiveMoneyApproved') !== true) {
        gatewayLog.error('External gateway refused: walletLiveMoneyApproved is not set');
        return null;
    }
    if (!HookMgr.hasHook(HOOK)) {
        gatewayLog.error('External gateway configured but hook {0} is not registered', HOOK);
        return null;
    }
    try {
        return HookMgr.callHook(HOOK, fn, snapshot) || null;
    } catch (e) {
        gatewayLog.error('Gateway {0} failed: {1}', fn, e.message);
        return null;
    }
}

/**
 * @param {Object} topUp - {topUpId, amountCents, currency, returnUrl}
 * @returns {{status: string, redirectUrl: ?string, reference: ?string}} REDIRECT or ERROR
 */
function createPayment(topUp) {
    if (walletHelpers.isSandbox()) {
        return { status: 'REDIRECT', redirectUrl: URLUtils.https('Wallet-SandboxPay', 'id', topUp.topUpId).toString(), reference: 'sandbox-' + topUp.topUpId };
    }
    var answer = callGateway('createPayment', topUp);
    if (!answer || answer.status !== 'REDIRECT' || !/^https:\/\//.test(String(answer.redirectUrl || '')) || !answer.reference) {
        return { status: 'ERROR', redirectUrl: null, reference: null };
    }
    return { status: 'REDIRECT', redirectUrl: String(answer.redirectUrl), reference: String(answer.reference).slice(0, 128) };
}

/**
 * @param {Object} topUp - {topUpId, reference, amountCents, sandboxOutcome}
 * @returns {{status: string, amountCents: ?number, currency: ?string, reference: ?string}} CAPTURED | PENDING | FAILED | ERROR
 */
function verifyPayment(topUp) {
    if (walletHelpers.isSandbox()) {
        if (topUp.sandboxOutcome === 'APPROVED') return { status: 'CAPTURED', amountCents: topUp.amountCents, currency: 'USD', reference: topUp.reference };
        if (topUp.sandboxOutcome === 'DECLINED') return { status: 'FAILED', amountCents: null, currency: null, reference: topUp.reference };
        return { status: 'PENDING', amountCents: null, currency: null, reference: topUp.reference };
    }
    var answer = callGateway('verifyPayment', { topUpId: topUp.topUpId, reference: topUp.reference, amountCents: topUp.amountCents, currency: 'USD' });
    if (!answer || ['CAPTURED', 'PENDING', 'FAILED'].indexOf(answer.status) < 0) return { status: 'ERROR', amountCents: null, currency: null, reference: null };
    return {
        status: answer.status,
        amountCents: typeof answer.amountCents === 'number' ? answer.amountCents : null,
        currency: answer.currency ? String(answer.currency) : null,
        reference: answer.reference ? String(answer.reference) : null
    };
}

/**
 * @param {dw.object.CustomObject} topUp - top-up
 * @returns {Object} view
 */
function getTopUpView(topUp) {
    var c = topUp.custom;
    return { topUpId: c.topUpId, amountCents: c.amountCents, status: c.status, createdAt: c.createdAt, creditedAt: c.creditedAt || null, failureReason: c.failureReason || null };
}

/**
 * @param {Object} context - wallet context
 * @param {string} topUpId - top-up
 * @returns {?dw.object.CustomObject} the top-up, only when it belongs to this wallet
 */
function getOwnTopUp(context, topUpId) {
    var record = CustomObjectMgr.getCustomObject('WalletTopUp', String(topUpId || ''));
    return record && record.custom.walletId === context.walletId ? record : null;
}

/**
 * @param {Object} context - wallet context
 * @param {number} offset - rows to skip
 * @param {number} limit - page size
 * @returns {{items: Object[], total: number}} the wallet's top-ups, newest first
 */
function getTopUps(context, offset, limit) {
    var page = walletHelpers.queryPage('WalletTopUp', 'custom.walletId = {0}', 'custom.createdAt desc', [context.walletId], offset, limit);
    return { items: page.items.map(getTopUpView), total: page.total };
}

/**
 * Starts a top-up for the signed-in owner.
 * @param {Object} context - wallet context
 * @param {*} amount - dollars as entered
 * @returns {Object} result with topUpId and redirectUrl (where to pay)
 */
function startTopUp(context, amount) {
    if (!walletHelpers.canTopUp()) return walletHelpers.errorResult('disabled');
    var active = walletAccountHelpers.checkWalletActive(context.wallet);
    if (active.error) return active;
    var cents = walletHelpers.toCents(amount);
    if (!cents) return walletHelpers.errorResult('invalid', { amount: 'invalid' });
    if (cents < walletHelpers.getPreference('walletTopUpMinimumCents') || cents > walletHelpers.getPreference('walletTopUpMaximumCents')) return walletHelpers.errorResult('invalid', { amount: 'out-of-range' });
    var c = context.wallet.custom;
    var open = walletHelpers.queryPage('WalletTopUp', 'custom.walletId = {0} AND (custom.status = {1} OR custom.status = {2})', null, [context.walletId, 'PENDING', 'AWAITING_PAYMENT'], 0, 100).items;
    var openCents = open.reduce(function (total, t) { return total + t.custom.amountCents; }, 0);
    if ((c.availableCents || 0) + (c.heldCents || 0) + openCents + cents > walletHelpers.getPreference('walletMaximumBalanceCents')) return walletHelpers.errorResult('limit-reached', { limit: 'maximum-balance' });
    var today = walletHelpers.queryPage('WalletTopUp', 'custom.walletId = {0} AND custom.createdAt >= {1}', null, [context.walletId, walletAccountHelpers.getWindows(Date.now()).day], 0, 500).items
        .filter(function (t) { return ['FAILED', 'EXPIRED'].indexOf(t.custom.status) < 0; });
    var todayCents = today.reduce(function (total, t) { return total + t.custom.amountCents; }, 0);
    if (today.length + 1 > walletHelpers.getPreference('walletTopUpDailyCountLimit') || todayCents + cents > walletHelpers.getPreference('walletTopUpDailyAmountCents')) {
        Transaction.wrap(function () {
            walletHelpers.openCase({ caseType: 'TOPUP_VELOCITY', walletId: context.walletId, severity: 'MEDIUM', dedupeKey: 'velocity:' + context.walletId + ':' + new Date().toISOString().slice(0, 10) });
        });
        return walletHelpers.errorResult('limit-reached', { limit: 'daily-top-ups' });
    }
    if (!walletHelpers.checkRateLimit('topup-start', context.walletId, walletHelpers.getPreference('walletWriteRateLimitPerHour'), 3600)) return walletHelpers.errorResult('rate-limited');
    var id = walletHelpers.createId('TOP');
    var record;
    Transaction.wrap(function () {
        record = CustomObjectMgr.createCustomObject('WalletTopUp', id);
        record.custom.walletId = context.walletId;
        record.custom.amountCents = cents;
        record.custom.status = 'PENDING';
        record.custom.provider = walletHelpers.isSandbox() ? 'SANDBOX' : 'EXTERNAL';
        record.custom.attempts = 0;
        record.custom.createdAt = new Date();
        walletHelpers.logAudit({ entityType: 'TOPUP', entityId: id, walletId: context.walletId, action: 'START', actor: context.actor, to: 'PENDING', detail: { amountCents: cents } });
    });
    var answer = createPayment({ topUpId: id, amountCents: cents, currency: 'USD', returnUrl: URLUtils.https('Wallet-TopUpReturn', 'id', id).toString() });
    Transaction.wrap(function () {
        if (answer.status === 'REDIRECT') {
            record.custom.status = 'AWAITING_PAYMENT';
            record.custom.providerReference = answer.reference;
        } else {
            record.custom.status = 'FAILED';
            record.custom.failureReason = 'gateway-unavailable';
        }
    });
    if (answer.status !== 'REDIRECT') return walletHelpers.errorResult('unavailable');
    return { error: false, topUpId: id, redirectUrl: answer.redirectUrl };
}

/**
 * Verifies a top-up with the gateway and credits it once. Safe to call repeatedly from the
 * return page, the webhook and the reconciliation job.
 * @param {string} topUpId - top-up
 * @param {Object} by - who triggered the check
 * @returns {Object} result with the top-up status
 */
function completeTopUp(topUpId, by) {
    var record = CustomObjectMgr.getCustomObject('WalletTopUp', String(topUpId));
    if (!record) return walletHelpers.errorResult('not-found');
    var c = record.custom;
    if (['CREDITED', 'FAILED', 'REVERSED'].indexOf(c.status) >= 0) return { error: false, status: c.status };
    var answer = verifyPayment({ topUpId: topUpId, reference: c.providerReference, amountCents: c.amountCents, sandboxOutcome: c.sandboxOutcome });
    Transaction.wrap(function () {
        c.lastCheckedAt = new Date();
        c.attempts = (c.attempts || 0) + 1;
    });
    if (answer.status === 'CAPTURED') {
        if (answer.amountCents !== c.amountCents || answer.currency !== 'USD' || (answer.reference && answer.reference !== c.providerReference)) {
            log.error('Top-up {0} verification does not match the request', topUpId);
            Transaction.wrap(function () {
                walletHelpers.openCase({ caseType: 'GATEWAY_MISMATCH', walletId: c.walletId, entityId: topUpId, severity: 'CRITICAL', dedupeKey: 'mismatch:' + topUpId });
            });
            return { error: false, status: c.status };
        }
        if (!walletHelpers.canMove(TOPUP_FLOW, c.status, 'CREDITED')) return { error: false, status: c.status };
        try {
            Transaction.wrap(function () {
                var posted = walletAccountHelpers.postTransaction({ key: 'TOPUP:' + topUpId, txType: 'TOPUP', walletId: c.walletId, amountCents: c.amountCents, topUpId: topUpId, reference: c.providerReference, actor: by });
                c.status = 'CREDITED';
                c.creditedAt = new Date();
                c.journalId = posted.journal.custom.journalId;
                walletHelpers.logAudit({ entityType: 'TOPUP', entityId: topUpId, walletId: c.walletId, action: 'CREDIT', actor: by, to: 'CREDITED', detail: { amountCents: c.amountCents } });
                walletHelpers.notify(c.walletId, 'TOPUP_SUCCEEDED', { amount: walletHelpers.formatCents(c.amountCents) });
            });
        } catch (e) {
            return walletHelpers.toErrorResult(e);
        }
        log.info('Top-up {0} credited', topUpId);
    } else if (answer.status === 'FAILED' && c.status === 'AWAITING_PAYMENT') {
        Transaction.wrap(function () {
            c.status = 'FAILED';
            c.failureReason = 'declined';
            walletHelpers.logAudit({ entityType: 'TOPUP', entityId: topUpId, walletId: c.walletId, action: 'FAIL', actor: by, to: 'FAILED' });
            walletHelpers.notify(c.walletId, 'TOPUP_FAILED', { amount: walletHelpers.formatCents(c.amountCents) });
        });
    }
    return { error: false, status: c.status };
}

/**
 * Sandbox only: the owner approves or declines the simulated payment. The outcome is stored
 * server side and then verified like a real payment.
 * @param {Object} context - wallet context of the signed-in owner
 * @param {string} topUpId - top-up
 * @param {string} outcome - APPROVED | DECLINED
 * @returns {Object} result with the top-up status
 */
function decideSandboxPayment(context, topUpId, outcome) {
    if (!walletHelpers.isSandbox() || !walletHelpers.canTopUp()) return walletHelpers.errorResult('disabled');
    var record = getOwnTopUp(context, topUpId);
    if (!record) return walletHelpers.errorResult('not-found');
    if (['APPROVED', 'DECLINED'].indexOf(outcome) < 0) return walletHelpers.errorResult('invalid', { outcome: 'invalid' });
    if (record.custom.status !== 'AWAITING_PAYMENT') return { error: false, status: record.custom.status };
    Transaction.wrap(function () { record.custom.sandboxOutcome = outcome; });
    return completeTopUp(topUpId, context.actor);
}

/**
 * Chargeback or provider reversal of a credited top-up. Takes back what is still available;
 * a shortfall is recorded, the wallet is locked and a case is opened. Applied once.
 * @param {string} topUpId - top-up
 * @param {number} amountCents - reversed amount
 * @param {string} reference - provider reference (must match for provider calls)
 * @param {Object} by - provider or admin
 * @returns {Object} result with reversedCents and shortfallCents
 */
function reverseTopUp(topUpId, amountCents, reference, by) {
    var record = CustomObjectMgr.getCustomObject('WalletTopUp', String(topUpId));
    if (!record) return walletHelpers.errorResult('not-found');
    var c = record.custom;
    if (by.type === 'PROVIDER' && c.providerReference !== reference) return walletHelpers.errorResult('conflict');
    if (!walletAccountHelpers.isCents(amountCents) || amountCents <= 0 || amountCents > c.amountCents) return walletHelpers.errorResult('invalid', { amountCents: 'invalid' });
    if (c.status === 'REVERSED') return { error: false, reversedCents: c.reversedCents || 0, shortfallCents: c.shortfallCents || 0 };
    if (!walletHelpers.canMove(TOPUP_FLOW, c.status, 'REVERSED')) return walletHelpers.errorResult('not-allowed-now');
    var wallet = CustomObjectMgr.getCustomObject('WalletAccount', c.walletId);
    var reversed = Math.min(amountCents, wallet.custom.availableCents || 0);
    var shortfall = amountCents - reversed;
    try {
        Transaction.wrap(function () {
            if (reversed > 0) walletAccountHelpers.postTransaction({ key: 'REVERSAL:' + topUpId, txType: 'REVERSAL', walletId: c.walletId, amountCents: reversed, topUpId: topUpId, reference: reference, actor: by });
            c.status = 'REVERSED';
            c.reversedCents = reversed;
            c.shortfallCents = shortfall;
            c.reversedAt = new Date();
            wallet.custom.shortfallCents = (wallet.custom.shortfallCents || 0) + shortfall;
            walletHelpers.logAudit({ entityType: 'TOPUP', entityId: topUpId, walletId: c.walletId, action: 'REVERSE', actor: by, to: 'REVERSED', detail: { amountCents: amountCents, shortfallCents: shortfall } });
            walletHelpers.openCase({
                caseType: shortfall > 0 ? 'CHARGEBACK_SHORTFALL' : 'CHARGEBACK', walletId: c.walletId, entityId: topUpId,
                severity: shortfall > 0 ? 'CRITICAL' : 'HIGH', detail: { amountCents: amountCents, shortfallCents: shortfall }, dedupeKey: 'chargeback:' + topUpId
            });
            walletHelpers.notify(c.walletId, 'TOPUP_REVERSED', { amount: walletHelpers.formatCents(amountCents) });
        });
    } catch (e) {
        return walletHelpers.toErrorResult(e);
    }
    // A chargeback locks the wallet until a reviewer has looked at it.
    if (wallet.custom.status === 'ACTIVE') walletAccountHelpers.setWalletStatus(wallet, 'LOCKED', 'chargeback', by);
    return { error: false, reversedCents: reversed, shortfallCents: shortfall };
}

/**
 * Job helper: verifies open top-ups and expires stale ones (late captures are still credited).
 * @param {number} limit - maximum top-ups
 * @returns {{checked: number, credited: number, expired: number, failed: number}} counts
 */
function reconcileTopUps(limit) {
    var counts = { checked: 0, credited: 0, expired: 0, failed: 0 };
    var cutoff = Date.now() - walletHelpers.getPreference('walletTopUpPendingMinutes') * 60000;
    var lateWindow = new Date(Date.now() - 7 * walletAccountHelpers.DAY);
    var by = walletHelpers.actor('SYSTEM', 'topup-reconcile');
    walletHelpers.queryPage('WalletTopUp', 'custom.status = {0} OR custom.status = {1} OR (custom.status = {2} AND custom.createdAt >= {3})', 'custom.createdAt asc', ['AWAITING_PAYMENT', 'PENDING', 'EXPIRED', lateWindow], 0, limit).items.forEach(function (t) {
        var c = t.custom;
        counts.checked += 1;
        if (c.status === 'PENDING' && c.createdAt.getTime() < cutoff) {
            Transaction.wrap(function () {
                c.status = 'FAILED';
                c.failureReason = 'not-started';
            });
            counts.failed += 1;
            return;
        }
        var result = completeTopUp(c.topUpId, by);
        if (result.error) {
            log.error('Top-up {0} reconciliation failed: {1}', c.topUpId, result.errorCode);
        } else if (result.status === 'CREDITED') {
            counts.credited += 1;
        } else if (result.status === 'AWAITING_PAYMENT' && c.createdAt.getTime() < cutoff) {
            Transaction.wrap(function () { c.status = 'EXPIRED'; });
            counts.expired += 1;
        }
    });
    return counts;
}

module.exports = {
    TOPUP_FLOW: TOPUP_FLOW,
    getTopUpView: getTopUpView,
    getOwnTopUp: getOwnTopUp,
    getTopUps: getTopUps,
    startTopUp: startTopUp,
    completeTopUp: completeTopUp,
    decideSandboxPayment: decideSandboxPayment,
    reverseTopUp: reverseTopUp,
    reconcileTopUps: reconcileTopUps
};
