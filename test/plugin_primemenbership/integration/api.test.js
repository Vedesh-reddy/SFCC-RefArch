'use strict';

var assert = require('chai').assert;
var harness = require('../fixtures/harness');
var fixtures = require('../fixtures/fixtures');

describe('Custom APIs', function () {
    var h;
    var shopper;
    var admin;

    function call(input) {
        var i = input || {};
        global.customer = i.customerNo ? { authenticated: true, registered: true, profile: { customerNo: i.customerNo } } : { authenticated: false, registered: false };
        global.request = {
            getHttpParameterMap: function () {
                return {
                    get: function (name) { return { submitted: Object.prototype.hasOwnProperty.call(i.query || {}, name), stringValue: (i.query || {})[name] }; },
                    getRequestBodyAsString: function () { return i.body === undefined ? '' : JSON.stringify(i.body); }
                };
            },
            getSCAPIPathParameters: function () { return { get: function (name) { return (i.path || {})[name]; } }; }
        };
    }

    beforeEach(function () {
        h = harness();
        fixtures.plans(h);
        shopper = h.require('rest-apis/prime-membership/script');
        admin = h.require('rest-apis/prime-membership-admin/script');
    });

    it('lists plans publicly', function () {
        call();
        shopper.listPlans();
        assert.lengthOf(h.state.response.body.data, 3);
    });

    it('answers 503 while the plugin is off', function () {
        h.preferences.primeMembershipEnabled = false;
        call();
        shopper.listPlans();
        assert.equal(h.state.response.status, 503);
    });

    it('needs a registered shopper for membership data', function () {
        call();
        shopper.getMyMembership();
        assert.equal(h.state.response.status, 401);
        shopper.listMyTransactions();
        assert.equal(h.state.response.status, 401);
        shopper.cancelMyMembership();
        assert.equal(h.state.response.status, 401);
    });

    it('answers for the token\'s customer, with no way to name another', function () {
        fixtures.member(h, 'C1', 'prime');
        fixtures.member(h, 'C2', 'ultra-prime');
        call({ customerNo: 'C1', query: { customerNo: 'C2' }, path: { customerNo: 'C2' } });
        shopper.getMyMembership();
        assert.equal(h.state.response.body.planId, 'prime');
    });

    it('answers 404 without a membership', function () {
        call({ customerNo: 'C9' });
        shopper.getMyMembership();
        assert.equal(h.state.response.status, 404);
    });

    it('quotes an upgrade from the server\'s records', function () {
        fixtures.member(h, 'C1', 'prime');
        call({ customerNo: 'C1', path: { planId: 'ultra-prime' } });
        shopper.getUpgradeQuote();
        assert.isAbove(h.state.response.body.chargeCents, 0);
        assert.equal(h.state.response.body.currency, 'USD');
    });

    it('cancels the token\'s own membership', function () {
        var member = fixtures.member(h, 'C1', 'prime');
        call({ customerNo: 'C1' });
        shopper.cancelMyMembership();
        assert.equal(member.custom.status, 'CANCELLED');
    });

    it('offers no shopper endpoint that activates or pays', function () {
        Object.keys(shopper).forEach(function (name) { assert.notMatch(name, /activate|pay|complete|place/i); });
        Object.keys(admin).forEach(function (name) { assert.notMatch(name, /activate|pay|complete|place/i); });
    });

    it('bounds the transaction list', function () {
        fixtures.member(h, 'C1', 'prime');
        for (var i = 0; i < 30; i++) h.create('PrimeMembershipTransaction', 'T' + i, { customerNo: 'C1', transactionType: 'PURCHASE', status: 'COMPLETED', amountCents: 1, totalCents: 1, createdAt: new Date() });
        call({ customerNo: 'C1', query: { c_limit: '5000' } });
        shopper.listMyTransactions();
        assert.lengthOf(h.state.response.body.data, 20);
    });

    it('admin reads one membership', function () {
        fixtures.member(h, 'C1', 'prime');
        call({ path: { customerNo: 'C1' } });
        admin.getMembership();
        assert.equal(h.state.response.body.customerNo, 'C1');
    });

    it('admin records a refund once, by reference', function () {
        fixtures.member(h, 'C1', 'prime');
        h.create('PrimeMembershipTransaction', 'P1', { customerNo: 'C1', orderNo: 'O1', status: 'COMPLETED', totalCents: 100000, currency: 'USD' });
        var body = { c_orderNo: 'O1', c_amountCents: 1000, c_reference: 'RF-1' };
        call({ path: { customerNo: 'C1' }, body: body });
        admin.recordRefund();
        assert.equal(h.state.response.status, 201);
        var count = h.rows('PrimeMembershipTransaction').length;
        admin.recordRefund();
        assert.lengthOf(h.rows('PrimeMembershipTransaction'), count);
        assert.equal(h.get('PrimeMembershipSubscription', 'C1').custom.creditBaseCents, 99000);
    });

    it('admin can\'t refund more than was paid, or an order nobody paid', function () {
        fixtures.member(h, 'C1', 'prime');
        h.create('PrimeMembershipTransaction', 'P1', { customerNo: 'C1', orderNo: 'O1', status: 'COMPLETED', totalCents: 100000, currency: 'USD' });
        call({ path: { customerNo: 'C1' }, body: { c_orderNo: 'O1', c_amountCents: 100001, c_reference: 'RF-1' } });
        admin.recordRefund();
        assert.equal(h.state.response.status, 400);
        call({ path: { customerNo: 'C1' }, body: { c_orderNo: 'NOPE', c_amountCents: 1, c_reference: 'RF-2' } });
        admin.recordRefund();
        assert.equal(h.state.response.title, 'not-refundable');
    });

    it('admin can refund an order in parts, up to what was paid in total', function () {
        fixtures.member(h, 'C1', 'prime');
        h.create('PrimeMembershipTransaction', 'P1', { customerNo: 'C1', orderNo: 'O1', status: 'COMPLETED', transactionType: 'PURCHASE', totalCents: 100000, currency: 'USD' });
        var payment = h.require('scripts/helpers/membershipPaymentHelpers');
        assert.isFalse(payment.recordRefund('C1', 'O1', 10000, false, 'RF-1', 'admin:ops').error);
        assert.isFalse(payment.recordRefund('C1', 'O1', 60000, false, 'RF-2', 'admin:ops').error, 'the first refund must not be read as the payment');
        assert.equal(payment.recordRefund('C1', 'O1', 30001, false, 'RF-3', 'admin:ops').fields.amount, 'above-paid');
        assert.isFalse(payment.recordRefund('C1', 'O1', 30000, false, 'RF-3', 'admin:ops').error);
    });

    it('admin refund with end of membership closes it now', function () {
        var member = fixtures.member(h, 'C1', 'prime');
        h.create('PrimeMembershipTransaction', 'P1', { customerNo: 'C1', orderNo: 'O1', status: 'COMPLETED', totalCents: 100000, currency: 'USD' });
        call({ path: { customerNo: 'C1' }, body: { c_orderNo: 'O1', c_amountCents: 100000, c_reference: 'RF-1', c_endMembership: true } });
        admin.recordRefund();
        assert.equal(member.custom.status, 'CANCELLED');
        assert.isNull(h.require('scripts/helpers/membershipBenefitHelpers').getActiveMembership('C1'));
    });

    it('admin lists payments held for review', function () {
        h.create('PrimeMembershipTransaction', 'R1', { customerNo: 'C1', status: 'REVIEW', transactionType: 'PURCHASE', amountCents: 1, totalCents: 1, createdAt: new Date(), reviewReason: 'amount-mismatch' });
        call();
        admin.listReviewTransactions();
        assert.equal(h.state.response.body.data[0].reason, 'amount-mismatch');
    });
});
