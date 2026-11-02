'use strict';

var assert = require('chai').assert;
var harness = require('../fixtures/harness');
var fixtures = require('../fixtures/fixtures');

describe('security', function () {
    var h;
    beforeEach(function () {
        h = harness();
        fixtures.plans(h);
    });

    describe('unauthenticated access', function () {
        ['Join', 'Upgrade', 'Renew', 'Dashboard', 'Cancel', 'Checkout', 'Confirmation', 'Event'].forEach(function (route) {
            it('sends a guest from ' + route + ' to login', function () {
                var res = h.route('PrimeMembership', route, { query: { plan: 'prime', id: 'x' } });
                assert.include(res.redirectUrl, 'Login-Show');
                assert.isUndefined(res.template);
            });
        });

        ['StartCheckout', 'SaveBilling', 'PlaceOrder', 'CancelSubmit', 'Reactivate', 'UpdateSettings'].forEach(function (route) {
            it('refuses a guest POST to ' + route, function () {
                var res = h.route('PrimeMembership', route, { query: { id: 'x' } });
                assert.include(res.redirectUrl, 'Login-Show');
            });
        });

        it('treats a remembered but not logged-in customer as a guest', function () {
            fixtures.member(h, 'C1', 'prime');
            assert.include(h.route('PrimeMembership', 'Dashboard', { customerNo: 'C1', authenticated: false }).redirectUrl, 'Login-Show');
        });
    });

    describe('CSRF', function () {
        ['StartCheckout', 'SaveBilling', 'PlaceOrder', 'CancelSubmit', 'Reactivate', 'UpdateSettings'].forEach(function (route) {
            it('rejects ' + route + ' without a valid token', function () {
                var res = h.route('PrimeMembership', route, { customerNo: 'C1', csrfValid: false, query: { id: 'x' } });
                assert.equal(res.redirectUrl, 'CSRF-Fail');
                assert.isTrue(res.halted);
            });
        });

        it('leaves a membership untouched when a cancel has no token', function () {
            var member = fixtures.member(h, 'C1', 'prime');
            h.route('PrimeMembership', 'CancelSubmit', { customerNo: 'C1', csrfValid: false });
            assert.equal(member.custom.status, 'ACTIVE');
        });
    });

    describe('cross-customer access', function () {
        it('does not show another customer\'s transaction', function () {
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
            var res = h.route('PrimeMembership', 'Confirmation', { customerNo: 'C2', query: { id: flow.id } });
            assert.isUndefined(res.template);
            assert.include(res.redirectUrl, 'PrimeMembership-Dashboard');
        });

        it('does not let another customer pay on a transaction', function () {
            h.state.sessionCustomerNo = 'C1';
            fixtures.form(h, 'primeMembershipSelect', { planID: 'prime', transactionType: 'PURCHASE', nonce: 'nonce-0001', acceptTerms: true });
            var id = h.route('PrimeMembership', 'StartCheckout', { customerNo: 'C1' }).redirectUrl.split('/id/')[1];
            fixtures.form(h, 'primeMembershipPayment', { paymentMethod: 'CREDIT_CARD' });
            h.route('PrimeMembership', 'PlaceOrder', { customerNo: 'C2', query: { id: id } });
            assert.equal(h.get('PrimeMembershipTransaction', id).custom.status, 'QUOTED');
        });

        it('does not let another customer change a billing address', function () {
            h.state.sessionCustomerNo = 'C1';
            fixtures.form(h, 'primeMembershipSelect', { planID: 'prime', transactionType: 'PURCHASE', nonce: 'nonce-0001', acceptTerms: true });
            var id = h.route('PrimeMembership', 'StartCheckout', { customerNo: 'C1' }).redirectUrl.split('/id/')[1];
            fixtures.form(h, 'primeMembershipBilling', fixtures.ADDRESS);
            h.route('PrimeMembership', 'SaveBilling', { customerNo: 'C2', query: { id: id } });
            assert.isNull(h.state.tempBaskets[h.get('PrimeMembershipTransaction', id).custom.basketUUID].billingAddress);
        });

        it('dashboard only ever reads the signed-in customer\'s records', function () {
            fixtures.member(h, 'C1', 'ultra-prime-max');
            var res = h.route('PrimeMembership', 'Dashboard', { customerNo: 'C2', query: { customerNo: 'C1' } });
            assert.isNull(res.data.membership);
        });
    });

    describe('forged payments and tampering', function () {
        it('ignores a paid flag or amount sent with the request', function () {
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime', { paid: false });
            h.route('PrimeMembership', 'Confirmation', { customerNo: 'C1', query: { id: flow.id, status: 'COMPLETED', paid: 'true' }, form: { amount: '1' } });
            assert.equal(flow.record.custom.status, 'AWAITING_PAYMENT');
            assert.isNull(h.require('scripts/helpers/membershipBenefitHelpers').getActiveMembership('C1'));
        });

        it('takes the price from the plan, not from the form', function () {
            h.state.sessionCustomerNo = 'C1';
            fixtures.form(h, 'primeMembershipSelect', { planID: 'ultra-prime-max', transactionType: 'PURCHASE', nonce: 'nonce-0001', acceptTerms: true, amount: '1', price: '1' });
            var id = h.route('PrimeMembership', 'StartCheckout', { customerNo: 'C1' }).redirectUrl.split('/id/')[1];
            assert.equal(h.get('PrimeMembershipTransaction', id).custom.amountCents, 500000);
        });

        it('sends a paid amount that differs from the quote to review, not to activation', function () {
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime', { paid: false });
            var order = h.state.orders[flow.record.custom.orderNo];
            order.paymentStatus.value = h.Order.PAYMENT_STATUS_PAID;
            order.totalGrossPrice = h.moneyOf(100);
            assert.equal(h.require('scripts/helpers/membershipPaymentHelpers').activateFromOrder(flow.record, order, 'test'), 'REVIEW');
            assert.equal(flow.record.custom.reviewReason, 'amount-mismatch');
            assert.isNull(h.require('scripts/helpers/membershipBenefitHelpers').getActiveMembership('C1'));
        });

        it('refuses another customer\'s order as proof of payment', function () {
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime', { paid: false });
            var order = h.state.orders[flow.record.custom.orderNo];
            order.paymentStatus.value = h.Order.PAYMENT_STATUS_PAID;
            order.customerNo = 'C2';
            assert.equal(h.require('scripts/helpers/membershipPaymentHelpers').activateFromOrder(flow.record, order, 'test'), 'REVIEW');
            assert.equal(flow.record.custom.reviewReason, 'order-mismatch');
        });

        it('refuses an unrelated paid order as proof of payment', function () {
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime', { paid: false });
            var other = h.orderFromBasket(Object.assign(fixtures.basket(h), { totalGrossPrice: h.moneyOf(110000), totalNetPrice: h.moneyOf(100000), totalTax: h.moneyOf(10000) }));
            other.paymentStatus.value = h.Order.PAYMENT_STATUS_PAID;
            other.status.value = h.Order.ORDER_STATUS_NEW;
            assert.equal(h.require('scripts/helpers/membershipPaymentHelpers').activateFromOrder(flow.record, other, 'test'), 'REVIEW');
        });

        it('does not treat an adapter\'s short payment as paid', function () {
            h.state.hooks['app.plugin.primemembership.payment'] = { verifyPayment: function () { return { status: 'CAPTURED', amountCents: 100, currency: 'USD', reference: 'x' }; } };
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
            assert.equal(flow.record.custom.status, 'REVIEW');
        });

        it('does not treat a payment in another currency as paid', function () {
            h.state.hooks['app.plugin.primemembership.payment'] = { verifyPayment: function (d) { return { status: 'CAPTURED', amountCents: d.totalCents, currency: 'EUR', reference: 'x' }; } };
            assert.equal(fixtures.checkout(h, 'C1', 'PURCHASE', 'prime').record.custom.status, 'REVIEW');
        });

        it('refuses a form without accepted terms', function () {
            fixtures.form(h, 'primeMembershipSelect', { planID: 'prime', transactionType: 'PURCHASE', nonce: 'nonce-0001', acceptTerms: false });
            h.route('PrimeMembership', 'StartCheckout', { customerNo: 'C1' });
            assert.lengthOf(h.rows('PrimeMembershipTransaction'), 0);
        });

        it('refuses a session in another currency', function () {
            global.session.currency = { currencyCode: 'EUR' };
            h.state.sessionCustomerNo = 'C1';
            assert.equal(h.require('scripts/helpers/membershipPaymentHelpers').startCheckout('C1', 'PURCHASE', 'prime', 'nonce-0001').errorCode, 'currency-not-supported');
        });

        it('sells nothing while a mandatory setting is missing', function () {
            h.preferences.primeMembershipFromEmail = '';
            h.state.sessionCustomerNo = 'C1';
            assert.equal(h.require('scripts/helpers/membershipPaymentHelpers').startCheckout('C1', 'PURCHASE', 'prime', 'nonce-0001').errorCode, 'disabled');
            assert.lengthOf(h.rows('PrimeMembershipTransaction'), 0);
        });

        it('refuses an unknown transaction type or plan', function () {
            var payment = h.require('scripts/helpers/membershipPaymentHelpers');
            assert.equal(payment.getQuote('C1', 'GIFT', 'prime').errorCode, 'invalid');
            assert.equal(payment.getQuote('C1', 'PURCHASE', '<script>').errorCode, 'plan-unavailable');
        });
    });

    describe('duplicates and concurrency', function () {
        it('returns the same transaction for a repeated form', function () {
            h.state.sessionCustomerNo = 'C1';
            var payment = h.require('scripts/helpers/membershipPaymentHelpers');
            var first = payment.startCheckout('C1', 'PURCHASE', 'prime', 'nonce-0001');
            var second = payment.startCheckout('C1', 'PURCHASE', 'prime', 'nonce-0001');
            assert.equal(first.transactionID, second.transactionID);
            assert.lengthOf(h.rows('PrimeMembershipTransaction'), 1);
        });

        it('does not charge again on a double submit', function () {
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
            var orders = Object.keys(h.state.orders).length;
            fixtures.form(h, 'primeMembershipPayment', { paymentMethod: 'CREDIT_CARD' });
            var again = h.route('PrimeMembership', 'PlaceOrder', { customerNo: 'C1', query: { id: flow.id } });
            assert.include(again.redirectUrl, 'PrimeMembership-Confirmation');
            assert.equal(Object.keys(h.state.orders).length, orders);
        });

        it('refuses a purchase by an active member', function () {
            fixtures.member(h, 'C1', 'prime');
            assert.equal(h.require('scripts/helpers/membershipPaymentHelpers').getQuote('C1', 'PURCHASE', 'ultra-prime').errorCode, 'already-member');
        });

        it('refuses a second upgrade while the first waits for payment', function () {
            fixtures.member(h, 'C1', 'prime');
            fixtures.checkout(h, 'C1', 'UPGRADE', 'ultra-prime', { paid: false });
            assert.equal(h.require('scripts/helpers/membershipPaymentHelpers').getQuote('C1', 'UPGRADE', 'ultra-prime-max').errorCode, 'payment-pending');
        });

        it('lets only one concurrent request through the customer lock', function () {
            var helpers = h.require('scripts/helpers/membershipHelpers');
            assert.isTrue(helpers.acquireLock('C1'));
            assert.isFalse(helpers.acquireLock('C1'));
            helpers.releaseLock('C1');
            assert.isTrue(helpers.acquireLock('C1'));
        });

        it('stops a concurrent payment at the lock, with no order and no charge', function () {
            h.state.sessionCustomerNo = 'C1';
            fixtures.form(h, 'primeMembershipSelect', { planID: 'prime', transactionType: 'PURCHASE', nonce: 'nonce-0001', acceptTerms: true });
            var id = h.route('PrimeMembership', 'StartCheckout', { customerNo: 'C1' }).redirectUrl.split('/id/')[1];
            fixtures.form(h, 'primeMembershipBilling', fixtures.ADDRESS);
            h.route('PrimeMembership', 'SaveBilling', { customerNo: 'C1', query: { id: id } });
            h.require('scripts/helpers/membershipHelpers').acquireLock('C1');
            fixtures.form(h, 'primeMembershipPayment', { paymentMethod: 'CREDIT_CARD' });
            h.route('PrimeMembership', 'PlaceOrder', { customerNo: 'C1', query: { id: id } });
            assert.lengthOf(Object.keys(h.state.orders), 0);
        });

        it('reclaims a lock left behind by a crashed request', function () {
            var helpers = h.require('scripts/helpers/membershipHelpers');
            helpers.acquireLock('C1');
            h.get('PrimeMembershipJobState', 'lock-C1').custom.updatedAt = new Date(Date.now() - 31 * 60000);
            assert.isTrue(helpers.acquireLock('C1'));
        });

        it('hits the platform\'s temporary basket limit gracefully', function () {
            h.state.sessionCustomerNo = 'C1';
            var payment = h.require('scripts/helpers/membershipPaymentHelpers');
            ['n-000001', 'n-000002', 'n-000003', 'n-000004'].forEach(function (nonce) { payment.startCheckout('C1', 'PURCHASE', 'prime', nonce); });
            assert.equal(payment.startCheckout('C1', 'PURCHASE', 'prime', 'n-000005').errorCode, 'checkout-unavailable');
        });

        it('cannot redeem a reward code of another customer', function () {
            fixtures.member(h, 'C1', 'prime');
            h.create('PrimeMembershipBenefitUsage', 'u1', { customerNo: 'C1', rewardCode: 'REWARD-1', usageStatus: 'ISSUED' });
            h.state.basket = fixtures.basket(h, { customerNo: 'C2', coupons: ['REWARD-1'] });
            var res = h.route('CheckoutServices', 'PlaceOrder', { customerNo: 'C2' });
            assert.isTrue(res.jsonData.error);
            assert.isTrue(res.halted);
        });

        it('lets the owner use their reward code', function () {
            fixtures.member(h, 'C1', 'prime');
            h.create('PrimeMembershipBenefitUsage', 'u1', { customerNo: 'C1', rewardCode: 'REWARD-1', usageStatus: 'ISSUED' });
            h.state.basket = fixtures.basket(h, { coupons: ['REWARD-1'] });
            assert.isTrue(h.route('CheckoutServices', 'PlaceOrder', { customerNo: 'C1' }).completed);
        });
    });

    describe('access enforcement', function () {
        it('refuses a locked product at add to cart, even without the storefront script', function () {
            fixtures.product(h, 'LOCKED', { custom: { primeMembershipMinRank: 1 } });
            var res = h.route('Cart', 'AddProduct', { form: { pid: 'LOCKED' } });
            assert.isTrue(res.jsonData.error);
            assert.isTrue(res.halted);
        });

        it('refuses a locked product inside a set or bundle', function () {
            fixtures.product(h, 'LOCKED', { custom: { primeMembershipMinRank: 1 } });
            fixtures.product(h, 'OPEN');
            var res = h.route('Cart', 'AddProduct', { form: { pid: 'OPEN', pidsObj: JSON.stringify([{ pid: 'LOCKED' }]) } });
            assert.isTrue(res.jsonData.error);
        });

        it('lets an ordinary product through to the base route', function () {
            fixtures.product(h, 'OPEN');
            assert.isTrue(h.route('Cart', 'AddProduct', { form: { pid: 'OPEN' } }).completed);
        });

        it('checks the basket again before the order is placed', function () {
            var product = fixtures.product(h, 'LOCKED', { custom: { primeMembershipMinRank: 3 } });
            h.state.basket = h.basket({ customerNo: 'C1', lines: [{ productID: 'LOCKED', product: product, cents: 100 }] });
            assert.isTrue(h.route('CheckoutServices', 'PlaceOrder', { customerNo: 'C1' }).jsonData.error);
        });

        it('applies the same rule to Shop API shoppers', function () {
            fixtures.product(h, 'LOCKED', { custom: { primeMembershipMinRank: 1 } });
            var api = h.require('scripts/hooks/membershipShopApi');
            assert.isTrue(api.beforePOST(h.basket({ customerNo: null, customer: null }), [{ productId: 'LOCKED' }]).isError());
        });

        it('refuses a Shop API order whose savings are no longer allowed', function () {
            var member = fixtures.member(h, 'C1', 'prime');
            var basket = fixtures.basket(h);
            h.calculate(basket);
            var order = h.orderFromBasket(basket);
            member.custom.status = 'SUSPENDED';
            assert.isTrue(h.require('scripts/hooks/membershipShopApi').afterPOST(order).isError());
        });

        it('limits the labels route to safe IDs and a bounded count', function () {
            var seen = [];
            var ids = [];
            for (var i = 0; i < 60; i++) ids.push('P' + i);
            h.mock('dw/catalog/ProductMgr').getProduct = function (id) { seen.push(id); return null; };
            h.route('PrimeMembership', 'ProductLabels', { query: { pids: ids.join(',') + ',<script>' } });
            assert.lengthOf(seen, 48);
            assert.notInclude(seen, '<script>');
        });
    });

    describe('Business Manager', function () {
        function bm(node, params, method) {
            global.request = {
                httpMethod: method || 'GET',
                httpParameterMap: { get: function (name) { return { submitted: Object.prototype.hasOwnProperty.call(params || {}, name), stringValue: (params || {})[name] }; } }
            };
            global.response = { redirect: function (url) { this.url = String(url); }, setStatus: function (code) { this.status = code; } };
            h.requireBm('controllers/PrimeMembershipAdmin')[node]();
            return global.response;
        }

        it('refuses a session that is not authenticated', function () {
            global.session.userAuthenticated = false;
            assert.equal(bm('Home').status, 403);
            assert.equal(bm('MemberAction', { customerNo: 'C1', action: 'suspend', reason: 'x' }, 'POST').status, 403);
        });

        it('refuses a change without POST', function () {
            var member = fixtures.member(h, 'C1', 'prime');
            assert.equal(bm('MemberAction', { customerNo: 'C1', action: 'suspend', reason: 'x' }, 'GET').status, 403);
            assert.equal(member.custom.status, 'ACTIVE');
        });

        it('refuses a change without a CSRF token', function () {
            var member = fixtures.member(h, 'C1', 'prime');
            h.state.bmCsrfValid = false;
            assert.equal(bm('MemberAction', { customerNo: 'C1', action: 'suspend', reason: 'x' }, 'POST').status, 403);
            assert.equal(member.custom.status, 'ACTIVE');
        });

        it('suspends with the BM user recorded in the audit trail', function () {
            var member = fixtures.member(h, 'C1', 'prime');
            bm('MemberAction', { customerNo: 'C1', action: 'suspend', reason: 'chargeback' }, 'POST');
            assert.equal(member.custom.status, 'SUSPENDED');
            assert.isTrue(h.rows('PrimeMembershipAudit').some(function (a) { return a.custom.actorReference === 'admin:admin'; }));
        });

        it('cannot grant a membership through a review unless the order is paid', function () {
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime', { paid: false });
            var order = h.state.orders[flow.record.custom.orderNo];
            order.paymentStatus.value = h.Order.PAYMENT_STATUS_PAID;
            order.totalGrossPrice = h.moneyOf(100);
            h.require('scripts/helpers/membershipPaymentHelpers').activateFromOrder(flow.record, order, 'test');
            var res = bm('ResolveReview', { id: flow.id, action: 'apply', reason: 'looks fine' }, 'POST');
            assert.include(res.url, 'error=not-paid');
            assert.isNull(h.require('scripts/helpers/membershipBenefitHelpers').getActiveMembership('C1'));
        });

        it('applies a review once the order really is paid for the quoted amount', function () {
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime', { paid: false });
            var order = h.state.orders[flow.record.custom.orderNo];
            var real = order.totalGrossPrice;
            order.paymentStatus.value = h.Order.PAYMENT_STATUS_PAID;
            order.totalGrossPrice = h.moneyOf(100);
            h.require('scripts/helpers/membershipPaymentHelpers').activateFromOrder(flow.record, order, 'test');
            order.totalGrossPrice = real;
            bm('ResolveReview', { id: flow.id, action: 'apply', reason: 'corrected' }, 'POST');
            assert.equal(flow.record.custom.status, 'COMPLETED');
            assert.equal(h.get('PrimeMembershipSubscription', 'C1').custom.status, 'ACTIVE');
        });

        it('renders the desk pages without error', function () {
            fixtures.member(h, 'C1', 'prime');
            ['Home', 'Plans', 'Members', 'Reviews', 'Audit'].forEach(function (node) {
                bm(node);
                assert.equal(h.state.rendered.template, 'primemembershipadmin/page', node);
            });
            bm('Member', { customerNo: 'C1' });
            assert.equal(h.state.rendered.data.model.title, 'Membership C1');
        });

        it('shows the configuration problems on the overview', function () {
            h.preferences.primeMembershipFromEmail = '';
            bm('Home');
            assert.include(JSON.stringify(h.state.rendered.data.model.sections[0]), 'primeMembershipFromEmail');
        });
    });

    describe('sensitive data', function () {
        it('logs no card data, addresses or e-mail addresses', function () {
            h.state.declinePayment = true;
            fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
            var logs = JSON.stringify(h.state.logs);
            assert.notInclude(logs, 'not-stored');
            assert.notInclude(logs, '1 Main St');
            assert.notInclude(logs, '@example.com');
        });

        it('stores no card data on membership records', function () {
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
            assert.notInclude(JSON.stringify(flow.record.custom), 'cardNumber');
            assert.notInclude(JSON.stringify(h.get('PrimeMembershipSubscription', 'C1').custom), 'cardNumber');
        });
    });
});
