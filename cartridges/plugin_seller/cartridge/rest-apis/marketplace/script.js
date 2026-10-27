'use strict';

/**
 * Custom Shopper API "marketplace". Public offer reads use the c_mkt_shopper scope; every
 * /me endpoint needs a registered shopper token with c_mkt_seller and finds the seller from
 * that customer, never from the request.
 */

var marketplaceHelpers = require('*/cartridge/scripts/helpers/marketplaceHelpers');
var sellerHelpers = require('*/cartridge/scripts/helpers/sellerHelpers');

/**
 * @param {string} permission - required permission
 * @returns {Object} seller context or error result
 */
function getContext(permission) {
    return sellerHelpers.getSellerContext(customer, permission);
}

/**
 * Applies the per-seller hourly write limit.
 * @param {Object} context - seller context
 * @returns {Object} the context, or a rate-limited result
 */
function limitWrites(context) {
    if (context.error) return context;
    return marketplaceHelpers.checkRateLimit('api-write', context.sellerId, sellerHelpers.getPreference('sellerWriteRateLimitPerHour'), 3600) ? context : marketplaceHelpers.errorResult('rate-limited');
}

/**
 * @param {Object} body - request body
 * @returns {?number} posted revision
 */
function getRevision(body) {
    return body && body.revision !== undefined && body.revision !== null ? Number(body.revision) : null;
}

/**
 * @param {Object} page - {items, total}
 * @param {Object} paging - {offset, limit}
 * @returns {Object} list body
 */
function listBody(page, paging) {
    return { data: page.items, total: page.total, offset: paging.offset, limit: paging.limit };
}

exports.getProductOffers = function () {
    var productId = marketplaceHelpers.getApiQuery('c_productId');
    if (!marketplaceHelpers.isMarketplaceEnabled()) return marketplaceHelpers.renderApiResponse(marketplaceHelpers.errorResult('disabled'));
    if (!productId || !/^[A-Za-z0-9._-]{1,100}$/.test(productId)) return marketplaceHelpers.renderApiResponse(marketplaceHelpers.errorResult('invalid', { c_productId: 'invalid' }));
    var offers = require('*/cartridge/scripts/helpers/offerHelpers').getProductOffers(productId).map(function (o) {
        return {
            offerId: o.offerId, sellerId: o.sellerId, sellerName: o.sellerName, rating: o.rating, ratingCount: o.ratingCount, priceCents: o.priceCents, currency: 'USD',
            available: o.available > 0, handlingDays: o.handlingDays, condition: o.condition, returnable: o.returnable, returnDays: o.returnDays,
            shippingFeeCents: o.shippingFeeCents, freeShippingOverCents: o.freeShippingOverCents, featured: o.featured
        };
    });
    return marketplaceHelpers.renderApiResponse({ error: false }, { productId: productId, data: offers });
};
exports.getProductOffers.public = true;

exports.getSellerProfile = function () {
    if (!marketplaceHelpers.isMarketplaceEnabled()) return marketplaceHelpers.renderApiResponse(marketplaceHelpers.errorResult('disabled'));
    var profile = sellerHelpers.getPublicProfile(request.getSCAPIPathParameters().get('sellerId'));
    return marketplaceHelpers.renderApiResponse(profile ? { error: false } : marketplaceHelpers.errorResult('not-found'), profile);
};
exports.getSellerProfile.public = true;

exports.getMyAccount = function () {
    var context = getContext('profile.read');
    var view = context.error ? null : sellerHelpers.getSellerView(context.seller);
    if (view) {
        view.role = context.role;
        view.capabilities = sellerHelpers.getPermissions(customer);
    }
    return marketplaceHelpers.renderApiResponse(context, view);
};
exports.getMyAccount.public = true;

exports.createApplication = function () {
    var body = marketplaceHelpers.getApiBody();
    var result = body ? sellerHelpers.applyAsSeller(customer, body) : marketplaceHelpers.errorResult('invalid');
    return marketplaceHelpers.renderApiResponse(result, result.sellerView, 201);
};
exports.createApplication.public = true;

exports.listSubmissions = function () {
    var context = getContext('catalog.read');
    var paging = marketplaceHelpers.getApiPaging();
    var page = context.error ? null : require('*/cartridge/scripts/helpers/productSubmissionHelpers').getSellerSubmissions(context, marketplaceHelpers.getApiQuery('c_status'), paging.offset, paging.limit);
    return marketplaceHelpers.renderApiResponse(context, page && listBody(page, paging));
};
exports.listSubmissions.public = true;

exports.createSubmission = function () {
    var context = limitWrites(getContext('catalog.write'));
    var body = marketplaceHelpers.getApiBody();
    var result = context.error ? context : require('*/cartridge/scripts/helpers/productSubmissionHelpers').createDraft(context, body || {});
    return marketplaceHelpers.renderApiResponse(result, result.submissionView, 201);
};
exports.createSubmission.public = true;

exports.getSubmission = function () {
    var submissionHelpers = require('*/cartridge/scripts/helpers/productSubmissionHelpers');
    var context = getContext('catalog.read');
    var submission = context.error ? null : submissionHelpers.getOwnSubmission(context, request.getSCAPIPathParameters().get('submissionId'));
    var result = context.error ? context : (submission ? { error: false } : marketplaceHelpers.errorResult('not-found')); // eslint-disable-line no-nested-ternary
    return marketplaceHelpers.renderApiResponse(result, submission && submissionHelpers.getSubmissionView(submission));
};
exports.getSubmission.public = true;

exports.updateSubmission = function () {
    var context = limitWrites(getContext('catalog.write'));
    var body = marketplaceHelpers.getApiBody() || {};
    var result = context.error ? context : require('*/cartridge/scripts/helpers/productSubmissionHelpers').updateDraft(context, request.getSCAPIPathParameters().get('submissionId'), body, getRevision(body));
    return marketplaceHelpers.renderApiResponse(result, result.submissionView);
};
exports.updateSubmission.public = true;

exports.submitSubmission = function () {
    var context = limitWrites(getContext('catalog.write'));
    var result = context.error ? context : require('*/cartridge/scripts/helpers/productSubmissionHelpers').submitProduct(context, request.getSCAPIPathParameters().get('submissionId'));
    return marketplaceHelpers.renderApiResponse(result, result.submissionView);
};
exports.submitSubmission.public = true;

exports.listOffers = function () {
    var context = getContext('catalog.read');
    var paging = marketplaceHelpers.getApiPaging();
    var page = context.error ? null : require('*/cartridge/scripts/helpers/offerHelpers').getSellerOffers(context, marketplaceHelpers.getApiQuery('c_status'), paging.offset, paging.limit);
    return marketplaceHelpers.renderApiResponse(context, page && listBody(page, paging));
};
exports.listOffers.public = true;

exports.upsertOffer = function () {
    var offerHelpers = require('*/cartridge/scripts/helpers/offerHelpers');
    var context = limitWrites(getContext('catalog.write'));
    if (context.error) return marketplaceHelpers.renderApiResponse(context);
    var productId = request.getSCAPIPathParameters().get('productId');
    var body = marketplaceHelpers.getApiBody() || {};
    var exists = !!require('dw/object/CustomObjectMgr').getCustomObject('MarketplaceOffer', context.sellerId + ':' + productId);
    var result = exists ? offerHelpers.updateOffer(context, productId, body, getRevision(body)) : offerHelpers.createOffer(context, productId, body);
    return marketplaceHelpers.renderApiResponse(result, result.offerView, exists ? 200 : 201);
};
exports.upsertOffer.public = true;

exports.setOfferStock = function () {
    var context = limitWrites(getContext('catalog.write'));
    var body = marketplaceHelpers.getApiBody() || {};
    var result = context.error ? context : require('*/cartridge/scripts/helpers/offerHelpers').setOfferStock(context, request.getSCAPIPathParameters().get('productId'), body.quantity);
    return marketplaceHelpers.renderApiResponse(result, result.offerView);
};
exports.setOfferStock.public = true;

exports.listOrders = function () {
    var context = getContext('orders.read');
    var paging = marketplaceHelpers.getApiPaging();
    var page = context.error ? null : require('*/cartridge/scripts/helpers/sellerOrderHelpers').getSellerOrders(context, marketplaceHelpers.getApiQuery('c_status'), paging.offset, paging.limit);
    return marketplaceHelpers.renderApiResponse(context, page && listBody(page, paging));
};
exports.listOrders.public = true;

exports.getOrder = function () {
    var context = getContext('orders.read');
    var detail = context.error ? null : require('*/cartridge/scripts/helpers/sellerOrderHelpers').getSellerOrderDetail(context, request.getSCAPIPathParameters().get('orderNo'));
    var result = context.error ? context : (detail ? { error: false } : marketplaceHelpers.errorResult('not-found')); // eslint-disable-line no-nested-ternary
    return marketplaceHelpers.renderApiResponse(result, detail);
};
exports.getOrder.public = true;

exports.createShipment = function () {
    var context = limitWrites(getContext('orders.write'));
    var body = marketplaceHelpers.getApiBody() || {};
    var result = context;
    if (!context.error && !/^[A-Za-z0-9_-]{8,64}$/.test(String(body.idempotencyKey || ''))) result = marketplaceHelpers.errorResult('invalid', { idempotencyKey: 'required' });
    else if (!context.error) result = require('*/cartridge/scripts/helpers/sellerOrderHelpers').shipOrder(context, request.getSCAPIPathParameters().get('orderNo'), body, body.idempotencyKey);
    return marketplaceHelpers.renderApiResponse(result, result.sellerOrderView, 201);
};
exports.createShipment.public = true;

exports.listLedger = function () {
    var orderHelpers = require('*/cartridge/scripts/helpers/sellerOrderHelpers');
    var context = getContext('finance.read');
    var paging = marketplaceHelpers.getApiPaging();
    var body = null;
    if (!context.error) {
        body = listBody(orderHelpers.getLedgerEntries(context.sellerId, marketplaceHelpers.getApiQuery('c_entryType'), paging.offset, paging.limit), paging);
        body.balances = orderHelpers.getBalances(context.sellerId);
    }
    return marketplaceHelpers.renderApiResponse(context, body);
};
exports.listLedger.public = true;

exports.listSettlements = function () {
    var context = getContext('finance.read');
    var paging = marketplaceHelpers.getApiPaging();
    var page = context.error ? null : require('*/cartridge/scripts/helpers/settlementHelpers').getSellerSettlements(context.sellerId, paging.offset, paging.limit);
    return marketplaceHelpers.renderApiResponse(context, page && listBody(page, paging));
};
exports.listSettlements.public = true;

exports.getSettlement = function () {
    var context = getContext('finance.read');
    var statement = context.error ? null : require('*/cartridge/scripts/helpers/settlementHelpers').getStatement(context.sellerId, request.getSCAPIPathParameters().get('settlementId'));
    var result = context.error ? context : (statement ? { error: false } : marketplaceHelpers.errorResult('not-found')); // eslint-disable-line no-nested-ternary
    return marketplaceHelpers.renderApiResponse(result, statement);
};
exports.getSettlement.public = true;

exports.listNotifications = function () {
    var context = getContext('notifications.read');
    var paging = marketplaceHelpers.getApiPaging();
    var body = null;
    if (!context.error) {
        var inbox = marketplaceHelpers.getInbox(context.sellerId, paging.offset, paging.limit);
        body = listBody(inbox, paging);
        body.unread = inbox.unread;
    }
    return marketplaceHelpers.renderApiResponse(context, body);
};
exports.listNotifications.public = true;
