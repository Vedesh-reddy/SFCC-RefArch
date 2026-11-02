'use strict';

var assert = require('chai').assert;
var harness = require('../fixtures/harness');
var fixtures = require('../fixtures/fixtures');

describe('joining: purchase, payment and activation', function () {
    var h;
    beforeEach(function () {
        h = harness();
        fixtures.plans(h);
    });

    function subscription(no) { return h.get('PrimeMembershipSubscription', no || 'C1'); }

    it('renders the landing page with three plans and join buttons', function () {
        var res = h.route('PrimeMembership', 'Show', {});
        assert.equal(res.template, 'membership/landing');
        assert.lengthOf(res.data.plans, 3);
        assert.deepEqual(res.data.plans.map(function (p) { return p.price; }), ['$1,000.00', '$2,500.00', '$5,000.00']);
        assert.equal(res.data.plans[0].actionLabel, 'join');
    });

    it('shows why a checkout could not start, on the page it lands on', function () {
        fixtures.member(h, 'C1', 'prime');
        fixtures.form(h, 'primeMembershipSelect', { planID: 'ultra-prime', transactionType: 'PURCHASE', nonce: 'nonce-0001', acceptTerms: true });
        h.route('PrimeMembership', 'StartCheckout', { customerNo: 'C1' });
        assert.equal(h.route('PrimeMembership', 'Show', { customerNo: 'C1' }).data.flash.error, 'already-member');
    });

    it('shows the current plan and offers only upgrades to a member', function () {
        fixtures.member(h, 'C1', 'ultra-prime');
        var plans = h.route('PrimeMembership', 'Show', { customerNo: 'C1' }).data.plans;
        assert.isTrue(plans[1].current);
        assert.isNull(plans[0].actionUrl);
        assert.isNull(plans[1].actionUrl);
        assert.equal(plans[2].actionLabel, 'upgrade');
    });

    it('activates after a verified payment, for 12 months from now', function () {
        var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
        assert.equal(flow.record.custom.status, 'COMPLETED');
        var c = subscription().custom;
        assert.equal(c.status, 'ACTIVE');
        assert.equal(c.planID, 'prime');
        assert.equal(c.creditBaseCents, 100000);
        assert.equal(c.expirationDate.getTime(), h.require('scripts/helpers/membershipHelpers').addMonths(c.startDate, 12).getTime());
        assert.equal(c.paidThroughDate.getTime(), c.expirationDate.getTime());
        assert.isNull(c.pendingTransactionID);
    });

    it('redirects to the confirmation, which says the membership is active', function () {
        var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
        assert.include(flow.res.redirectUrl, 'PrimeMembership-Confirmation');
        var page = h.route('PrimeMembership', 'Confirmation', { customerNo: 'C1', query: { id: flow.id } });
        assert.equal(page.data.transaction.status, 'COMPLETED');
    });

    it('charges the fee plus tax, with the amount from the plan', function () {
        var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'ultra-prime');
        var c = flow.record.custom;
        assert.equal(c.amountCents, 250000);
        assert.equal(c.taxCents, 25000);
        assert.equal(c.totalCents, 275000);
        assert.equal(c.currency, 'USD');
    });

    it('puts the customer\'s e-mail on the order, as base checkout does', function () {
        var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
        assert.equal(h.state.orders[flow.record.custom.orderNo].customerEmail, 'c1@example.com');
    });

    it('shows a suspended member the plan name, not its ID', function () {
        fixtures.member(h, 'C1', 'ultra-prime', { status: 'SUSPENDED' });
        assert.equal(h.route('PrimeMembership', 'Dashboard', { customerNo: 'C1' }).data.membership.planName, 'Ultra Prime');
    });

    it('offers no Join button while a first payment is pending', function () {
        fixtures.checkout(h, 'C1', 'PURCHASE', 'prime', { paid: false });
        assert.isFalse(h.route('PrimeMembership', 'Dashboard', { customerNo: 'C1' }).data.membership.canJoin);
    });

    it('records the order and payment reference', function () {
        var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
        assert.isString(flow.record.custom.orderNo);
        assert.equal(flow.record.custom.paymentReference, 'pay-' + flow.record.custom.orderNo);
        assert.equal(subscription().custom.sourceOrderNo, flow.record.custom.orderNo);
    });

    it('marks the order as a membership order and keeps it out of the merchandise export', function () {
        var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
        var order = h.state.orders[flow.record.custom.orderNo];
        assert.equal(order.custom.primeMembershipTransactionID, flow.id);
        assert.equal(order.exportStatus, h.Order.EXPORT_STATUS_NOTEXPORTED);
    });

    it('exports it when the merchant wants that', function () {
        h.preferences.primeMembershipExportFeeOrders = true;
        var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
        assert.equal(h.state.orders[flow.record.custom.orderNo].exportStatus, h.Order.EXPORT_STATUS_READY);
    });

    it('does not touch the shopper\'s cart', function () {
        h.state.basket = fixtures.basket(h);
        fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
        assert.lengthOf(h.state.basket.lines, 1);
        assert.equal(h.state.basket.lines[0].productID, 'P1');
    });

    it('uses a non-catalog fee line with the plan name', function () {
        h.state.sessionCustomerNo = 'C1';
        fixtures.form(h, 'primeMembershipSelect', { planID: 'prime', transactionType: 'PURCHASE', nonce: 'nonce-0001', acceptTerms: true });
        var res = h.route('PrimeMembership', 'StartCheckout', { customerNo: 'C1' });
        var record = h.get('PrimeMembershipTransaction', res.redirectUrl.split('/id/')[1]);
        var line = h.state.tempBaskets[record.custom.basketUUID].lines[0];
        assert.equal(line.productID, 'prime-membership-fee');
        assert.isFalse(line.catalogProduct);
        assert.equal(line.productName, 'Prime');
        assert.equal(Math.round(line.basePrice.value * 100), 100000);
    });

    it('takes no shipping cost and no order promotion off or onto the fee', function () {
        h.state.sessionCustomerNo = 'C1';
        fixtures.form(h, 'primeMembershipSelect', { planID: 'prime', transactionType: 'PURCHASE', nonce: 'nonce-0001', acceptTerms: true });
        var res = h.route('PrimeMembership', 'StartCheckout', { customerNo: 'C1' });
        var record = h.get('PrimeMembershipTransaction', res.redirectUrl.split('/id/')[1]);
        var basket = h.state.tempBaskets[record.custom.basketUUID];
        basket.orderAdjustments.push({ promotionID: 'site-wide', price: h.moneyOf(-5000) });
        fixtures.form(h, 'primeMembershipBilling', fixtures.ADDRESS);
        h.route('PrimeMembership', 'SaveBilling', { customerNo: 'C1', query: { id: record.custom.transactionID } });
        assert.equal(record.custom.amountCents, 100000);
        assert.equal(record.custom.totalCents, 110000);
    });

    it('sends the activation e-mail through the job, once', function () {
        fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
        var helpers = h.require('scripts/helpers/membershipHelpers');
        assert.equal(helpers.deliverNotifications(10).sent, 1);
        assert.equal(helpers.deliverNotifications(10).sent, 0);
        assert.equal(h.state.mails[0].template, 'membership/email/notification');
        assert.equal(h.state.mails[0].mail.to, 'c1@example.com');
    });

    it('queues exactly one notification per activation when the check repeats', function () {
        var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
        var payment = h.require('scripts/helpers/membershipPaymentHelpers');
        payment.activateFromOrder(flow.record, h.state.orders[flow.record.custom.orderNo], 'test');
        assert.lengthOf(h.rows('PrimeMembershipNotification'), 1);
    });

    it('stays within the platform limit of 10 created custom objects in the request', function () {
        h.state.sessionCustomerNo = 'C1';
        fixtures.form(h, 'primeMembershipSelect', { planID: 'prime', transactionType: 'PURCHASE', nonce: 'nonce-0001', acceptTerms: true });
        var id = h.route('PrimeMembership', 'StartCheckout', { customerNo: 'C1' }).redirectUrl.split('/id/')[1];
        fixtures.form(h, 'primeMembershipBilling', fixtures.ADDRESS);
        h.route('PrimeMembership', 'SaveBilling', { customerNo: 'C1', query: { id: id } });
        fixtures.form(h, 'primeMembershipPayment', { paymentMethod: 'CREDIT_CARD' });
        h.state.processorPays = true;
        var before = h.state.creates;
        h.route('PrimeMembership', 'PlaceOrder', { customerNo: 'C1', query: { id: id } });
        assert.isAtMost(h.state.creates - before, 10);
    });

    describe('delayed payment', function () {
        it('waits without granting anything while the order is not paid', function () {
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime', { paid: false });
            assert.equal(flow.record.custom.status, 'AWAITING_PAYMENT');
            assert.equal(subscription().custom.status, 'PENDING_PAYMENT');
            assert.isNull(h.require('scripts/helpers/membershipBenefitHelpers').getActiveMembership('C1'));
        });

        it('shows that on the confirmation page', function () {
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime', { paid: false });
            assert.equal(h.route('PrimeMembership', 'Confirmation', { customerNo: 'C1', query: { id: flow.id } }).data.transaction.status, 'AWAITING_PAYMENT');
        });

        it('activates when the job later sees the order paid', function () {
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime', { paid: false });
            h.state.orders[flow.record.custom.orderNo].paymentStatus.value = h.Order.PAYMENT_STATUS_PAID;
            assert.equal(h.require('scripts/helpers/membershipPaymentHelpers').reconcileTransactions(10).activated, 1);
            assert.equal(subscription().custom.status, 'ACTIVE');
        });

        it('stays pending on later job runs until something changes', function () {
            fixtures.checkout(h, 'C1', 'PURCHASE', 'prime', { paid: false });
            assert.equal(h.require('scripts/helpers/membershipPaymentHelpers').reconcileTransactions(10).stillPending, 1);
            assert.equal(subscription().custom.status, 'PENDING_PAYMENT');
        });

        it('blocks a second purchase while one is waiting', function () {
            fixtures.checkout(h, 'C1', 'PURCHASE', 'prime', { paid: false });
            var second = fixtures.checkout(h, 'C1', 'PURCHASE', 'ultra-prime', { nonce: 'nonce-0002' });
            assert.isNull(second.record);
            assert.equal(JSON.parse(h.state.flash.primeMembershipFlash).error, 'payment-pending');
        });

        it('uses a payment adapter when one is registered', function () {
            h.state.hooks['app.plugin.primemembership.payment'] = { verifyPayment: function (data) { return { status: 'CAPTURED', amountCents: data.totalCents, currency: 'USD', reference: 'gateway-1' }; } };
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime', { paid: false });
            assert.equal(flow.record.custom.status, 'COMPLETED');
            assert.equal(flow.record.custom.paymentReference, 'gateway-1');
        });

        it('treats a broken adapter as not yet known, not as paid or failed', function () {
            h.state.hooks['app.plugin.primemembership.payment'] = { verifyPayment: function () { throw new Error('down'); } };
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
            assert.equal(flow.record.custom.status, 'AWAITING_PAYMENT');
        });
    });

    describe('failed payment', function () {
        it('grants nothing and marks the membership PAYMENT_FAILED when declined', function () {
            h.state.declinePayment = true;
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
            assert.equal(flow.record.custom.status, 'FAILED');
            assert.equal(subscription().custom.status, 'PAYMENT_FAILED');
            assert.isNull(subscription().custom.pendingTransactionID);
            assert.isNull(h.require('scripts/helpers/membershipBenefitHelpers').getActiveMembership('C1'));
        });

        it('tells the customer about a declined payment', function () {
            h.state.declinePayment = true;
            fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
            assert.isTrue(h.rows('PrimeMembershipNotification').some(function (n) { return n.custom.type === 'PAYMENT_FAILED'; }));
        });

        it('allows a new attempt after a decline', function () {
            h.state.declinePayment = true;
            fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
            h.state.declinePayment = false;
            var second = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime', { nonce: 'nonce-0002' });
            assert.equal(second.record.custom.status, 'COMPLETED');
            assert.equal(subscription().custom.status, 'ACTIVE');
        });

        it('keeps the quote open on an invalid card, so the customer can correct it', function () {
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime', { invalidCard: true });
            assert.equal(flow.record.custom.status, 'QUOTED');
            assert.equal(JSON.parse(h.state.flash.primeMembershipFlash).error, 'payment-details');
            assert.isNull(subscription());
        });

        it('fails the order and grants nothing when the fraud check fails', function () {
            h.state.fraud = 'fail';
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
            assert.equal(flow.record.custom.status, 'FAILED');
            assert.equal(h.state.orders[flow.record.custom.orderNo].status.value, h.Order.ORDER_STATUS_FAILED);
        });

        it('fails cleanly when the order can\'t be placed', function () {
            h.state.placeFails = true;
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
            assert.equal(flow.record.custom.status, 'FAILED');
            assert.equal(h.state.orders[flow.record.custom.orderNo].status.value, h.Order.ORDER_STATUS_FAILED);
        });

        it('releases the customer lock after every outcome', function () {
            h.state.declinePayment = true;
            fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
            assert.isNull(h.get('PrimeMembershipJobState', 'lock-C1'));
        });
    });

    describe('compatibility', function () {
        it('does not count the fee for a member\'s merchandise benefits', function () {
            fixtures.member(h, 'C1', 'ultra-prime-max', { startMs: Date.now() - 400 * fixtures.DAY, status: 'EXPIRED' });
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
            assert.equal(flow.record.custom.status, 'COMPLETED');
            assert.lengthOf(h.rows('PrimeMembershipBenefitUsage'), 0);
        });

        it('does not place the fee order through the loyalty wrapper of COHelpers.placeOrder', function () {
            var placed = [];
            var base = h.require('scripts/checkout/checkoutHelpers').placeOrder;
            assert.isFunction(base);
            var COHelpers = h.require('scripts/checkout/checkoutHelpers');
            COHelpers.placeOrder = function () { placed.push('wrapper'); return { error: false }; };
            fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
            assert.deepEqual(placed, []);
        });

        it('ignores payment methods the merchant has not allowed for fees, like a wallet', function () {
            h.state.sessionCustomerNo = 'C1';
            fixtures.form(h, 'primeMembershipSelect', { planID: 'prime', transactionType: 'PURCHASE', nonce: 'nonce-0001', acceptTerms: true });
            var id = h.route('PrimeMembership', 'StartCheckout', { customerNo: 'C1' }).redirectUrl.split('/id/')[1];
            fixtures.form(h, 'primeMembershipBilling', fixtures.ADDRESS);
            h.route('PrimeMembership', 'SaveBilling', { customerNo: 'C1', query: { id: id } });
            fixtures.form(h, 'primeMembershipPayment', { paymentMethod: 'WALLET' });
            h.route('PrimeMembership', 'PlaceOrder', { customerNo: 'C1', query: { id: id } });
            assert.equal(JSON.parse(h.state.flash.primeMembershipFlash).error, 'payment-method-unavailable');
            assert.equal(h.get('PrimeMembershipTransaction', id).custom.status, 'QUOTED');
        });
    });
});
