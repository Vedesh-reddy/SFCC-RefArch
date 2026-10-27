'use strict';

/**
 * Custom Admin API "marketplace-admin" for the OMS, payout middleware and back-office
 * integrations (Account Manager client with c_mkt_admin). Called with a storefront siteId,
 * because marketplace records are site-scoped.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var marketplaceHelpers = require('*/cartridge/scripts/helpers/marketplaceHelpers');

var ADMIN_API = marketplaceHelpers.actor('ADMIN', 'admin-api');
var ORDER_STATUSES = ['AWAITING_FULFILLMENT', 'PARTIALLY_SHIPPED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'CLOSED'];

/**
 * @returns {Object} disabled result, or a passing one
 */
function checkEnabled() {
    return marketplaceHelpers.isMarketplaceEnabled() ? { error: false } : marketplaceHelpers.errorResult('disabled');
}

/**
 * @param {string} name - path parameter
 * @returns {string} value
 */
function pathParam(name) {
    return String(request.getSCAPIPathParameters().get(name) || '');
}

exports.listSellerOrders = function () {
    var enabled = checkEnabled();
    if (enabled.error) return marketplaceHelpers.renderApiResponse(enabled);
    var paging = marketplaceHelpers.getApiPaging();
    var status = marketplaceHelpers.getApiQuery('c_status');
    var sellerId = marketplaceHelpers.getApiQuery('c_sellerId');
    if (status && ORDER_STATUSES.indexOf(status) < 0) return marketplaceHelpers.renderApiResponse(marketplaceHelpers.errorResult('invalid', { c_status: 'invalid' }));
    var query = 'custom.status != {0}';
    var args = ['PENDING_PAYMENT'];
    if (status) {
        query += ' AND custom.status = {' + args.length + '}';
        args.push(status);
    }
    if (sellerId) {
        query += ' AND custom.sellerId = {' + args.length + '}';
        args.push(sellerId);
    }
    var orderHelpers = require('*/cartridge/scripts/helpers/sellerOrderHelpers');
    var page = marketplaceHelpers.queryPage('MarketplaceSellerOrder', query, 'custom.orderCreatedAt asc', args, paging.offset, paging.limit);
    return marketplaceHelpers.renderApiResponse(enabled, { data: page.items.map(function (r) { return orderHelpers.getSellerOrderView(r, true); }), total: page.total, offset: paging.offset, limit: paging.limit });
};
exports.listSellerOrders.public = true;

exports.postSellerOrderEvent = function () {
    var result = checkEnabled();
    var body = marketplaceHelpers.getApiBody();
    if (!result.error) result = body ? require('*/cartridge/scripts/helpers/sellerOrderHelpers').applyOrderEvent(pathParam('orderNo'), pathParam('sellerId'), body, ADMIN_API) : marketplaceHelpers.errorResult('invalid');
    return marketplaceHelpers.renderApiResponse(result, result.sellerOrderView);
};
exports.postSellerOrderEvent.public = true;

exports.getSeller = function () {
    var result = checkEnabled();
    var seller = result.error ? null : CustomObjectMgr.getCustomObject('MarketplaceSeller', pathParam('sellerId'));
    if (!result.error && !seller) result = marketplaceHelpers.errorResult('not-found');
    return marketplaceHelpers.renderApiResponse(result, seller && require('*/cartridge/scripts/helpers/sellerHelpers').getSellerView(seller));
};
exports.getSeller.public = true;

exports.listSettlements = function () {
    var enabled = checkEnabled();
    if (enabled.error) return marketplaceHelpers.renderApiResponse(enabled);
    var paging = marketplaceHelpers.getApiPaging();
    var status = marketplaceHelpers.getApiQuery('c_status');
    var settlementHelpers = require('*/cartridge/scripts/helpers/settlementHelpers');
    var page = status
        ? marketplaceHelpers.queryPage('MarketplaceSettlement', 'custom.status = {0}', 'custom.createdAt asc', [status], paging.offset, paging.limit)
        : marketplaceHelpers.queryPage('MarketplaceSettlement', 'custom.status != {0}', 'custom.createdAt asc', ['CANCELLED'], paging.offset, paging.limit);
    return marketplaceHelpers.renderApiResponse(enabled, {
        data: page.items.map(function (s) {
            var view = settlementHelpers.getSettlementView(s);
            view.sellerId = s.custom.sellerId;
            return view;
        }),
        total: page.total,
        offset: paging.offset,
        limit: paging.limit
    });
};
exports.listSettlements.public = true;

exports.postPayoutResult = function () {
    var settlementHelpers = require('*/cartridge/scripts/helpers/settlementHelpers');
    var result = checkEnabled();
    var body = marketplaceHelpers.getApiBody() || {};
    if (!result.error) result = settlementHelpers.recordPayoutResult(pathParam('settlementId'), body.result, body.reference, ADMIN_API);
    var settlement = result.error ? null : CustomObjectMgr.getCustomObject('MarketplaceSettlement', pathParam('settlementId'));
    return marketplaceHelpers.renderApiResponse(result, settlement && settlementHelpers.getSettlementView(settlement));
};
exports.postPayoutResult.public = true;
