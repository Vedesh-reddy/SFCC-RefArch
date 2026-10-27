'use strict';

/**
 * Trust and safety cases: listing reports from shoppers, seller cancellations and every
 * automatic flag (duplicates, suspicious prices, failed publishing, missing commission
 * rules, reconciliation mismatches). Worked in Business Manager; some are shown to the seller.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Site = require('dw/system/Site');
var marketplaceHelpers = require('*/cartridge/scripts/helpers/marketplaceHelpers');

var CASE_TYPES = ['DUPLICATE_SELLER', 'DUPLICATE_LISTING', 'SUSPICIOUS_PRICE', 'RESTRICTED_CATEGORY', 'INVENTORY_MISMATCH',
    'PERFORMANCE_BREACH', 'DOCUMENT_EXPIRED', 'COUNTERFEIT_REPORT', 'CUSTOMER_ISSUE', 'PROVISIONING_FAILED',
    'INTEGRATION_FAILURE', 'SELLER_CANCELLATION', 'COMMISSION_RULE_MISSING', 'RECONCILIATION_MISMATCH'];
var SELLER_VISIBLE = ['SUSPICIOUS_PRICE', 'RESTRICTED_CATEGORY', 'INVENTORY_MISMATCH', 'PERFORMANCE_BREACH',
    'DOCUMENT_EXPIRED', 'COUNTERFEIT_REPORT', 'CUSTOMER_ISSUE', 'SELLER_CANCELLATION', 'DUPLICATE_LISTING'];
var CASE_FLOW = {
    OPEN: ['IN_PROGRESS', 'RESOLVED', 'DISMISSED'],
    IN_PROGRESS: ['OPEN', 'RESOLVED', 'DISMISSED'],
    RESOLVED: [],
    DISMISSED: []
};
var MAX_MESSAGES = 50;

/**
 * Opens a case unless an open one with the same dedupe key exists. Call inside a transaction.
 * @param {Object} input - {caseType, sellerId, entityId, productId, orderNo, severity, detail, dedupeKey, description, reporterCustomerNo}
 * @returns {dw.object.CustomObject} case
 */
function openCase(input) {
    if (input.dedupeKey) {
        var existing = marketplaceHelpers.queryPage('MarketplaceCase', 'custom.dedupeKey = {0} AND (custom.status = {1} OR custom.status = {2})', null, [input.dedupeKey, 'OPEN', 'IN_PROGRESS'], 0, 1).items[0];
        if (existing) return existing;
    }
    var now = new Date();
    var record = CustomObjectMgr.createCustomObject('MarketplaceCase', marketplaceHelpers.createId('CASE'));
    var c = record.custom;
    c.caseType = input.caseType;
    c.status = 'OPEN';
    c.severity = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].indexOf(input.severity) >= 0 ? input.severity : 'MEDIUM';
    c.sellerId = input.sellerId || null;
    c.entityId = input.entityId ? String(input.entityId) : null;
    c.productId = input.productId || null;
    c.orderNo = input.orderNo || null;
    c.reporterCustomerNo = input.reporterCustomerNo || null;
    c.dedupeKey = input.dedupeKey || null;
    c.detail = JSON.stringify(input.detail || {});
    c.thread = JSON.stringify(input.description ? [{ at: now.toISOString(), by: 'SHOPPER', text: input.description }] : []);
    c.visibleToSeller = SELLER_VISIBLE.indexOf(input.caseType) >= 0;
    c.createdAt = now;
    c.updatedAt = now;
    c.revision = 0;
    marketplaceHelpers.logAudit({ entityType: 'CASE', entityId: c.caseId, sellerId: c.sellerId, action: 'OPEN', actor: marketplaceHelpers.actor('SYSTEM', input.caseType), to: 'OPEN' });
    if (c.visibleToSeller && c.sellerId) marketplaceHelpers.notify(c.sellerId, 'CASE_OPENED', { caseId: c.caseId, caseType: c.caseType });
    return record;
}

/**
 * @param {dw.object.CustomObject} record - case
 * @param {boolean} forSeller - true leaves out internal detail
 * @returns {Object} case view
 */
function getCaseView(record, forSeller) {
    var c = record.custom;
    var view = {
        caseId: c.caseId,
        caseType: c.caseType,
        status: c.status,
        severity: c.severity,
        productId: c.productId,
        orderNo: c.orderNo,
        entityId: c.entityId,
        thread: marketplaceHelpers.parseJson(c.thread, []),
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        revision: c.revision || 0
    };
    if (!forSeller) {
        view.sellerId = c.sellerId;
        view.detail = marketplaceHelpers.parseJson(c.detail, {});
        view.resolution = c.resolution || null;
    }
    return view;
}

/**
 * @param {dw.object.CustomObject} record - case
 * @param {string} by - SELLER | ADMIN
 * @param {string} text - message
 * @returns {boolean} false when the thread is full
 */
function addMessage(record, by, text) {
    var thread = marketplaceHelpers.parseJson(record.custom.thread, []);
    if (thread.length >= MAX_MESSAGES) return false;
    thread.push({ at: new Date().toISOString(), by: by, text: text });
    record.custom.thread = JSON.stringify(thread);
    record.custom.updatedAt = new Date();
    return true;
}

/**
 * A signed-in shopper reports a listing (counterfeit or customer issue).
 * @param {dw.customer.Customer} customer - current customer
 * @param {Object} form - {offerId, caseType, description, orderNo}
 * @returns {Object} result with caseId
 */
function reportListing(customer, form) {
    if (!marketplaceHelpers.isMarketplaceEnabled()) return marketplaceHelpers.errorResult('disabled');
    if (!customer || !customer.authenticated || !customer.registered) return marketplaceHelpers.errorResult('unauthenticated');
    var offerId = String(form.offerId || '');
    var caseType = String(form.caseType || '');
    var description = String(form.description || '').trim();
    var orderNo = String(form.orderNo || '').trim();
    var offer = CustomObjectMgr.getCustomObject('MarketplaceOffer', offerId);
    var invalid = {};
    if (!offer) invalid.offerId = 'unknown';
    if (['COUNTERFEIT_REPORT', 'CUSTOMER_ISSUE'].indexOf(caseType) < 0) invalid.caseType = 'invalid';
    if (description.length < 20 || description.length > 2000) invalid.description = 'invalid';
    if (orderNo && !require('dw/order/OrderMgr').searchOrder('orderNo = {0} AND customerNo = {1}', orderNo, customer.profile.customerNo)) invalid.orderNo = 'unknown';
    if (Object.keys(invalid).length) return marketplaceHelpers.errorResult('invalid', invalid);
    if (!marketplaceHelpers.checkRateLimit('listing-report', customer.profile.customerNo, Site.getCurrent().getCustomPreferenceValue('sellerReportRateLimitPerDay'), 86400)) {
        return marketplaceHelpers.errorResult('rate-limited');
    }
    var caseId;
    Transaction.wrap(function () {
        caseId = openCase({
            caseType: caseType,
            sellerId: offer.custom.sellerId,
            entityId: offerId,
            productId: offer.custom.productId,
            orderNo: orderNo || null,
            reporterCustomerNo: customer.profile.customerNo,
            description: description,
            severity: caseType === 'COUNTERFEIT_REPORT' ? 'HIGH' : 'MEDIUM'
        }).custom.caseId;
        marketplaceHelpers.notify(marketplaceHelpers.ADMIN, 'ADMIN_CASE_REPORTED', { caseId: caseId });
    });
    return { error: false, caseId: caseId };
}

/**
 * @param {string} sellerId - seller
 * @param {?string} status - filter
 * @param {number} offset - rows to skip
 * @param {number} limit - page size
 * @returns {{items: Object[], total: number}} the seller's visible cases
 */
function getSellerCases(sellerId, status, offset, limit) {
    var query = 'custom.sellerId = {0} AND custom.visibleToSeller = {1}' + (status ? ' AND custom.status = {2}' : '');
    var page = marketplaceHelpers.queryPage('MarketplaceCase', query, 'custom.updatedAt desc', status ? [sellerId, true, status] : [sellerId, true], offset, limit);
    return { items: page.items.map(function (c) { return getCaseView(c, true); }), total: page.total };
}

/**
 * @param {Object} context - seller context
 * @param {string} caseId - case
 * @param {string} message - answer
 * @returns {Object} result with the case view
 */
function answerCase(context, caseId, message) {
    var text = String(message || '').trim();
    if (text.length < 2 || text.length > 2000) return marketplaceHelpers.errorResult('invalid', { message: 'invalid' });
    var record = CustomObjectMgr.getCustomObject('MarketplaceCase', String(caseId));
    if (!record || record.custom.sellerId !== context.sellerId || !record.custom.visibleToSeller) return marketplaceHelpers.errorResult('not-found');
    if (['RESOLVED', 'DISMISSED'].indexOf(record.custom.status) >= 0) return marketplaceHelpers.errorResult('not-allowed-now');
    var added = true;
    Transaction.wrap(function () {
        added = addMessage(record, 'SELLER', text);
        if (!added) return;
        if (record.custom.status === 'OPEN') record.custom.status = 'IN_PROGRESS';
        record.custom.revision = (record.custom.revision || 0) + 1;
        marketplaceHelpers.logAudit({ entityType: 'CASE', entityId: caseId, sellerId: context.sellerId, action: 'SELLER_RESPONSE', actor: context.actor });
    });
    return added ? { error: false, caseView: getCaseView(record, true) } : marketplaceHelpers.errorResult('limit-reached');
}

/**
 * Business Manager: note, progress, resolve, dismiss or reopen a case.
 * @param {string} caseId - case
 * @param {string} action - note | progress | resolve | dismiss | reopen
 * @param {string} message - message (required for note, resolve and dismiss)
 * @param {?number} revision - revision the page showed
 * @param {Object} by - admin actor
 * @returns {Object} result
 */
function updateCase(caseId, action, message, revision, by) {
    var record = CustomObjectMgr.getCustomObject('MarketplaceCase', String(caseId));
    if (!record) return marketplaceHelpers.errorResult('not-found');
    var target = { progress: 'IN_PROGRESS', resolve: 'RESOLVED', dismiss: 'DISMISSED', reopen: 'OPEN' }[action];
    var text = String(message || '').trim().slice(0, 2000);
    if (!target && action !== 'note') return marketplaceHelpers.errorResult('invalid', { action: 'invalid' });
    if (['note', 'resolve', 'dismiss'].indexOf(action) >= 0 && text.length < 3) return marketplaceHelpers.errorResult('invalid', { message: 'required' });
    var from = record.custom.status;
    if (target && !marketplaceHelpers.canMove(CASE_FLOW, from, target)) return marketplaceHelpers.errorResult('not-allowed-now');
    if (revision !== null && revision !== undefined && revision !== (record.custom.revision || 0)) return marketplaceHelpers.errorResult('stale');
    Transaction.wrap(function () {
        if (text) addMessage(record, 'ADMIN', text);
        if (target) record.custom.status = target;
        if (action === 'resolve' || action === 'dismiss') record.custom.resolution = text;
        record.custom.updatedAt = new Date();
        record.custom.revision = (record.custom.revision || 0) + 1;
        marketplaceHelpers.logAudit({ entityType: 'CASE', entityId: caseId, sellerId: record.custom.sellerId, action: 'ADMIN_' + action.toUpperCase(), actor: by, from: from, to: target || from });
        if (record.custom.visibleToSeller && record.custom.sellerId && text) marketplaceHelpers.notify(record.custom.sellerId, 'CASE_UPDATED', { caseId: caseId });
    });
    return { error: false };
}

module.exports = {
    CASE_TYPES: CASE_TYPES,
    openCase: openCase,
    getCaseView: getCaseView,
    reportListing: reportListing,
    getSellerCases: getSellerCases,
    answerCase: answerCase,
    updateCase: updateCase
};

