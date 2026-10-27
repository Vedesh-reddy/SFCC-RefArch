'use strict';

/**
 * Job steps of the marketplace. Every step is bounded by a MaxItems parameter, resumes from
 * records or MarketplaceJobState, can be repeated without double effects, and reports its
 * counts in the step status and log.
 */

var Status = require('dw/system/Status');
var Logger = require('dw/system/Logger');
var Site = require('dw/system/Site');
var Transaction = require('dw/system/Transaction');
var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var marketplaceHelpers = require('*/cartridge/scripts/helpers/marketplaceHelpers');

var log = Logger.getLogger('plugin-seller', 'seller-jobs');

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
 * @returns {dw.system.Status} OK, or ERROR when the step threw or reported failures
 */
function run(name, fn) {
    if (!marketplaceHelpers.isMarketplaceEnabled()) {
        log.info('{0}: marketplace disabled, nothing to do', name);
        return new Status(Status.OK, 'DISABLED', 'Marketplace disabled');
    }
    try {
        var counts = fn() || {};
        var summary = JSON.stringify(counts);
        log.info('{0}: {1}', name, summary);
        return counts.failed > 0 ? new Status(Status.ERROR, 'PARTIAL', summary) : new Status(Status.OK, 'OK', summary);
    } catch (e) {
        log.error('{0} failed: {1}', name, e.message);
        return new Status(Status.ERROR, 'ERROR', e.message);
    }
}

/**
 * @returns {boolean} whether payouts go through the external provider hook
 */
function isExternalPayout() {
    return require('*/cartridge/scripts/helpers/sellerHelpers').getEnumPreference('sellerPayoutProvider') === 'EXTERNAL';
}

exports.provisionPrepare = function (params) {
    return run('provision-prepare', function () {
        return require('*/cartridge/scripts/helpers/catalogImportHelpers').preparePublishing(maxItems(params, 50));
    });
};

exports.provisionVerify = function (params) {
    return run('provision-verify', function () {
        return require('*/cartridge/scripts/helpers/catalogImportHelpers').verifyPublishing(maxItems(params, 200));
    });
};

exports.syncPrepare = function (params) {
    return run('sync-prepare', function () {
        return require('*/cartridge/scripts/helpers/catalogImportHelpers').prepareOfferSync(maxItems(params, 1000));
    });
};

exports.syncConfirm = function () {
    return run('sync-confirm', function () {
        return require('*/cartridge/scripts/helpers/catalogImportHelpers').confirmOfferSync();
    });
};

/**
 * Creates and advances seller orders from orders modified since the stored watermark,
 * then closes seller orders past their return window and books deferred earnings.
 * @param {Object} params - job step parameters
 * @returns {dw.system.Status} step status
 */
exports.orderSync = function (params) {
    return run('order-sync', function () {
        var OrderMgr = require('dw/order/OrderMgr');
        var Order = require('dw/order/Order');
        var orderHelpers = require('*/cartridge/scripts/helpers/sellerOrderHelpers');
        var limit = maxItems(params, 500);
        var state = marketplaceHelpers.getJobState('order-sync');
        var since = state.watermark ? new Date(state.watermark) : new Date(Date.now() - Site.getCurrent().getCustomPreferenceValue('sellerOrderSyncLookbackHours') * 3600000);
        // A small overlap covers the asynchronous order search index; reprocessing is harmless.
        since = new Date(since.getTime() - 5 * 60000);
        var counts = { orders: 0, created: 0, updated: 0, missingRule: 0, closed: 0, rebooked: 0, failed: 0 };
        var rules = orderHelpers.getActiveRules(new Date());
        var watermark = state.watermark ? new Date(state.watermark) : since;
        var iterator = OrderMgr.searchOrders('lastModified >= {0} AND status != {1}', 'lastModified asc', since, Order.ORDER_STATUS_CREATED);
        try {
            while (iterator.hasNext() && counts.orders < limit) {
                var order = iterator.next();
                counts.orders += 1;
                try {
                    var result = orderHelpers.syncOrder(order, rules);
                    counts.created += result.created;
                    counts.updated += result.updated;
                    counts.missingRule += result.missingRule;
                } catch (e) {
                    counts.failed += 1;
                    log.error('Order {0} sync failed: {1}', order.orderNo, e.message);
                }
                if (order.lastModified > watermark) watermark = order.lastModified;
            }
        } finally {
            iterator.close();
        }
        marketplaceHelpers.saveJobState('order-sync', { watermark: watermark.toISOString() });
        counts.closed = orderHelpers.closeFinishedOrders(limit);
        counts.rebooked = orderHelpers.bookMissedEarnings(limit);
        return counts;
    });
};

/**
 * Creates settlements for sellers with available earnings and, when AutoRequestPayout is
 * true, asks the payout provider to pay open settlements.
 * @param {Object} params - job step parameters
 * @returns {dw.system.Status} step status
 */
exports.settlements = function (params) {
    return run('settlements', function () {
        var settlementHelpers = require('*/cartridge/scripts/helpers/settlementHelpers');
        var limit = maxItems(params, 200);
        var counts = { sellers: 0, created: 0, payouts: 0, failed: 0 };
        var sellerIds = [];
        var iterator = CustomObjectMgr.queryCustomObjects('MarketplaceLedgerEntry', 'custom.settlementId = NULL AND custom.availableOn <= {0}', 'custom.sellerId asc', new Date());
        try {
            var scanned = 0;
            while (iterator.hasNext() && sellerIds.length < limit && scanned < limit * 50) {
                var sellerId = iterator.next().custom.sellerId;
                scanned += 1;
                if (sellerIds.indexOf(sellerId) < 0) sellerIds.push(sellerId);
            }
        } finally {
            iterator.close();
        }
        sellerIds.forEach(function (id) {
            counts.sellers += 1;
            try {
                if (settlementHelpers.createSettlement(id)) counts.created += 1;
            } catch (e) {
                counts.failed += 1;
                log.error('Settlement for {0} failed: {1}', id, e.message);
            }
        });
        if (String(params && params.AutoRequestPayout) === 'true' && isExternalPayout()) {
            marketplaceHelpers.queryPage('MarketplaceSettlement', 'custom.status = {0}', 'custom.createdAt asc', ['OPEN'], 0, limit).items.forEach(function (s) {
                var result = settlementHelpers.requestPayout(s.custom.settlementId, marketplaceHelpers.actor('SYSTEM', 'settlement-job'));
                if (result.error) {
                    counts.failed += 1;
                    log.error('Payout request for {0} failed: {1}', s.custom.settlementId, result.errorCode);
                } else {
                    counts.payouts += 1;
                }
            });
        }
        return counts;
    });
};

exports.reconcile = function (params) {
    return run('reconcile', function () {
        var settlementHelpers = require('*/cartridge/scripts/helpers/settlementHelpers');
        var counts = { checked: 0, mismatches: 0 };
        marketplaceHelpers.queryPage('MarketplaceSettlement', 'custom.status != {0} AND (custom.reconciliationStatus = NULL OR custom.status = {1})', 'custom.createdAt asc', ['CANCELLED', 'PAID'], 0, maxItems(params, 200)).items.filter(function (s) {
            var c = s.custom;
            return !(c.status === 'PAID' && c.reconciliationStatus === 'MATCHED' && c.reconciledAt && c.paidAt && c.reconciledAt > c.paidAt);
        }).forEach(function (s) {
            counts.checked += 1;
            if (settlementHelpers.reconcileSettlement(s) === 'MISMATCH') counts.mismatches += 1;
        });
        return counts;
    });
};

exports.performance = function (params) {
    return run('performance', function () {
        var orderHelpers = require('*/cartridge/scripts/helpers/sellerOrderHelpers');
        var limit = maxItems(params, 200);
        var cursor = marketplaceHelpers.getJobState('performance').cursor || '';
        var counts = { evaluated: 0, breaches: 0, failed: 0 };
        var last = cursor;
        marketplaceHelpers.queryPage('MarketplaceSeller', 'custom.status = {0} AND custom.sellerId > {1}', 'custom.sellerId asc', ['APPROVED', cursor], 0, limit).items.forEach(function (seller) {
            last = seller.custom.sellerId;
            try {
                if (orderHelpers.evaluatePerformance(seller).breaches.length) counts.breaches += 1;
                counts.evaluated += 1;
            } catch (e) {
                counts.failed += 1;
                log.error('Performance of {0} failed: {1}', seller.custom.sellerId, e.message);
            }
        });
        // The cursor wraps around once every approved seller has been evaluated.
        marketplaceHelpers.saveJobState('performance', { cursor: counts.evaluated + counts.failed < limit ? '' : last });
        return counts;
    });
};

exports.notifications = function (params) {
    return run('notifications', function () {
        return marketplaceHelpers.deliverNotifications(maxItems(params, 500));
    });
};

/**
 * One admin reminder per run when sellers, submissions or offers wait longer than
 * sellerApprovalReminderHours.
 * @returns {dw.system.Status} step status
 */
exports.reminders = function () {
    return run('reminders', function () {
        var before = new Date(Date.now() - Site.getCurrent().getCustomPreferenceValue('sellerApprovalReminderHours') * 3600000);
        var sellers = marketplaceHelpers.queryCount('MarketplaceSeller', '(custom.status = {0} OR custom.status = {1}) AND custom.submittedAt <= {2}', ['PENDING_VERIFICATION', 'PENDING_APPROVAL', before]);
        var submissions = marketplaceHelpers.queryCount('MarketplaceSubmission', '(custom.status = {0} OR custom.status = {1}) AND custom.submittedAt <= {2}', ['SUBMITTED', 'UNDER_REVIEW', before]);
        var offers = marketplaceHelpers.queryCount('MarketplaceOffer', 'custom.reviewState = {0} AND custom.updatedAt <= {1}', ['PENDING', before]);
        if (sellers + submissions + offers > 0) {
            Transaction.wrap(function () {
                marketplaceHelpers.notify(marketplaceHelpers.ADMIN, 'ADMIN_REVIEW_REMINDER', { sellers: String(sellers), submissions: String(submissions), offers: String(offers) });
            });
        }
        return { sellers: sellers, submissions: submissions, offers: offers };
    });
};

exports.documentExpiry = function (params) {
    return run('document-expiry', function () {
        return require('*/cartridge/scripts/helpers/sellerDocumentHelpers').processExpiringDocuments(maxItems(params, 500));
    });
};

/**
 * Retries identity verification that failed at the provider, and opens a case for payout
 * requests the provider has not answered within StalePayoutHours.
 * @param {Object} params - job step parameters
 * @returns {dw.system.Status} step status
 */
exports.recovery = function (params) {
    return run('recovery', function () {
        var sellerHelpers = require('*/cartridge/scripts/helpers/sellerHelpers');
        var limit = maxItems(params, 100);
        var staleHours = Number(params && params.StalePayoutHours) > 0 ? Number(params.StalePayoutHours) : 48;
        var counts = { kycRetried: 0, stalePayouts: 0, failed: 0 };
        marketplaceHelpers.queryPage('MarketplaceSeller', 'custom.status = {0} AND custom.kycStatus = {1}', null, ['PENDING_VERIFICATION', 'ERROR'], 0, limit).items.forEach(function (s) {
            var answer = sellerHelpers.callProvider('kyc', [sellerHelpers.getProviderData(s)]);
            var kycStatus = { MANUAL: 'MANUAL_REVIEW', SUBMITTED: 'PENDING', REDIRECT: 'PENDING' }[answer.status];
            if (!kycStatus) {
                counts.failed += 1;
                return;
            }
            Transaction.wrap(function () {
                s.custom.kycStatus = kycStatus;
                s.custom.kycReference = answer.reference;
            });
            counts.kycRetried += 1;
        });
        if (isExternalPayout()) {
            var before = new Date(Date.now() - staleHours * 3600000);
            marketplaceHelpers.queryPage('MarketplaceSettlement', 'custom.status = {0} AND custom.payoutRequestedAt <= {1}', null, ['PAYOUT_REQUESTED', before], 0, limit).items.forEach(function (s) {
                Transaction.wrap(function () {
                    require('*/cartridge/scripts/helpers/caseHelpers').openCase({
                        caseType: 'INTEGRATION_FAILURE', sellerId: s.custom.sellerId, entityId: s.custom.settlementId, severity: 'HIGH',
                        detail: { provider: 'payout', reason: 'no-result' }, dedupeKey: 'payout-stale:' + s.custom.settlementId
                    });
                });
                counts.stalePayouts += 1;
            });
        }
        return counts;
    });
};

/**
 * Removes expired rate buckets, old request keys and used codes, and purges documents
 * whose retention ended.
 * @param {Object} params - job step parameters
 * @returns {dw.system.Status} step status
 */
exports.cleanup = function (params) {
    return run('cleanup', function () {
        var limit = maxItems(params, 1000);
        var now = new Date();
        var removeWhere = function (type, query, args) {
            var records = marketplaceHelpers.queryPage(type, query, null, args, 0, limit).items;
            records.forEach(function (r) {
                Transaction.wrap(function () { CustomObjectMgr.remove(r); });
            });
            return records.length;
        };
        return {
            buckets: removeWhere('MarketplaceRateBucket', 'custom.expiresAt <= {0}', [now]),
            requestKeys: removeWhere('MarketplaceRequestKey', 'custom.createdAt <= {0}', [new Date(now.getTime() - Site.getCurrent().getCustomPreferenceValue('sellerRequestKeyRetentionDays') * 86400000)]),
            otps: removeWhere('MarketplaceOtp', 'custom.expiresAt <= {0}', [new Date(now.getTime() - 86400000)]),
            documents: require('*/cartridge/scripts/helpers/sellerDocumentHelpers').purgeExpiredFiles(limit)
        };
    });
};
