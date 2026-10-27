'use strict';

var HOUR = 3600000;
var ADMIN = { type: 'ADMIN', ref: 'ops' };

/**
 * Registers a single-use system-code coupon and an online rules content asset.
 * @param {Object} h - harness
 * @param {string} couponId - coupon
 * @param {number} [codes] - number of codes available
 */
function coupon(h, couponId, codes) {
    var list = [];
    for (var i = 0; i < (codes === undefined ? 20 : codes); i++) list.push(couponId.toUpperCase() + '-CODE-' + i);
    h.state.coupons[couponId] = { enabled: true, type: 'SYSTEM_CODES', limit: 1, codes: list, issued: 0 };
    h.state.content['ld-rules'] = { isOnline: function () { return true; }, custom: { body: '<p>Rules</p>' } };
}

/**
 * Admin input for a valid daily sweepstakes that started three days ago.
 * @param {Object} [overrides] - field overrides
 * @returns {Object} input
 */
function input(overrides) {
    var tz = 'America/New_York';
    var local = function (ms) {
        var parts = {};
        new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
            .formatToParts(new Date(ms)).forEach(function (p) { parts[p.type] = p.value; });
        return parts.year + '-' + parts.month + '-' + parts.day + ' ' + parts.hour + ':' + parts.minute;
    };
    return Object.assign({
        name: 'Daily draw',
        mode: 'SWEEPSTAKES',
        timeZone: tz,
        startLocal: local(Date.now() - 72 * HOUR),
        endLocal: local(Date.now() + 96 * HOUR),
        drawFrequency: 'DAILY',
        drawTime: '20:00',
        drawDelayMinutes: '60',
        holdHours: '1',
        eligibleCountries: 'US',
        excludedRegions: 'RI',
        minOrder: '25',
        entryMethod: 'PER_ORDER',
        maxEntriesPerOrder: '5',
        maxEntriesPerCustomer: '10',
        selectionMode: 'ENTRY',
        poolScope: 'WINDOW',
        prizes: JSON.stringify([{ tier: 'grand', label: '$200 coupon', winners: 1, couponId: 'ld-200', validityDays: 30 }]),
        alternatesPerDraw: '2',
        maxWinsPerParticipant: '1',
        requireWinnerVerification: 'false',
        freeEntryEnabled: 'true',
        freeEntriesPerDay: '1',
        freeEntryWeight: '1',
        minimumAge: '18',
        termsContentAssetId: 'ld-rules',
        termsVersion: 'v1',
        legalApprovalRef: 'LEGAL-2026-001',
        notifyEntries: 'true',
        notifyWinners: 'true',
        publishWinners: 'true',
        fundingSource: 'MARKETPLACE',
        randomSource: 'PLATFORM'
    }, overrides || {});
}

/**
 * Creates, schedules and starts a campaign.
 * @param {Object} h - harness
 * @param {string} id - campaign ID
 * @param {Object} [overrides] - input overrides
 * @returns {Object} campaign rules
 */
function campaign(h, id, overrides) {
    var campaignHelpers = h.require('scripts/helpers/luckyDrawCampaignHelpers');
    coupon(h, 'ld-200');
    var saved = campaignHelpers.saveCampaign(null, input(Object.assign({ campaignId: id }, overrides || {})), null, ADMIN);
    if (saved.error) throw new Error('fixture campaign: ' + JSON.stringify(saved.fields));
    var scheduled = campaignHelpers.changeCampaignStatus(id, 'schedule', '', ADMIN);
    if (scheduled.error) throw new Error('fixture schedule: ' + JSON.stringify(scheduled.problems || scheduled.fields));
    campaignHelpers.advanceCampaigns(10);
    return campaignHelpers.getCampaignRules(campaignHelpers.getCampaign(id));
}

/**
 * @param {Object} h - harness
 * @param {Object} o - {orderNo, customerNo, cents, createdMs, status, paid, country, state, lines}
 * @returns {Object} order double registered in the harness
 */
function order(h, o) {
    var lines = o.lines || [{ productID: 'P1', cents: o.cents === undefined ? 3000 : o.cents }];
    var record = {
        orderNo: o.orderNo,
        orderToken: 'token-' + o.orderNo,
        customerNo: o.customerNo === undefined ? 'C1' : o.customerNo,
        currencyCode: 'USD',
        creationDate: new Date(o.createdMs || Date.now() - 30 * HOUR),
        status: { value: o.status === undefined ? 3 : o.status },
        paymentStatus: { value: o.paid === false ? 0 : 2 },
        billingAddress: { countryCode: { value: o.country || 'US' }, stateCode: o.state || 'NY' },
        productLineItems: { toArray: function () { return lines.map(function (l) { return { productID: l.productID, bonusProductLineItem: !!l.bonus, proratedPrice: new h.Money(l.cents / 100, 'USD') }; }); } },
        couponLineItems: { toArray: function () { return (o.coupons || []).map(function (code) { return { couponCode: code }; }); } }
    };
    h.state.orders[o.orderNo] = record;
    return record;
}

/**
 * @param {Object} h - harness
 * @param {string} id - product
 * @param {string[]} categories - category IDs (root parent)
 */
function product(h, id, categories) {
    h.state.products[id] = {
        ID: id,
        isVariant: function () { return false; },
        categories: { toArray: function () { return categories.map(function (c) { return { ID: c, root: false, parent: { ID: 'root', root: true } }; }); } }
    };
}

/**
 * Moves the draw time of every execution of a campaign into the past so the job runs it.
 * @param {Object} h - harness
 * @param {string} campaignId - campaign
 */
function due(h, campaignId) {
    h.rows('LuckyDrawExecution').forEach(function (x) {
        if (x.custom.campaignId === campaignId) x.custom.drawAt = new Date(Date.now() - 1000);
    });
}

module.exports = {
    HOUR: HOUR,
    ADMIN: ADMIN,
    coupon: coupon,
    input: input,
    campaign: campaign,
    order: order,
    product: product,
    due: due
};
