'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var harness = require('../fixtures/harness');
var fixtures = require('../fixtures/fixtures');

var DAY = fixtures.DAY;

describe('upgrading and renewing', function () {
    var h;
    var clock;
    var START = Date.parse('2026-01-01T00:00:00Z');
    var END = Date.parse('2027-01-01T00:00:00Z');

    beforeEach(function () {
        clock = sinon.useFakeTimers({ now: START + (END - START) / 2, toFake: ['Date'] });
        h = harness();
        fixtures.plans(h);
    });
    afterEach(function () { clock.restore(); });

    function prime() { return fixtures.member(h, 'C1', 'prime', { startMs: START, expiresMs: END }); }

    it('shows the proration on the upgrade page: $750 at 50%', function () {
        prime();
        var res = h.route('PrimeMembership', 'Upgrade', { customerNo: 'C1', query: { plan: 'ultra-prime' } });
        assert.equal(res.template, 'membership/review');
        assert.equal(res.data.amount, '$750.00');
        assert.equal(res.data.upgrade.credit, '$500.00');
        assert.equal(res.data.upgrade.targetCost, '$1,250.00');
        assert.equal(res.data.upgrade.current.planName, 'Prime');
    });

    it('charges only the quoted difference and keeps the expiration date', function () {
        var member = prime();
        var flow = fixtures.checkout(h, 'C1', 'UPGRADE', 'ultra-prime');
        assert.equal(flow.record.custom.amountCents, 75000);
        assert.equal(flow.record.custom.status, 'COMPLETED');
        assert.equal(member.custom.planID, 'ultra-prime');
        assert.equal(member.custom.expirationDate.getTime(), END);
        assert.equal(member.custom.startDate.getTime(), START);
    });

    it('sets the value of the remaining term for a later upgrade', function () {
        var member = prime();
        fixtures.checkout(h, 'C1', 'UPGRADE', 'ultra-prime');
        assert.equal(member.custom.creditBaseCents, 125000);
        assert.equal(member.custom.creditFromDate.getTime(), Date.now());
    });

    it('prices a second upgrade with credit for the first', function () {
        prime();
        fixtures.checkout(h, 'C1', 'UPGRADE', 'ultra-prime');
        clock.tick((END - START) / 4);
        var second = fixtures.checkout(h, 'C1', 'UPGRADE', 'ultra-prime-max', { nonce: 'nonce-0002' });
        assert.equal(second.record.custom.amountCents, 62500);
        assert.equal(second.record.custom.status, 'COMPLETED');
    });

    it('keeps the plan and benefits while the upgrade payment is pending', function () {
        var member = prime();
        fixtures.checkout(h, 'C1', 'UPGRADE', 'ultra-prime', { paid: false });
        assert.equal(member.custom.status, 'UPGRADE_PENDING');
        assert.equal(member.custom.planID, 'prime');
        assert.equal(h.require('scripts/helpers/membershipBenefitHelpers').getMembershipTier('C1').planID, 'prime');
    });

    it('preserves the existing membership when the upgrade payment fails', function () {
        var member = prime();
        h.state.declinePayment = true;
        var flow = fixtures.checkout(h, 'C1', 'UPGRADE', 'ultra-prime');
        assert.equal(flow.record.custom.status, 'FAILED');
        assert.equal(member.custom.status, 'ACTIVE');
        assert.equal(member.custom.planID, 'prime');
        assert.equal(member.custom.creditBaseCents, 100000);
        assert.equal(h.require('scripts/helpers/membershipBenefitHelpers').getMembershipTier('C1').planID, 'prime');
    });

    it('refuses a downgrade or the same plan', function () {
        fixtures.member(h, 'C1', 'ultra-prime', { startMs: START, expiresMs: END });
        var payment = h.require('scripts/helpers/membershipPaymentHelpers');
        assert.equal(payment.getQuote('C1', 'UPGRADE', 'prime').errorCode, 'not-an-upgrade');
        assert.equal(payment.getQuote('C1', 'UPGRADE', 'ultra-prime').errorCode, 'not-an-upgrade');
    });

    it('refuses an upgrade after expiration', function () {
        prime();
        clock.tick(END - Date.now() + DAY);
        assert.equal(h.require('scripts/helpers/membershipPaymentHelpers').getQuote('C1', 'UPGRADE', 'ultra-prime').errorCode, 'no-membership');
    });

    it('asks the customer to renew when the charge would be below the minimum', function () {
        prime();
        clock.tick(END - Date.now() - 60000);
        assert.equal(h.require('scripts/helpers/membershipPaymentHelpers').getQuote('C1', 'UPGRADE', 'ultra-prime').errorCode, 'upgrade-too-late');
    });

    it('allows an upgrade on the final day when above the minimum', function () {
        prime();
        clock.tick(END - Date.now() - DAY);
        var quote = h.require('scripts/helpers/membershipPaymentHelpers').getQuote('C1', 'UPGRADE', 'ultra-prime');
        assert.isFalse(quote.error);
        assert.equal(quote.amountCents, Math.round(250000 / 365) - Math.round(100000 / 365));
    });

    it('refuses a negative charge when a member holds more value than the target costs', function () {
        fixtures.member(h, 'C1', 'prime', { startMs: START, expiresMs: END, valueCents: 9000000 });
        assert.equal(h.require('scripts/helpers/membershipPaymentHelpers').getQuote('C1', 'UPGRADE', 'ultra-prime').errorCode, 'invalid-charge');
    });

    it('refuses an upgrade of a cancelled membership until it is reactivated', function () {
        fixtures.member(h, 'C1', 'prime', { startMs: START, expiresMs: END, status: 'CANCELLED' });
        assert.equal(h.require('scripts/helpers/membershipPaymentHelpers').getQuote('C1', 'UPGRADE', 'ultra-prime').errorCode, 'reactivate-first');
    });

    it('expires the quote', function () {
        prime();
        var flow = (function () {
            h.state.sessionCustomerNo = 'C1';
            fixtures.form(h, 'primeMembershipSelect', { planID: 'ultra-prime', transactionType: 'UPGRADE', nonce: 'nonce-0001', acceptTerms: true });
            return h.route('PrimeMembership', 'StartCheckout', { customerNo: 'C1' }).redirectUrl.split('/id/')[1];
        }());
        clock.tick(15 * 60000);
        fixtures.form(h, 'primeMembershipBilling', fixtures.ADDRESS);
        h.route('PrimeMembership', 'SaveBilling', { customerNo: 'C1', query: { id: flow } });
        assert.equal(JSON.parse(h.state.flash.primeMembershipFlash).error, 'quote-expired');
    });

    it('refuses a quote when the plan price changed after it was made', function () {
        prime();
        h.state.sessionCustomerNo = 'C1';
        fixtures.form(h, 'primeMembershipSelect', { planID: 'ultra-prime', transactionType: 'UPGRADE', nonce: 'nonce-0001', acceptTerms: true });
        var id = h.route('PrimeMembership', 'StartCheckout', { customerNo: 'C1' }).redirectUrl.split('/id/')[1];
        h.get('PrimeMembershipPlan', 'ultra-prime').custom.configurationVersion = 2;
        assert.equal(h.require('scripts/helpers/membershipPaymentHelpers').checkQuote(h.get('PrimeMembershipTransaction', id)).errorCode, 'quote-expired');
    });

    it('refuses a quote when the membership changed after it was made', function () {
        var member = prime();
        h.state.sessionCustomerNo = 'C1';
        fixtures.form(h, 'primeMembershipSelect', { planID: 'ultra-prime', transactionType: 'UPGRADE', nonce: 'nonce-0001', acceptTerms: true });
        var id = h.route('PrimeMembership', 'StartCheckout', { customerNo: 'C1' }).redirectUrl.split('/id/')[1];
        member.custom.planID = 'ultra-prime';
        assert.equal(h.require('scripts/helpers/membershipPaymentHelpers').checkQuote(h.get('PrimeMembershipTransaction', id)).errorCode, 'quote-expired');
    });

    it('refuses to charge when the tax changed after it was shown', function () {
        prime();
        h.state.sessionCustomerNo = 'C1';
        fixtures.form(h, 'primeMembershipSelect', { planID: 'ultra-prime', transactionType: 'UPGRADE', nonce: 'nonce-0001', acceptTerms: true });
        var id = h.route('PrimeMembership', 'StartCheckout', { customerNo: 'C1' }).redirectUrl.split('/id/')[1];
        fixtures.form(h, 'primeMembershipBilling', fixtures.ADDRESS);
        h.route('PrimeMembership', 'SaveBilling', { customerNo: 'C1', query: { id: id } });
        h.state.taxRate = 0.2;
        fixtures.form(h, 'primeMembershipPayment', { paymentMethod: 'CREDIT_CARD' });
        h.route('PrimeMembership', 'PlaceOrder', { customerNo: 'C1', query: { id: id } });
        assert.equal(JSON.parse(h.state.flash.primeMembershipFlash).error, 'price-changed');
        assert.equal(h.get('PrimeMembershipTransaction', id).custom.status, 'QUOTED');
    });

    it('reduces the credit after a recorded refund, and the next quote is higher', function () {
        var member = prime();
        member.custom.sourceOrderNo = 'O1';
        h.create('PrimeMembershipTransaction', 'PURCHASE:C1:x', { customerNo: 'C1', orderNo: 'O1', status: 'COMPLETED', totalCents: 100000, currency: 'USD', transactionType: 'PURCHASE', amountCents: 100000 });
        var payment = h.require('scripts/helpers/membershipPaymentHelpers');
        assert.equal(payment.getQuote('C1', 'UPGRADE', 'ultra-prime').amountCents, 75000);
        assert.isFalse(payment.recordRefund('C1', 'O1', 20000, false, 'RF-1', 'admin:ops').error);
        assert.equal(payment.getQuote('C1', 'UPGRADE', 'ultra-prime').amountCents, 85000);
    });

    describe('renewal', function () {
        it('is not open until the renewal window', function () {
            prime();
            assert.equal(h.require('scripts/helpers/membershipPaymentHelpers').getQuote('C1', 'RENEWAL', 'prime').errorCode, 'renewal-not-open');
        });

        it('extends from the old expiration date, so nothing paid is lost', function () {
            var member = prime();
            clock.tick(END - Date.now() - 10 * DAY);
            var flow = fixtures.checkout(h, 'C1', 'RENEWAL', 'prime');
            assert.equal(flow.record.custom.status, 'COMPLETED');
            assert.equal(member.custom.expirationDate.toISOString(), '2028-01-01T00:00:00.000Z');
            assert.equal(member.custom.paidThroughDate.toISOString(), '2028-01-01T00:00:00.000Z');
        });

        it('keeps benefits when a renewal payment fails', function () {
            var member = prime();
            clock.tick(END - Date.now() - 10 * DAY);
            h.state.declinePayment = true;
            fixtures.checkout(h, 'C1', 'RENEWAL', 'prime');
            assert.equal(member.custom.status, 'PAYMENT_FAILED');
            assert.equal(member.custom.expirationDate.getTime(), END);
            assert.isNotNull(h.require('scripts/helpers/membershipBenefitHelpers').getActiveMembership('C1'));
        });

        it('allows a renewal retry after the failure', function () {
            prime();
            clock.tick(END - Date.now() - 10 * DAY);
            h.state.declinePayment = true;
            fixtures.checkout(h, 'C1', 'RENEWAL', 'prime');
            h.state.declinePayment = false;
            assert.equal(fixtures.checkout(h, 'C1', 'RENEWAL', 'prime', { nonce: 'nonce-0002' }).record.custom.status, 'COMPLETED');
        });

        it('refuses renewal into a different plan', function () {
            prime();
            clock.tick(END - Date.now() - 10 * DAY);
            assert.equal(h.require('scripts/helpers/membershipPaymentHelpers').getQuote('C1', 'RENEWAL', 'ultra-prime').errorCode, 'invalid');
        });

        it('lets an expired member join again as a new purchase', function () {
            var member = fixtures.member(h, 'C1', 'prime', { startMs: START - 800 * DAY, expiresMs: START - 400 * DAY, status: 'EXPIRED' });
            assert.equal(fixtures.checkout(h, 'C1', 'PURCHASE', 'ultra-prime').record.custom.status, 'COMPLETED');
            assert.equal(member.custom.status, 'ACTIVE');
            assert.equal(member.custom.planID, 'ultra-prime');
        });

        it('lets a member join again when the term ended but the job has not run', function () {
            var member = fixtures.member(h, 'C1', 'prime', { startMs: START - 800 * DAY, expiresMs: START - 400 * DAY });
            assert.equal(fixtures.checkout(h, 'C1', 'PURCHASE', 'prime').record.custom.status, 'COMPLETED');
            assert.equal(member.custom.status, 'ACTIVE');
        });
    });
});
