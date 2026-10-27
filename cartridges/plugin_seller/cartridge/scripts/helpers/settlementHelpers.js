'use strict';

/**
 * Settlements: a seller's available ledger entries grouped into one payable statement.
 * SFCC does not move money. A payout provider (or a person, in MANUAL mode) pays the seller
 * and the result comes back through the webhook or Business Manager; a PAYOUT ledger entry
 * is booked only when the payout is confirmed.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Site = require('dw/system/Site');
var Logger = require('dw/system/Logger');
var marketplaceHelpers = require('*/cartridge/scripts/helpers/marketplaceHelpers');
var sellerOrderHelpers = require('*/cartridge/scripts/helpers/sellerOrderHelpers');

var log = Logger.getLogger('plugin-seller', 'seller-finance');
var MAX_ENTRIES = 2000;
var SETTLEMENT_FLOW = {
    OPEN: ['PAYOUT_REQUESTED', 'ON_HOLD', 'CANCELLED'],
    ON_HOLD: ['OPEN', 'CANCELLED'],
    PAYOUT_REQUESTED: ['PAID', 'PAYOUT_FAILED'],
    PAYOUT_FAILED: ['PAYOUT_REQUESTED', 'ON_HOLD'],
    PAID: [],
    CANCELLED: []
};
var TOTAL_FIELDS = { SALE: 'grossCents', SHIPPING: 'shippingCents', COMMISSION: 'commissionCents', ORDER_FEE: 'feeCents', REFUND: 'refundCents', COMMISSION_REVERSAL: 'reversalCents', ADJUSTMENT: 'adjustmentCents' };

/**
 * @param {dw.object.CustomObject[]} entries - ledger entries
 * @returns {Object} totals by entry type, plus netCents (payouts excluded)
 */
function getTotals(entries) {
    var sum = { grossCents: 0, shippingCents: 0, commissionCents: 0, feeCents: 0, refundCents: 0, reversalCents: 0, adjustmentCents: 0, netCents: 0 };
    entries.forEach(function (e) {
        var field = TOTAL_FIELDS[e.custom.entryType];
        if (field) sum[field] += e.custom.amountCents;
        if (e.custom.entryType !== 'PAYOUT') sum.netCents += e.custom.amountCents;
    });
    return sum;
}

/**
 * @param {string} settlementId - settlement
 * @returns {dw.object.CustomObject[]} its ledger entries
 */
function getSettlementEntries(settlementId) {
    return marketplaceHelpers.queryPage('MarketplaceLedgerEntry', 'custom.settlementId = {0}', 'custom.createdAt asc', [settlementId], 0, MAX_ENTRIES + 1).items;
}

/**
 * Creates at most one open settlement per seller from its available, unsettled entries. A
 * net amount under the minimum (or negative, after refunds) carries over.
 * @param {string} sellerId - seller
 * @returns {?string} new settlement ID
 */
function createSettlement(sellerId) {
    var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', String(sellerId));
    if (!seller || ['APPROVED', 'SUSPENDED', 'TERMINATED'].indexOf(seller.custom.status) < 0) return null;
    if (marketplaceHelpers.queryCount('MarketplaceSettlement', 'custom.sellerId = {0} AND (custom.status = {1} OR custom.status = {2} OR custom.status = {3})', [sellerId, 'OPEN', 'PAYOUT_REQUESTED', 'PAYOUT_FAILED']) > 0) return null;
    var now = new Date();
    var entries = marketplaceHelpers.queryPage('MarketplaceLedgerEntry', 'custom.sellerId = {0} AND custom.settlementId = NULL AND custom.availableOn <= {1}', 'custom.createdAt asc', [sellerId, now], 0, MAX_ENTRIES).items;
    if (!entries.length) return null;
    var sum = getTotals(entries);
    if (sum.netCents <= 0 || sum.netCents < Site.getCurrent().getCustomPreferenceValue('sellerSettlementMinimumCents')) return null;
    var verified = seller.custom.bankStatus === 'VERIFIED';
    var settlement;
    Transaction.wrap(function () {
        settlement = CustomObjectMgr.createCustomObject('MarketplaceSettlement', marketplaceHelpers.createId('STL'));
        var c = settlement.custom;
        entries.forEach(function (e) {
            // The settlement job never runs in parallel; this only trips on a programming error.
            if (e.custom.settlementId) throw new Error('entry-settled');
            e.custom.settlementId = c.settlementId;
        });
        c.sellerId = sellerId;
        c.status = verified ? 'OPEN' : 'ON_HOLD';
        c.statusReason = verified ? null : 'payout-account-not-verified';
        c.periodStart = entries[0].custom.createdAt;
        c.periodEnd = now;
        Object.keys(sum).forEach(function (field) { c[field] = sum[field]; });
        c.entryCount = entries.length;
        c.currency = 'USD';
        c.createdAt = now;
        c.revision = 0;
        marketplaceHelpers.logAudit({ entityType: 'SETTLEMENT', entityId: c.settlementId, sellerId: sellerId, action: 'CREATE', actor: marketplaceHelpers.actor('SYSTEM', 'settlement'), detail: { netCents: sum.netCents, entries: entries.length } });
        marketplaceHelpers.notify(sellerId, 'SETTLEMENT_CREATED', { settlementId: c.settlementId, amount: marketplaceHelpers.formatCents(sum.netCents) });
    });
    log.info('Settlement {0} created for {1}: {2} cents', settlement.custom.settlementId, sellerId, sum.netCents);
    return settlement.custom.settlementId;
}

/**
 * Releases a held settlement once the payout account is verified.
 * @param {string} settlementId - settlement
 * @param {Object} by - admin actor
 * @returns {Object} result
 */
function releaseSettlement(settlementId, by) {
    var settlement = CustomObjectMgr.getCustomObject('MarketplaceSettlement', String(settlementId));
    if (!settlement) return marketplaceHelpers.errorResult('not-found');
    var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', settlement.custom.sellerId);
    if (!seller || seller.custom.bankStatus !== 'VERIFIED') return marketplaceHelpers.errorResult('invalid', { payoutAccount: 'not-verified' });
    if (!marketplaceHelpers.canMove(SETTLEMENT_FLOW, settlement.custom.status, 'OPEN')) return marketplaceHelpers.errorResult('not-allowed-now');
    Transaction.wrap(function () {
        settlement.custom.status = 'OPEN';
        settlement.custom.statusReason = null;
        marketplaceHelpers.logAudit({ entityType: 'SETTLEMENT', entityId: settlementId, sellerId: settlement.custom.sellerId, action: 'RELEASE', actor: by, from: 'ON_HOLD', to: 'OPEN' });
    });
    return { error: false };
}

/**
 * Asks the payout provider to pay an open settlement. The provider call runs outside any
 * transaction; the status is saved before and after it.
 * @param {string} settlementId - settlement
 * @param {Object} by - admin or job actor
 * @returns {Object} result with status
 */
function requestPayout(settlementId, by) {
    var settlement = CustomObjectMgr.getCustomObject('MarketplaceSettlement', String(settlementId));
    if (!settlement) return marketplaceHelpers.errorResult('not-found');
    var c = settlement.custom;
    var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', c.sellerId);
    if (!seller || seller.custom.bankStatus !== 'VERIFIED') return marketplaceHelpers.errorResult('invalid', { payoutAccount: 'not-verified' });
    var from = c.status;
    if (!marketplaceHelpers.canMove(SETTLEMENT_FLOW, from, 'PAYOUT_REQUESTED')) return marketplaceHelpers.errorResult('not-allowed-now');
    Transaction.wrap(function () {
        c.status = 'PAYOUT_REQUESTED';
        c.payoutRequestedAt = new Date();
        c.payoutRequestedBy = by.ref;
        marketplaceHelpers.logAudit({ entityType: 'SETTLEMENT', entityId: settlementId, sellerId: c.sellerId, action: 'PAYOUT_REQUESTED', actor: by, from: from, to: 'PAYOUT_REQUESTED' });
    });
    var answer = require('*/cartridge/scripts/helpers/sellerHelpers').callProvider('payout', [{ settlementId: settlementId, sellerId: c.sellerId, payoutReference: seller.custom.bankReference, amountCents: c.netCents, currency: 'USD' }]);
    Transaction.wrap(function () {
        if (answer.status === 'SUBMITTED') {
            c.payoutReference = answer.reference;
        } else if (answer.status === 'FAILED' || answer.status === 'ERROR') {
            c.status = 'PAYOUT_FAILED';
            c.statusReason = answer.status === 'ERROR' ? 'provider-error' : 'provider-declined';
            require('*/cartridge/scripts/helpers/caseHelpers').openCase({ caseType: 'INTEGRATION_FAILURE', sellerId: c.sellerId, entityId: settlementId, severity: 'HIGH', detail: { provider: 'payout' }, dedupeKey: 'payout:' + settlementId });
        }
    });
    return { error: false, status: c.status };
}

/**
 * Confirms a payout (provider webhook, or a reviewer in MANUAL mode) and books it.
 * @param {string} settlementId - settlement
 * @param {string} outcome - PAID | FAILED
 * @param {string} reference - provider or bank reference
 * @param {Object} by - provider or admin actor
 * @returns {Object} result
 */
function recordPayoutResult(settlementId, outcome, reference, by) {
    var settlement = CustomObjectMgr.getCustomObject('MarketplaceSettlement', String(settlementId));
    if (!settlement) return marketplaceHelpers.errorResult('not-found');
    var c = settlement.custom;
    var ref = String(reference || '').trim();
    if (['PAID', 'FAILED'].indexOf(outcome) < 0) return marketplaceHelpers.errorResult('invalid', { result: 'invalid' });
    if (!/^[A-Za-z0-9._:-]{3,128}$/.test(ref)) return marketplaceHelpers.errorResult('invalid', { reference: 'invalid' });
    if (by.type === 'PROVIDER' && c.payoutReference && c.payoutReference !== ref) return marketplaceHelpers.errorResult('conflict');
    if (c.status === 'PAID' && outcome === 'PAID') return { error: false };
    var from = c.status;
    var to = outcome === 'PAID' ? 'PAID' : 'PAYOUT_FAILED';
    if (!marketplaceHelpers.canMove(SETTLEMENT_FLOW, from, to)) return marketplaceHelpers.errorResult('not-allowed-now');
    Transaction.wrap(function () {
        c.status = to;
        c.payoutReference = ref;
        if (to === 'PAID') {
            c.paidAt = new Date();
            sellerOrderHelpers.postLedgerEntries([{ key: settlementId + ':PAYOUT', sellerId: c.sellerId, entryType: 'PAYOUT', amountCents: -c.netCents, settlementId: settlementId, availableOn: new Date(), sourceRef: ref, description: 'Payout ' + settlementId }]);
        } else {
            c.statusReason = 'payout-failed';
        }
        marketplaceHelpers.logAudit({ entityType: 'SETTLEMENT', entityId: settlementId, sellerId: c.sellerId, action: 'PAYOUT_' + outcome, actor: by, from: from, to: to });
        marketplaceHelpers.notify(c.sellerId, to === 'PAID' ? 'PAYOUT_SENT' : 'PAYOUT_FAILED', { settlementId: settlementId, amount: marketplaceHelpers.formatCents(c.netCents) });
    });
    return { error: false };
}

/**
 * Cancels a settlement created in error; its entries return to the open pool.
 * @param {string} settlementId - settlement
 * @param {string} reason - reason
 * @param {Object} by - admin actor
 * @returns {Object} result
 */
function cancelSettlement(settlementId, reason, by) {
    var settlement = CustomObjectMgr.getCustomObject('MarketplaceSettlement', String(settlementId));
    if (!settlement) return marketplaceHelpers.errorResult('not-found');
    var text = marketplaceHelpers.cleanText(reason);
    if (text.length < 5) return marketplaceHelpers.errorResult('invalid', { reason: 'required' });
    var from = settlement.custom.status;
    if (!marketplaceHelpers.canMove(SETTLEMENT_FLOW, from, 'CANCELLED')) return marketplaceHelpers.errorResult('not-allowed-now');
    var entries = getSettlementEntries(settlementId);
    Transaction.wrap(function () {
        entries.forEach(function (e) { e.custom.settlementId = null; });
        settlement.custom.status = 'CANCELLED';
        settlement.custom.statusReason = text.slice(0, 500);
        marketplaceHelpers.logAudit({ entityType: 'SETTLEMENT', entityId: settlementId, sellerId: settlement.custom.sellerId, action: 'CANCEL', actor: by, from: from, to: 'CANCELLED', reason: text });
    });
    return { error: false };
}

/**
 * Checks that a settlement still equals the sum of its entries and, once paid, that the
 * payout entry matches. A mismatch opens a case.
 * @param {dw.object.CustomObject} settlement - settlement
 * @returns {string} MATCHED | MISMATCH
 */
function reconcileSettlement(settlement) {
    var c = settlement.custom;
    var entries = getSettlementEntries(c.settlementId);
    var sum = getTotals(entries);
    var payouts = entries.filter(function (e) { return e.custom.entryType === 'PAYOUT'; });
    var ok = sum.netCents === c.netCents && entries.length - payouts.length === c.entryCount;
    if (c.status === 'PAID') ok = ok && payouts.length === 1 && payouts[0].custom.amountCents === -c.netCents;
    Transaction.wrap(function () {
        c.reconciliationStatus = ok ? 'MATCHED' : 'MISMATCH';
        c.reconciledAt = new Date();
        if (!ok) require('*/cartridge/scripts/helpers/caseHelpers').openCase({ caseType: 'RECONCILIATION_MISMATCH', sellerId: c.sellerId, entityId: c.settlementId, severity: 'CRITICAL', detail: { expectedCents: c.netCents, ledgerCents: sum.netCents }, dedupeKey: 'recon:' + c.settlementId });
    });
    if (!ok) log.error('Settlement {0} does not reconcile', c.settlementId);
    return c.reconciliationStatus;
}

/**
 * @param {dw.object.CustomObject} settlement - settlement
 * @returns {Object} settlement view
 */
function getSettlementView(settlement) {
    var c = settlement.custom;
    return {
        settlementId: c.settlementId,
        status: c.status,
        statusReason: c.statusReason || null,
        periodStart: c.periodStart,
        periodEnd: c.periodEnd,
        grossCents: c.grossCents,
        shippingCents: c.shippingCents,
        commissionCents: c.commissionCents,
        feeCents: c.feeCents,
        refundCents: c.refundCents,
        reversalCents: c.reversalCents,
        adjustmentCents: c.adjustmentCents,
        netCents: c.netCents,
        entryCount: c.entryCount,
        payoutReference: c.payoutReference || null,
        paidAt: c.paidAt || null,
        reconciliationStatus: c.reconciliationStatus || null
    };
}

/**
 * @param {string} sellerId - seller
 * @param {number} offset - rows to skip
 * @param {number} limit - page size
 * @returns {{items: Object[], total: number}} the seller's settlements
 */
function getSellerSettlements(sellerId, offset, limit) {
    var page = marketplaceHelpers.queryPage('MarketplaceSettlement', 'custom.sellerId = {0}', 'custom.createdAt desc', [sellerId], offset, limit);
    return { items: page.items.map(getSettlementView), total: page.total };
}

/**
 * @param {string} sellerId - seller (ownership check)
 * @param {string} settlementId - settlement
 * @returns {?Object} the statement with its entries, or null when it is not the seller's
 */
function getStatement(sellerId, settlementId) {
    var settlement = CustomObjectMgr.getCustomObject('MarketplaceSettlement', String(settlementId));
    if (!settlement || settlement.custom.sellerId !== sellerId) return null;
    var statement = getSettlementView(settlement);
    statement.entries = getSettlementEntries(settlementId).map(sellerOrderHelpers.getEntryView);
    return statement;
}

module.exports = {
    getTotals: getTotals,
    createSettlement: createSettlement,
    releaseSettlement: releaseSettlement,
    requestPayout: requestPayout,
    recordPayoutResult: recordPayoutResult,
    cancelSettlement: cancelSettlement,
    reconcileSettlement: reconcileSettlement,
    getSettlementView: getSettlementView,
    getSellerSettlements: getSellerSettlements,
    getStatement: getStatement
};
