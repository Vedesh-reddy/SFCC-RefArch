'use strict';

var assert = require('chai').assert;
var harness = require('../fixtures/harness');
var fixtures = require('../fixtures/fixtures');

var DAY = fixtures.DAY;

describe('benefit engine', function () {
    var h;
    var helpers;

    function setup(change, options) {
        h = harness(options);
        fixtures.plans(h, change);
        helpers = h.require('scripts/helpers/membershipBenefitHelpers');
    }

    function lineCents(basket, index) {
        return basket.lines[index || 0].adjustments.reduce(function (sum, a) { return sum + Math.abs(Math.round(a.price.value * 100)); }, 0);
    }

    function shippingCents(basket) {
        return basket.defaultShipment.standardShippingLineItem.adjustments.reduce(function (sum, a) { return sum + Math.abs(Math.round(a.price.value * 100)); }, 0);
    }

    beforeEach(function () { setup(); });

    describe('entitlement lookups', function () {
        it('finds the active membership and tier', function () {
            fixtures.member(h, 'C1', 'ultra-prime');
            assert.equal(helpers.getMembershipTier('C1').planRank, 2);
            assert.isNull(helpers.getMembershipTier('C2'));
        });

        it('gives nothing while the plugin is off', function () {
            fixtures.member(h, 'C1', 'prime');
            h.preferences.primeMembershipEnabled = false;
            assert.isNull(helpers.getActiveMembership('C1'));
        });

        it('gives nothing when the plan configuration is invalid, even to a paid member', function () {
            fixtures.member(h, 'C1', 'prime');
            h.get('PrimeMembershipPlan', 'prime').custom.benefits = JSON.stringify({ 'member-discount': { enabled: true, percent: 5 } });
            assert.isNull(helpers.getActiveMembership('C1'));
        });

        it('lists a plan\'s benefits in order, 12 for Max', function () {
            fixtures.member(h, 'C1', 'ultra-prime-max');
            assert.lengthOf(helpers.getAvailableBenefits('C1'), 12);
            assert.equal(helpers.getAvailableBenefits('C1')[0].id, 'free-shipping');
        });

        it('never reports an external benefit as active while its system is missing', function () {
            fixtures.member(h, 'C1', 'ultra-prime-max');
            var byId = {};
            helpers.getAvailableBenefits('C1').forEach(function (b) { byId[b.id] = b.status; });
            assert.equal(byId['extended-returns'], 'INTEGRATION_REQUIRED');
            assert.equal(byId['gift-wrap'], 'INTEGRATION_REQUIRED');
            assert.equal(byId['loyalty-multiplier'], 'INTEGRATION_REQUIRED');
            assert.equal(byId['priority-support'], 'INTEGRATION_REQUIRED');
            assert.equal(byId['member-discount'], 'ACTIVE');
        });

        it('reports them active once the merchant confirms the connection', function () {
            h.preferences.primeMembershipConnectedIntegrations = ['returns', 'gift-wrap', 'support'];
            fixtures.member(h, 'C1', 'ultra-prime-max');
            var byId = {};
            helpers.getAvailableBenefits('C1').forEach(function (b) { byId[b.id] = b.status; });
            assert.equal(byId['extended-returns'], 'ACTIVE');
            assert.equal(byId['priority-support'], 'ACTIVE');
        });

        it('reports a reward without a coupon as needing setup', function () {
            setup(function (plan) { if (plan.benefits['birthday-reward']) plan.benefits['birthday-reward'].couponID = ''; });
            fixtures.member(h, 'C1', 'prime');
            assert.equal(helpers.isBenefitEligible('C1', 'birthday-reward').reason, 'not-available');
        });

        it('reports a reward whose coupon does not exist as needing setup, not as active', function () {
            fixtures.member(h, 'C1', 'prime');
            assert.equal(helpers.getAvailableBenefits('C1').filter(function (b) { return b.id === 'birthday-reward'; })[0].status, 'SETUP_REQUIRED');
            fixtures.coupon(h, 'birthday');
            assert.equal(helpers.getAvailableBenefits('C1').filter(function (b) { return b.id === 'birthday-reward'; })[0].status, 'ACTIVE');
        });

        it('says a benefit is not on the plan when it isn\'t', function () {
            fixtures.member(h, 'C1', 'prime');
            assert.equal(helpers.isBenefitEligible('C1', 'gift-wrap').reason, 'not-on-plan');
        });

        it('applies validity dates, countries and customer groups', function () {
            setup(function (plan) {
                plan.benefits['member-discount'].validFrom = '2099-01-01T00:00:00Z';
                plan.benefits['free-shipping'].countries = ['CA'];
                plan.benefits['exclusive-deals'].customerGroupIDs = ['vip'];
            });
            fixtures.member(h, 'C1', 'prime');
            assert.equal(helpers.isBenefitEligible('C1', 'member-discount').reason, 'not-started');
            assert.equal(helpers.isBenefitEligible('C1', 'free-shipping', { countryCode: 'US' }).reason, 'country');
            assert.equal(helpers.isBenefitEligible('C1', 'exclusive-deals', { customer: { isMemberOfAnyCustomerGroup: function () { return false; } } }).reason, 'customer-group');
        });

        it('stops a benefit at its usage limit and at its annual cap', function () {
            setup(function (plan) { plan.benefits['member-discount'].maxUsesPerPeriod = 2; });
            fixtures.member(h, 'C1', 'prime', { counters: { 'member-discount': { uses: 2, cents: 100 }, 'free-shipping': { uses: 1, cents: 30000 } } });
            assert.equal(helpers.isBenefitEligible('C1', 'member-discount').reason, 'usage-limit');
            assert.equal(helpers.isBenefitEligible('C1', 'free-shipping').reason, 'annual-cap');
        });
    });

    describe('member discount on a basket', function () {
        it('applies 5%, 10% and 15% for the three plans', function () {
            [['prime', 500], ['ultra-prime', 1000], ['ultra-prime-max', 1500]].forEach(function (entry, i) {
                var no = 'C' + i;
                fixtures.member(h, no, entry[0]);
                var basket = fixtures.basket(h, { customerNo: no });
                helpers.applyMembershipSavings(basket);
                assert.equal(lineCents(basket), entry[1], entry[0]);
            });
        });

        it('leaves a nonmember\'s basket untouched', function () {
            var basket = fixtures.basket(h, { customerNo: 'NOBODY' });
            helpers.applyMembershipSavings(basket);
            assert.equal(lineCents(basket), 0);
            assert.equal(shippingCents(basket), 0);
        });

        it('gives nothing to a remembered customer who has not logged in', function () {
            fixtures.member(h, 'C1', 'prime');
            var basket = fixtures.basket(h, { authenticated: false });
            helpers.applyMembershipSavings(basket);
            assert.equal(lineCents(basket), 0);
        });

        it('gives nothing to a guest basket', function () {
            var basket = fixtures.basket(h, { customerNo: null, customer: null });
            helpers.applyMembershipSavings(basket);
            assert.equal(lineCents(basket), 0);
        });

        it('stops at the per-order cap', function () {
            fixtures.member(h, 'C1', 'prime');
            var basket = fixtures.basket(h, { lines: [{ productID: 'P1', cents: 1000000 }] });
            helpers.applyMembershipSavings(basket);
            assert.equal(lineCents(basket), 10000);
        });

        it('spreads the per-order cap over several lines without passing it', function () {
            fixtures.member(h, 'C1', 'prime');
            fixtures.product(h, 'P2');
            var basket = fixtures.basket(h, { lines: [{ productID: 'P1', cents: 150000 }, { productID: 'P2', cents: 150000 }] });
            helpers.applyMembershipSavings(basket);
            assert.equal(lineCents(basket, 0), 7500);
            assert.equal(lineCents(basket, 1), 2500);
        });

        it('stops at what is left of the annual cap', function () {
            fixtures.member(h, 'C1', 'prime', { counters: { 'member-discount': { uses: 1, cents: 59800 } } });
            var basket = fixtures.basket(h);
            helpers.applyMembershipSavings(basket);
            assert.equal(lineCents(basket), 200);
        });

        it('multiplies by quantity', function () {
            fixtures.member(h, 'C1', 'prime');
            var basket = fixtures.basket(h, { lines: [{ productID: 'P1', cents: 1000, qty: 3 }] });
            helpers.applyMembershipSavings(basket);
            assert.equal(lineCents(basket), 150);
        });

        it('rebuilds the adjustment on each calculation instead of adding another', function () {
            fixtures.member(h, 'C1', 'prime');
            var basket = fixtures.basket(h);
            helpers.applyMembershipSavings(basket);
            helpers.applyMembershipSavings(basket);
            helpers.applyMembershipSavings(basket);
            assert.equal(lineCents(basket), 500);
        });

        it('takes the adjustment off when the membership ended', function () {
            var member = fixtures.member(h, 'C1', 'prime');
            var basket = fixtures.basket(h);
            helpers.applyMembershipSavings(basket);
            member.custom.status = 'SUSPENDED';
            helpers.applyMembershipSavings(basket);
            assert.equal(lineCents(basket), 0);
        });

        it('skips excluded products, also through their master', function () {
            setup(function (plan) { plan.benefits['member-discount'].excludedProductIDs = ['MASTER']; });
            fixtures.member(h, 'C1', 'prime');
            var master = fixtures.product(h, 'MASTER');
            var variant = fixtures.product(h, 'V1', { master: master });
            var basket = h.basket({ customerNo: 'C1', lines: [{ productID: 'V1', cents: 10000, product: variant }], shipping: { methodID: 'none' } });
            helpers.applyMembershipSavings(basket);
            assert.equal(lineCents(basket), 0);
        });

        it('skips excluded categories and honours included ones', function () {
            setup(function (plan) {
                plan.benefits['member-discount'].excludedCategoryIDs = ['sale'];
                plan.benefits['member-discount'].includedCategoryIDs = ['womens'];
            });
            fixtures.member(h, 'C1', 'prime');
            fixtures.product(h, 'IN', { categories: ['womens'] });
            fixtures.product(h, 'OUT', { categories: ['mens'] });
            fixtures.product(h, 'BOTH', { categories: ['womens', 'sale'] });
            var basket = h.basket({ customerNo: 'C1', lines: [{ productID: 'IN', cents: 10000 }, { productID: 'OUT', cents: 10000 }, { productID: 'BOTH', cents: 10000 }] });
            helpers.applyMembershipSavings(basket);
            assert.deepEqual([lineCents(basket, 0), lineCents(basket, 1), lineCents(basket, 2)], [500, 0, 0]);
        });

        it('never discounts a non-catalog or bonus line', function () {
            fixtures.member(h, 'C1', 'prime');
            fixtures.product(h, 'P1');
            var basket = h.basket({ customerNo: 'C1', lines: [{ productID: 'NOT-IN-CATALOG', cents: 10000 }, { productID: 'P1', cents: 10000, bonus: true }] });
            helpers.applyMembershipSavings(basket);
            assert.equal(lineCents(basket, 0) + lineCents(basket, 1), 0);
        });

        it('leaves seller offers alone unless a funding policy is approved', function () {
            fixtures.member(h, 'C1', 'prime');
            var offerBasket = fixtures.basket(h, { lines: [{ productID: 'P1', cents: 10000, custom: { mktOfferId: 'O1' } }] });
            helpers.applyMembershipSavings(offerBasket);
            assert.equal(lineCents(offerBasket), 0);
            h.preferences.primeMembershipDiscountSellerOffers = true;
            helpers.applyMembershipSavings(offerBasket);
            assert.equal(lineCents(offerBasket), 500);
        });

        it('works when plugin_seller is absent and reading its attribute throws', function () {
            fixtures.member(h, 'C1', 'prime');
            var basket = fixtures.basket(h);
            basket.lines[0].custom = new Proxy({}, { get: function () { throw new Error('undefined attribute'); } });
            helpers.applyMembershipSavings(basket);
            assert.equal(lineCents(basket), 500);
        });
    });

    describe('promotion stacking', function () {
        function promoted(policy) {
            setup(function (plan) { plan.benefits['member-discount'].promotionPolicy = policy; });
            fixtures.member(h, 'C1', 'prime');
            var basket = fixtures.basket(h, { lines: [{ productID: 'P1', cents: 10000, promotions: [200] }] });
            helpers.applyMembershipSavings(basket);
            return lineCents(basket) - 200;
        }

        it('exclude-promoted skips a line that has a promotion', function () {
            assert.equal(promoted('exclude-promoted'), 0);
        });

        it('stack discounts what is left after the promotion', function () {
            assert.equal(promoted('stack'), 490);
        });

        it('best-of only adds what makes the member price better', function () {
            assert.equal(promoted('best-of'), 300);
        });

        it('best-of adds nothing when the promotion is already better', function () {
            setup(function (plan) { plan.benefits['member-discount'].promotionPolicy = 'best-of'; });
            fixtures.member(h, 'C1', 'prime');
            var basket = fixtures.basket(h, { lines: [{ productID: 'P1', cents: 10000, promotions: [900] }] });
            helpers.applyMembershipSavings(basket);
            assert.equal(lineCents(basket), 900);
        });
    });

    describe('deals', function () {
        function withDeal(percent, extra) {
            setup(function (plan) { plan.benefits['exclusive-deals'].deals = [Object.assign({ percent: percent, productIDs: ['P1'] }, extra || {})]; });
            fixtures.member(h, 'C1', 'prime');
        }

        it('applies a deal when it beats the member discount, and not both', function () {
            withDeal(20);
            var basket = fixtures.basket(h);
            helpers.applyMembershipSavings(basket);
            assert.equal(lineCents(basket), 2000);
            assert.lengthOf(basket.lines[0].adjustments, 1);
        });

        it('keeps the member discount when the deal is lower', function () {
            withDeal(2);
            var basket = fixtures.basket(h);
            helpers.applyMembershipSavings(basket);
            assert.equal(lineCents(basket), 500);
        });

        it('ignores a deal outside its dates', function () {
            withDeal(20, { endsAt: '2020-01-01T00:00:00Z' });
            var basket = fixtures.basket(h);
            helpers.applyMembershipSavings(basket);
            assert.equal(lineCents(basket), 500);
        });

        it('caps deals on their own', function () {
            withDeal(50);
            var basket = fixtures.basket(h, { lines: [{ productID: 'P1', cents: 100000 }] });
            helpers.applyMembershipSavings(basket);
            assert.equal(lineCents(basket), 5000);
        });
    });

    describe('free shipping', function () {
        it('removes the shipping cost on an eligible method', function () {
            fixtures.member(h, 'C1', 'prime');
            var basket = fixtures.basket(h);
            helpers.applyMembershipSavings(basket);
            assert.equal(shippingCents(basket), 1000);
        });

        it('leaves an ineligible method alone: Prime does not get express', function () {
            fixtures.member(h, 'C1', 'prime');
            var basket = fixtures.basket(h, { shipping: { methodID: 'express', cents: 2000, country: 'US' } });
            helpers.applyMembershipSavings(basket);
            assert.equal(shippingCents(basket), 0);
        });

        it('lets a higher plan have more methods through configuration', function () {
            setup(function (plan) { if (plan.planID === 'ultra-prime-max') plan.benefits['free-shipping'].methodIDs = ['standard', 'express', 'same-day']; });
            fixtures.member(h, 'C1', 'ultra-prime-max');
            var basket = fixtures.basket(h, { shipping: { methodID: 'same-day', cents: 3000, country: 'US' } });
            helpers.applyMembershipSavings(basket);
            assert.equal(shippingCents(basket), 3000);
        });

        it('stops at the per-order and annual subsidy caps', function () {
            fixtures.member(h, 'C1', 'prime', { counters: { 'free-shipping': { uses: 3, cents: 29900 } } });
            var basket = fixtures.basket(h);
            helpers.applyMembershipSavings(basket);
            assert.equal(shippingCents(basket), 100);
        });

        it('honours geographic restrictions', function () {
            setup(function (plan) { plan.benefits['free-shipping'].countries = ['CA']; });
            fixtures.member(h, 'C1', 'prime');
            var basket = fixtures.basket(h);
            helpers.applyMembershipSavings(basket);
            assert.equal(shippingCents(basket), 0);
        });
    });

    describe('the calculate hook', function () {
        it('fails closed: an error removes all member savings', function () {
            fixtures.member(h, 'C1', 'prime');
            var basket = fixtures.basket(h);
            helpers.applyMembershipSavings(basket);
            h.get('PrimeMembershipSubscription', 'C1').custom.benefitCounters = '{broken';
            basket.lines[0].createPriceAdjustment = function () { throw new Error('boom'); };
            h.calculateHook().calculateTax(basket);
            assert.equal(lineCents(basket), 0);
            assert.isTrue(h.state.logs.some(function (l) { return l.level === 'error'; }));
        });

        it('leaves anything that is not a basket alone', function () {
            assert.doesNotThrow(function () { h.calculateHook().calculateTax({ custom: {} }); });
        });

        it('returns nothing, so the base tax hook still runs', function () {
            assert.isUndefined(h.calculateHook().calculateTax(fixtures.basket(h)));
        });

        it('strips order promotions and shipping from a membership fee basket', function () {
            var basket = h.basket({ lines: [{ productID: 'prime-membership-fee', cents: 100000, promotions: [500] }], orderPromotions: [1000], shipping: { cents: 599 } });
            basket.custom.primeMembershipTransactionID = 'T1';
            h.calculate(basket);
            assert.equal(h.mock('dw/value/Money') && Math.round(basket.totalNetPrice.value * 100), 100000);
            assert.lengthOf(basket.orderAdjustments, 0);
        });

        it('recognises a fee line even when the basket lost its marker', function () {
            var basket = h.basket({ lines: [{ productID: 'prime-membership-fee', cents: 100000 }], orderPromotions: [1000] });
            assert.isTrue(helpers.isFeeContainer(basket));
        });

        it('does not treat a catalog product of the same ID as a fee', function () {
            fixtures.product(h, 'prime-membership-fee');
            assert.isFalse(helpers.isFeeContainer(h.basket({ lines: [{ productID: 'prime-membership-fee', cents: 100 }] })));
        });
    });

    describe('reservations', function () {
        function placedOrder(customerNo) {
            var basket = fixtures.basket(h, { customerNo: customerNo || 'C1' });
            h.calculate(basket);
            return h.orderFromBasket(basket);
        }

        it('counts the savings against the caps when the order is created', function () {
            var member = fixtures.member(h, 'C1', 'prime');
            var order = placedOrder();
            assert.isTrue(helpers.reserveOrderBenefits(order));
            var counters = JSON.parse(member.custom.benefitCounters);
            assert.equal(counters['member-discount'].cents, 500);
            assert.equal(counters['free-shipping'].cents, 1000);
            assert.equal(order.custom.primeMembershipSavingsCents, 500);
            assert.equal(order.custom.primeMembershipShippingSavingsCents, 1000);
        });

        it('creates one usage row per order, to stay inside the platform creation quota', function () {
            fixtures.member(h, 'C1', 'prime');
            var before = h.state.creates;
            helpers.reserveOrderBenefits(placedOrder());
            assert.equal(h.state.creates - before, 1);
            assert.equal(h.rows('PrimeMembershipBenefitUsage')[0].custom.discountCents, 1500);
        });

        it('fails the reservation when the allowance ran out in between', function () {
            var member = fixtures.member(h, 'C1', 'prime');
            var order = placedOrder();
            member.custom.benefitCounters = JSON.stringify({ 'member-discount': { uses: 5, cents: 59900 } });
            assert.isFalse(helpers.reserveOrderBenefits(order));
            assert.lengthOf(h.rows('PrimeMembershipBenefitUsage'), 0);
        });

        it('fails the reservation when the membership ended in between', function () {
            var member = fixtures.member(h, 'C1', 'prime');
            var order = placedOrder();
            member.custom.status = 'SUSPENDED';
            assert.isFalse(helpers.reserveOrderBenefits(order));
        });

        it('cannot reserve the same order twice', function () {
            fixtures.member(h, 'C1', 'prime');
            var order = placedOrder();
            assert.isTrue(helpers.reserveOrderBenefits(order));
            assert.isFalse(helpers.reserveOrderBenefits(order));
            assert.equal(JSON.parse(h.get('PrimeMembershipSubscription', 'C1').custom.benefitCounters)['member-discount'].cents, 500);
        });

        it('gives the allowance back on release, once', function () {
            var member = fixtures.member(h, 'C1', 'prime');
            var order = placedOrder();
            helpers.reserveOrderBenefits(order);
            helpers.settleOrderBenefits(order, false);
            helpers.settleOrderBenefits(order, false);
            assert.equal(JSON.parse(member.custom.benefitCounters)['member-discount'].cents, 0);
            assert.equal(h.rows('PrimeMembershipBenefitUsage')[0].custom.usageStatus, 'RELEASED');
        });

        it('keeps a committed reservation from being released', function () {
            var member = fixtures.member(h, 'C1', 'prime');
            var order = placedOrder();
            helpers.reserveOrderBenefits(order);
            helpers.settleOrderBenefits(order, true);
            helpers.settleOrderBenefits(order, false);
            assert.equal(JSON.parse(member.custom.benefitCounters)['member-discount'].cents, 500);
            assert.equal(h.rows('PrimeMembershipBenefitUsage')[0].custom.usageStatus, 'COMMITTED');
        });

        it('does nothing for a nonmember\'s order', function () {
            assert.isTrue(helpers.reserveOrderBenefits(placedOrder('NOBODY')));
            assert.lengthOf(h.rows('PrimeMembershipBenefitUsage'), 0);
        });

        it('stamps the return window and gift wrap only when those systems are connected', function () {
            h.preferences.primeMembershipConnectedIntegrations = ['returns', 'gift-wrap'];
            fixtures.member(h, 'C1', 'ultra-prime-max');
            var basket = fixtures.basket(h, { shipping: { methodID: 'standard', cents: 1000, country: 'US', gift: true } });
            h.calculate(basket);
            var order = h.orderFromBasket(basket);
            helpers.reserveOrderBenefits(order);
            assert.equal(order.custom.primeMembershipReturnDays, 60);
            assert.isTrue(order.custom.primeMembershipGiftWrap);
        });

        it('stamps neither without the connection', function () {
            fixtures.member(h, 'C1', 'ultra-prime-max');
            var order = placedOrder();
            helpers.reserveOrderBenefits(order);
            assert.isUndefined(order.custom.primeMembershipReturnDays);
            assert.isUndefined(order.custom.primeMembershipGiftWrap);
        });

        it('wraps checkout helpers: payment failure releases, placement commits', function () {
            var member = fixtures.member(h, 'C1', 'prime');
            var COHelpers = h.require('scripts/checkout/checkoutHelpers');
            var basket = fixtures.basket(h);
            h.calculate(basket);
            var order = COHelpers.createOrder(basket);
            assert.equal(JSON.parse(member.custom.benefitCounters)['member-discount'].cents, 500);
            h.state.declinePayment = true;
            assert.isTrue(COHelpers.handlePayments(order, order.orderNo).error);
            assert.equal(JSON.parse(member.custom.benefitCounters)['member-discount'].cents, 0);
        });

        it('fails the order instead of giving savings when the wrapper can\'t reserve', function () {
            var member = fixtures.member(h, 'C1', 'prime');
            var COHelpers = h.require('scripts/checkout/checkoutHelpers');
            var basket = fixtures.basket(h);
            h.calculate(basket);
            member.custom.status = 'SUSPENDED';
            assert.isNull(COHelpers.createOrder(basket));
            assert.equal(Object.keys(h.state.orders).map(function (no) { return h.state.orders[no].status.value; })[0], h.Order.ORDER_STATUS_FAILED);
        });

        it('commits on placement through the wrapper', function () {
            fixtures.member(h, 'C1', 'prime');
            var COHelpers = h.require('scripts/checkout/checkoutHelpers');
            var basket = fixtures.basket(h);
            h.calculate(basket);
            var order = COHelpers.createOrder(basket);
            COHelpers.placeOrder(order, { status: 'success' });
            assert.equal(h.rows('PrimeMembershipBenefitUsage')[0].custom.usageStatus, 'COMMITTED');
        });
    });

    describe('benefit periods', function () {
        it('starts counters over in a new period and keeps the usage history', function () {
            var member = fixtures.member(h, 'C1', 'prime', { startMs: Date.now() - 370 * DAY, expiresMs: Date.now() + 360 * DAY, counters: { 'member-discount': { uses: 3, cents: 5000 } } });
            h.create('PrimeMembershipBenefitUsage', 'old', { usageStatus: 'COMMITTED', discountCents: 5000, customerNo: 'C1' });
            var counts = helpers.advanceBenefitPeriods(10);
            assert.equal(counts.advanced, 1);
            assert.equal(member.custom.benefitCounters, '{}');
            assert.isAbove(member.custom.benefitPeriodEnd.getTime(), Date.now());
            assert.lengthOf(h.rows('PrimeMembershipBenefitUsage'), 1);
        });

        it('leaves a membership alone while its period runs', function () {
            fixtures.member(h, 'C1', 'prime');
            assert.equal(helpers.advanceBenefitPeriods(10).advanced, 0);
        });

        it('can be repeated without resetting again', function () {
            fixtures.member(h, 'C1', 'prime', { startMs: Date.now() - 370 * DAY, expiresMs: Date.now() + 360 * DAY });
            helpers.advanceBenefitPeriods(10);
            assert.equal(helpers.advanceBenefitPeriods(10).advanced, 0);
        });

        it('respects the batch size', function () {
            ['A', 'B', 'C'].forEach(function (no) { fixtures.member(h, no, 'prime', { startMs: Date.now() - 370 * DAY, expiresMs: Date.now() + 360 * DAY }); });
            assert.equal(helpers.advanceBenefitPeriods(2).advanced, 2);
        });
    });
});
