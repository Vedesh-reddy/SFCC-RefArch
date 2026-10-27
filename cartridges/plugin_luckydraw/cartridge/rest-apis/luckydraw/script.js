'use strict';

/**
 * Custom Shopper API "luckydraw" (scope c_luckydraw). Campaigns, winners and draws are
 * public; entries, rewards, free entry and opting out need a registered shopper token and
 * always act for the token's customer.
 */

var luckyDrawHelpers = require('*/cartridge/scripts/helpers/luckyDrawHelpers');
var campaignHelpers = require('*/cartridge/scripts/helpers/luckyDrawCampaignHelpers');
var entryHelpers = require('*/cartridge/scripts/helpers/luckyDrawEntryHelpers');

/**
 * @returns {Object} disabled result, or a passing one
 */
function checkEnabled() {
    return luckyDrawHelpers.isLuckyDrawEnabled() ? { error: false } : luckyDrawHelpers.errorResult('disabled');
}

/**
 * @returns {?Object} rules of the visible campaign in the path
 */
function getPathCampaign() {
    return campaignHelpers.getVisibleCampaignRules(request.getSCAPIPathParameters().get('campaignId'));
}

/**
 * @param {Object[]} items - list
 * @returns {Object} list body
 */
function listBody(items) {
    return { data: items, total: items.length };
}

/**
 * @returns {Object} result: enabled and a signed-in registered customer
 */
function checkCustomer() {
    var enabled = checkEnabled();
    if (enabled.error) return enabled;
    return entryHelpers.getCustomerNo(customer) ? { error: false } : luckyDrawHelpers.errorResult('unauthenticated');
}

exports.listCampaigns = function () {
    var result = checkEnabled();
    luckyDrawHelpers.renderApiResponse(result, result.error ? null : listBody(campaignHelpers.getOverview()));
};
exports.listCampaigns.public = true;

exports.getCampaign = function () {
    var result = checkEnabled();
    var r = result.error ? null : getPathCampaign();
    if (!result.error && !r) result = luckyDrawHelpers.errorResult('not-found');
    var body = null;
    if (r) {
        body = campaignHelpers.getCampaignView(r);
        body.nextDraw = campaignHelpers.getNextDraw(r, Date.now());
    }
    luckyDrawHelpers.renderApiResponse(result, body);
};
exports.getCampaign.public = true;

exports.listWinners = function () {
    var result = checkEnabled();
    var r = result.error ? null : getPathCampaign();
    if (!result.error && !r) result = luckyDrawHelpers.errorResult('not-found');
    luckyDrawHelpers.renderApiResponse(result, r && listBody(campaignHelpers.getPublicWinners(r, 50)));
};
exports.listWinners.public = true;

exports.listDraws = function () {
    var result = checkEnabled();
    var r = result.error ? null : getPathCampaign();
    if (!result.error && !r) result = luckyDrawHelpers.errorResult('not-found');
    luckyDrawHelpers.renderApiResponse(result, r && listBody(campaignHelpers.getFinishedDraws(r, 50)));
};
exports.listDraws.public = true;

exports.createFreeEntry = function () {
    var result = entryHelpers.createFreeEntry(request.getSCAPIPathParameters().get('campaignId'), customer, luckyDrawHelpers.getApiBody() || {});
    luckyDrawHelpers.renderApiResponse(result, result.entryView, 201);
};
exports.createFreeEntry.public = true;

exports.optOut = function () {
    var result = checkEnabled();
    if (!result.error) result = entryHelpers.optOut(request.getSCAPIPathParameters().get('campaignId'), customer);
    luckyDrawHelpers.renderApiResponse(result, { optedOut: true, cancelledEntries: result.cancelledEntries });
};
exports.optOut.public = true;

exports.listMyEntries = function () {
    var result = checkCustomer();
    var campaignId = luckyDrawHelpers.getApiQuery('c_campaignId');
    if (!result.error && campaignId && !campaignHelpers.ID.test(campaignId)) result = luckyDrawHelpers.errorResult('invalid', { c_campaignId: 'invalid' });
    var body = null;
    if (!result.error) {
        var paging = luckyDrawHelpers.getApiPaging();
        var page = entryHelpers.getCustomerEntries(entryHelpers.getCustomerNo(customer), campaignId, paging.offset, paging.limit);
        body = { data: page.items, total: page.total, offset: paging.offset, limit: paging.limit };
    }
    luckyDrawHelpers.renderApiResponse(result, body);
};
exports.listMyEntries.public = true;

exports.listMyRewards = function () {
    var result = checkCustomer();
    var items = result.error ? null : require('*/cartridge/scripts/helpers/luckyDrawRewardHelpers').getCustomerRewards(entryHelpers.getCustomerNo(customer), 50);
    luckyDrawHelpers.renderApiResponse(result, items && listBody(items));
};
exports.listMyRewards.public = true;
