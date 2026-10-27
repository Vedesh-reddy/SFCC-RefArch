'use strict';

var assert = require('chai').assert;
var harness = require('./harness');
var fixtures = require('./fixtures');

var HOUR = fixtures.HOUR;

/**
 * @returns {Object} SFRA server double that records routes
 */
function serverDouble() {
    var routes = { prepend: {}, append: {} };
    return {
        routes: routes,
        extend: function () {},
        prepend: function (name, fn) { routes.prepend[name] = fn; },
        append: function (name, fn) { routes.append[name] = fn; },
        exports: function () { return {}; }
    };
}

/**
 * @param {Function} fn - route function
 * @param {Object} req - request double
 * @param {Object} [viewData] - view data for appends
 * @returns {{json: ?Object, done: boolean, next: boolean}} outcome
 */
function call(fn, req, viewData) {
    var outcome = { json: null, done: false, next: false };
    var res = { json: function (data) { outcome.json = data; }, getViewData: function () { return viewData || {}; } };
    fn.call({ done: function () { outcome.done = true; } }, req, res, function () { outcome.next = true; });
    return outcome;
}

describe('plugin_luckydraw rewards', function () {
    var h;
    var rewards;
    var server;
    var winner;

    beforeEach(function () {
        server = serverDouble();
        h = harness({ mocks: { server: server } });
        rewards = h.require('scripts/helpers/luckyDrawRewardHelpers');
        var r = fixtures.campaign(h, 'daily-draw');
        var created = Date.now() - 30 * HOUR;
        var entries = h.require('scripts/helpers/luckyDrawEntryHelpers');
        for (var i = 1; i <= 3; i++) entries.createEntryFromOrder(r, fixtures.order(h, { orderNo: 'O' + i, customerNo: 'C' + i, createdMs: created }), Date.now());
        h.require('scripts/helpers/luckyDrawDrawHelpers').runDraws(1000);
        winner = h.rows('LuckyDrawWinner').filter(function (w) { return w.custom.status === 'CONFIRMED'; })[0];
    });

    /**
     * @returns {dw.object.CustomObject} reward of the winner
     */
    function reward() {
        return h.get('LuckyDrawReward', winner.custom.winnerId);
    }

    it('issues a single-use code exactly once, inside the transaction that stores it', function () {
        assert.deepEqual(rewards.processRewards(10), { issued: 1, failed: 0, skipped: 0, redeemed: 0, expired: 0 });
        var c = reward().custom;
        assert.equal(c.status, 'ISSUED');
        assert.equal(c.couponCode, 'LD-200-CODE-0');
        assert.equal(h.state.coupons['ld-200'].issued, 1);
        assert.equal(Math.round((c.expiresAt - c.issuedAt) / 86400000), 30);
        assert.equal(rewards.processRewards(10).issued, 0, 'nothing is due any more');
        assert.equal(h.state.coupons['ld-200'].issued, 1);
        assert.notInclude(JSON.stringify(h.rows('LuckyDrawNotification').map(function (n) { return n.custom.params; })), 'LD-200-CODE-0', 'the code is not copied into messages');
    });

    it('retries with backoff, then gives up with a case, when the coupon cannot issue codes', function () {
        h.state.coupons['ld-200'].codes = [];
        h.preferences.luckyDrawRewardMaxAttempts = 2;
        assert.equal(rewards.processRewards(10).failed, 1);
        assert.equal(reward().custom.status, 'PENDING');
        assert.isAbove(reward().custom.nextAttemptAt.getTime(), Date.now());
        reward().custom.nextAttemptAt = new Date(Date.now() - 1000);
        rewards.processRewards(10);
        assert.equal(reward().custom.status, 'FAILED');
        assert.isTrue(h.rows('LuckyDrawCase').some(function (x) { return x.custom.caseType === 'COUPON_ISSUE_FAILED'; }));
        h.state.coupons['ld-200'].codes = ['LATE-CODE'];
        assert.equal(rewards.updateReward(reward().custom.rewardId, 'revoke', 'short', fixtures.ADMIN).fields.reason, 'required');
        assert.isFalse(rewards.updateReward(reward().custom.rewardId, 'retry', '', fixtures.ADMIN).error);
        rewards.processRewards(10);
        assert.equal(reward().custom.couponCode, 'LATE-CODE');
    });

    it('lets only the winner use the code, and never after it expired', function () {
        rewards.processRewards(10);
        var code = reward().custom.couponCode;
        var owner = h.customer(winner.custom.customerNo);
        assert.isNull(rewards.checkRewardCode('SOME-OTHER-CODE', owner));
        assert.isTrue(rewards.checkRewardCode(code, owner).ok);
        assert.equal(rewards.checkRewardCode(code.toLowerCase(), h.customer('INTRUDER')).reason, 'not-yours');
        assert.isTrue(h.rows('LuckyDrawCase').some(function (x) { return x.custom.caseType === 'COUPON_MISUSE'; }));
        assert.equal(rewards.checkRewardCode(code, { authenticated: false }).reason, 'not-yours');
        reward().custom.expiresAt = new Date(Date.now() - 1000);
        assert.equal(rewards.checkRewardCode(code, owner).reason, 'expired');
        assert.equal(rewards.processRewards(10).expired, 1);
        assert.equal(reward().custom.status, 'EXPIRED');
    });

    it('refuses a foreign or expired code in Cart-AddCoupon before the base route applies it', function () {
        rewards.processRewards(10);
        h.require('controllers/Cart');
        var code = reward().custom.couponCode;
        var refused = call(server.routes.prepend.AddCoupon, { querystring: { couponCode: code }, currentCustomer: { raw: h.customer('INTRUDER') } });
        assert.isTrue(refused.done);
        assert.deepEqual(refused.json, { error: true, errorMessage: harness.messages['coupon.not-yours'] });
        assert.isTrue(call(server.routes.prepend.AddCoupon, { querystring: { couponCode: code }, currentCustomer: { raw: h.customer(winner.custom.customerNo) } }).next);
        assert.isTrue(call(server.routes.prepend.AddCoupon, { querystring: { couponCode: 'SUMMER10' }, currentCustomer: { raw: h.customer('ANYONE') } }).next, 'other coupons are untouched');
    });

    it('removes an invalid code before order creation and records redemption after placement', function () {
        rewards.processRewards(10);
        h.require('controllers/CheckoutServices');
        var code = reward().custom.couponCode;
        var removed = [];
        h.state.basket = { couponLineItems: { toArray: function () { return [{ couponCode: code }]; } }, removeCouponLineItem: function (cli) { removed.push(cli.couponCode); } };
        var outcome = call(server.routes.prepend.PlaceOrder, { currentCustomer: { raw: h.customer('INTRUDER') } });
        assert.isTrue(outcome.done);
        assert.deepEqual(removed, [code]);
        assert.isTrue(call(server.routes.prepend.PlaceOrder, { currentCustomer: { raw: h.customer(winner.custom.customerNo) } }).next);
        fixtures.order(h, { orderNo: 'PLACED', customerNo: winner.custom.customerNo, coupons: [code] });
        call(server.routes.append.PlaceOrder, {}, { error: false, orderID: 'PLACED', orderToken: 'token-PLACED' });
        assert.equal(reward().custom.status, 'REDEEMED');
        assert.equal(reward().custom.orderNo, 'PLACED');
    });

    it('syncs redemptions the platform recorded elsewhere (for example headless orders)', function () {
        rewards.processRewards(10);
        h.state.redemptions[reward().custom.couponCode] = [{ orderNo: 'HEADLESS-1' }];
        assert.equal(rewards.processRewards(10).redeemed, 1);
        assert.equal(reward().custom.orderNo, 'HEADLESS-1');
    });

    it('shows the code only to its owner, while it can be used', function () {
        rewards.processRewards(10);
        var mine = rewards.getCustomerRewards(winner.custom.customerNo, 10);
        assert.equal(mine[0].couponCode, reward().custom.couponCode);
        assert.isNull(rewards.getRewardView(reward(), false).couponCode);
        assert.lengthOf(rewards.getCustomerRewards('C-NOBODY', 10), 0);
    });
});
