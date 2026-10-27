'use strict';

/**
 * Custom Admin API "luckydraw-admin" (scope c_luckydraw_admin) for the OMS and auditors:
 * order events (cancel, refund, chargeback, fraud), draw executions with their verification
 * data, and campaign reports. Called with a storefront siteId because the records are
 * site-scoped.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var luckyDrawHelpers = require('*/cartridge/scripts/helpers/luckyDrawHelpers');
var drawHelpers = require('*/cartridge/scripts/helpers/luckyDrawDrawHelpers');

var INTEGRATION = luckyDrawHelpers.actor('INTEGRATION', 'admin-api');
var EVENTS = ['CANCELLED', 'REFUNDED', 'CHARGEBACK', 'FRAUD'];

/**
 * @returns {Object} disabled result, or a passing one
 */
function checkEnabled() {
    return luckyDrawHelpers.isLuckyDrawEnabled() ? { error: false } : luckyDrawHelpers.errorResult('disabled');
}

/**
 * @param {string} name - path parameter
 * @returns {string} value
 */
function pathParam(name) {
    return String(request.getSCAPIPathParameters().get(name) || '');
}

/**
 * @returns {Object} result: enabled and the campaign in the path exists
 */
function checkCampaign() {
    var result = checkEnabled();
    if (!result.error && !require('*/cartridge/scripts/helpers/luckyDrawCampaignHelpers').getCampaign(pathParam('campaignId'))) result = luckyDrawHelpers.errorResult('not-found');
    return result;
}

exports.postOrderEvent = function () {
    var result = checkEnabled();
    var body = luckyDrawHelpers.getApiBody() || {};
    var orderNo = String(body.orderNo || '');
    var event = String(body.event || '');
    if (!result.error && (!/^[A-Za-z0-9_-]{1,50}$/.test(orderNo) || EVENTS.indexOf(event) < 0)) result = luckyDrawHelpers.errorResult('invalid', { orderNo: 'invalid', event: 'invalid' });
    if (result.error) {
        luckyDrawHelpers.renderApiResponse(result);
        return;
    }
    // Each order event is applied once; a repeated call returns the first answer.
    var key = 'order-event:' + orderNo + ':' + event;
    var existing = CustomObjectMgr.getCustomObject('LuckyDrawRequestKey', key);
    if (existing) {
        luckyDrawHelpers.renderApiResponse(result, Object.assign({ replayed: true }, luckyDrawHelpers.parseJson(existing.custom.result, {})));
        return;
    }
    var counts = require('*/cartridge/scripts/helpers/luckyDrawEntryHelpers').applyOrderEvent(orderNo, event, INTEGRATION);
    require('dw/system/Transaction').wrap(function () {
        var record = CustomObjectMgr.createCustomObject('LuckyDrawRequestKey', key);
        record.custom.requestHash = event;
        record.custom.result = JSON.stringify(counts);
        record.custom.createdAt = new Date();
    });
    luckyDrawHelpers.renderApiResponse(result, Object.assign({ replayed: false }, counts));
};
exports.postOrderEvent.public = true;

exports.listExecutions = function () {
    var result = checkCampaign();
    var body = null;
    if (!result.error) {
        var paging = luckyDrawHelpers.getApiPaging();
        var page = luckyDrawHelpers.queryPage('LuckyDrawExecution', 'custom.campaignId = {0}', 'custom.windowEnd desc', [pathParam('campaignId')], paging.offset, paging.limit);
        body = { data: page.items.map(function (x) { return drawHelpers.getDrawView(x, true); }), total: page.total, offset: paging.offset, limit: paging.limit };
    }
    luckyDrawHelpers.renderApiResponse(result, body);
};
exports.listExecutions.public = true;

exports.getReport = function () {
    var result = checkCampaign();
    var body = null;
    if (!result.error) {
        var campaignId = pathParam('campaignId');
        var count = function (type, flow) {
            var counts = {};
            Object.keys(flow).forEach(function (s) { counts[s] = luckyDrawHelpers.queryCount(type, 'custom.campaignId = {0} AND custom.status = {1}', [campaignId, s]); });
            return counts;
        };
        body = {
            campaignId: campaignId,
            entries: count('LuckyDrawEntry', require('*/cartridge/scripts/helpers/luckyDrawEntryHelpers').ENTRY_FLOW),
            winners: count('LuckyDrawWinner', drawHelpers.WINNER_FLOW),
            rewards: count('LuckyDrawReward', require('*/cartridge/scripts/helpers/luckyDrawRewardHelpers').REWARD_FLOW),
            executions: count('LuckyDrawExecution', drawHelpers.EXECUTION_FLOW)
        };
    }
    luckyDrawHelpers.renderApiResponse(result, body);
};
exports.getReport.public = true;

exports.getExecution = function () {
    var result = checkEnabled();
    var record = result.error ? null : CustomObjectMgr.getCustomObject('LuckyDrawExecution', pathParam('executionId'));
    if (!result.error && !record) result = luckyDrawHelpers.errorResult('not-found');
    var body = null;
    if (record) {
        body = drawHelpers.getDrawView(record, true);
        body.winners = luckyDrawHelpers.queryPage('LuckyDrawWinner', 'custom.executionId = {0}', 'custom.rank asc', [record.custom.executionId], 0, 500).items.map(function (w) {
            return { winnerId: w.custom.winnerId, rank: w.custom.rank, entryId: w.custom.entryId, status: w.custom.status, tier: w.custom.tier };
        });
    }
    luckyDrawHelpers.renderApiResponse(result, body);
};
exports.getExecution.public = true;

exports.verifyExecution = function () {
    var result = checkEnabled();
    if (!result.error) result = drawHelpers.verifyDraw(pathParam('executionId'));
    luckyDrawHelpers.renderApiResponse(result, { ok: result.ok, problems: result.problems });
};
exports.verifyExecution.public = true;
