'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var harness = require('./harness');
var fixtures = require('./fixtures');

var CANCELLED = 6;
var CREATED = 0;
var FAILED = 8;
var PAID = 2;
var CREATED_AT = new Date('2026-10-27T15:00:00Z'); // 10:00 on 2026-10-27 in the site time zone

/**
 * @param {Object} [options] - harness options
 * @returns {Object} harness with products and the clock on the order day
 */
function setup(options) {
    var h = harness(options);
    h.setNow('2026-10-27T20:00:00Z');
    fixtures.product(h, 'M1', { category: 'rings' });
    fixtures.product(h, 'V1', { master: 'M1' });
    fixtures.product(h, 'V2', { master: 'M1' });
    fixtures.product(h, 'P2', { category: 'necklaces' });
    return h;
}

/**
 * @param {Object} h - harness
 * @returns {Object} job status
 */
function reconcile(h) {
    return fixtures.jobs(h).reconcileOrders({});
}

/**
 * @param {Object} h - harness
 * @param {string} [day] - day
 * @returns {Object} site record attributes
 */
function site(h, day) {
    var record = h.get('AnalyticsSiteDaily', day || '20261027');
    return record ? record.custom : {};
}

/**
 * @param {Object} h - harness
 * @param {string} productId - product
 * @returns {Object} product record attributes
 */
function product(h, productId) {
    var record = h.get('AnalyticsProductDaily', '20261027_' + productId);
    return record ? record.custom : {};
}

/**
 * Moves an order's last change to a later second, as a real status change would.
 * @param {Object} order - order double
 * @param {Function} change - mutation
 */
var laterSteps = 0;
function later(order, change) {
    change(order);
    laterSteps += 1;
    order.lastModified = new Date(Date.now() + laterSteps * 10000);
}

describe('plugin_analytics order reconciliation job', function () {
    var clock;

    // Retention and "yesterday" are computed from the clock, so the suite runs at a fixed moment.
    beforeEach(function () {
        clock = sinon.useFakeTimers({ now: new Date('2026-10-27T20:00:00Z'), toFake: ['Date'] });
    });

    afterEach(function () {
        clock.restore();
    });

    it('counts a placed order from the order record: units, gross, discounts, shipping, tax and net', function () {
        var h = setup();
        fixtures.order(h, '1001', { created: CREATED_AT, lines: [['V1', 2, 100, 80], ['V2', 1, 50, 50], ['P2', 1, 30, 30]], shipping: 7, tax: 13 });
        assert.equal(reconcile(h).code, 'OK');
        var s = site(h);
        assert.equal(s.orders, 1);
        assert.equal(s.unitsSold, 4);
        assert.equal(s.grossCents, 18000);
        assert.equal(s.discountCents, 2000);
        assert.equal(s.netCents, 16000);
        assert.equal(s.shippingCents, 700);
        assert.equal(s.taxCents, 1300);
        assert.equal(s.totalCents, 18000);
        var m1 = product(h, 'M1');
        assert.equal(m1.orders, 1, 'two variants of one master are one order line');
        assert.equal(m1.unitsSold, 3);
        assert.equal(m1.netCents, 13000);
        assert.equal(h.get('AnalyticsCategoryDaily', '20261027_rings').custom.orders, 1);
        assert.equal(h.get('AnalyticsCategoryDaily', '20261027_necklaces').custom.netCents, 3000);
    });

    it('never counts created or failed orders', function () {
        var h = setup();
        fixtures.order(h, '1001', { created: CREATED_AT, status: CREATED, lines: [['V1', 1, 10]] });
        fixtures.order(h, '1002', { created: CREATED_AT, status: FAILED, lines: [['V1', 1, 10]] });
        reconcile(h);
        assert.equal(site(h).orders || 0, 0);
        assert.lengthOf(h.rows('AnalyticsProductDaily'), 0);
    });

    it('counts each order exactly once however often it is reconciled or the confirmation reloads', function () {
        var h = setup();
        fixtures.order(h, '1001', { created: CREATED_AT, lines: [['V1', 1, 10]] });
        reconcile(h);
        reconcile(h);
        var order = h.state.orders['1001'];
        later(order, function () {});
        reconcile(h);
        var result = h.require('scripts/helpers/analyticsAggregationHelpers').reconcileOrder(order, 'PLACED', function (id) { return { id: id === 'V1' ? 'M1' : id, categoryId: 'rings' }; }, '20200101');
        assert.equal(result, 'unchanged');
        assert.equal(site(h).orders, 1);
        assert.equal(product(h, 'M1').unitsSold, 1);
    });

    it('takes a cancelled order back out of sales and counts the cancellation', function () {
        var h = setup();
        var order = fixtures.order(h, '1001', { created: CREATED_AT, lines: [['V1', 2, 100]] });
        reconcile(h);
        later(order, function (o) { o.status.value = CANCELLED; });
        reconcile(h);
        var s = site(h);
        assert.equal(s.orders, 0);
        assert.equal(s.netCents, 0);
        assert.equal(s.unitsSold, 0);
        assert.equal(s.cancelledOrders, 1);
        assert.equal(product(h, 'M1').unitsSold, 0);
    });

    it('applies full and partial refunds from return and appeasement invoices, spread over lines', function () {
        var h = setup();
        var order = fixtures.order(h, '1001', { created: CREATED_AT, lines: [['V1', 1, 60], ['P2', 1, 40]], shipping: 10 });
        reconcile(h);
        later(order, function (o) {
            o.invoices = harness.collection([{ type: { value: 'RETURN' }, refundedAmount: new h.Money(30) }, { type: { value: 'SHIPPING' }, refundedAmount: new h.Money(99) }]);
        });
        reconcile(h);
        var s = site(h);
        assert.equal(s.refundCents, 3000, 'shipping invoices are not refunds');
        assert.equal(s.refundedOrders, 1);
        assert.equal(s.netCents, 7000);
        assert.equal(product(h, 'M1').refundCents + product(h, 'P2').refundCents, 3000);
        assert.equal(product(h, 'M1').refundCents, 1800, '60% of the merchandise');
        assert.equal(product(h, 'M1').netCents, 4200);
        later(order, function (o) {
            o.invoices = harness.collection([{ type: { value: 'RETURN' }, refundedAmount: new h.Money(60) }, { type: { value: 'APPEASEMENT' }, refundedAmount: new h.Money(60) }]);
        });
        reconcile(h);
        s = site(h);
        assert.equal(s.refundCents, 11000, 'refunds are capped at the order total');
        assert.equal(s.refundedOrders, 1);
        assert.equal(product(h, 'M1').netCents + product(h, 'P2').netCents, 0, 'merchandise fully refunded');
    });

    it('with analyticsQualifyingOrders = PAID counts an order only once its payment arrives', function () {
        var h = setup({ preferences: { analyticsQualifyingOrders: { value: 'PAID' } } });
        var order = fixtures.order(h, '1001', { created: CREATED_AT, lines: [['V1', 1, 10]] });
        reconcile(h);
        assert.equal(site(h).orders || 0, 0);
        later(order, function (o) { o.paymentStatus.value = PAID; });
        reconcile(h);
        assert.equal(site(h).orders, 1);
    });

    it('counts a completed checkout attempt on the day the attempt began', function () {
        var h = setup();
        fixtures.order(h, '1001', { created: CREATED_AT, lines: [['V1', 1, 10]], custom: { analyticsFlowId: 'abcdef0123456789', analyticsFlowDay: '20261026' } });
        reconcile(h);
        assert.equal(site(h, '20261026').completedFlows, 1);
        assert.equal(site(h).orders, 1);
    });

    it('reconciles orders that never passed the storefront hooks (headless or missed) from the order records', function () {
        var h = setup();
        fixtures.order(h, 'H-1', { created: CREATED_AT, lines: [['P2', 1, 25]] });
        reconcile(h);
        assert.equal(site(h).orders, 1);
        assert.isUndefined(site(h).completedFlows, 'no checkout attempt to complete');
    });

    it('skips non-USD orders and orders older than the retention period', function () {
        var h = setup();
        fixtures.order(h, '1001', { created: CREATED_AT, currency: 'EUR', lines: [['V1', 1, 10]] });
        fixtures.order(h, '1002', { created: new Date('2020-01-01T12:00:00Z'), modified: new Date(), lines: [['V1', 1, 10]] });
        var status = reconcile(h);
        assert.equal(site(h).orders || 0, 0);
        assert.equal(JSON.parse(status.message).skipped, 1);
    });

    it('attributes an order to its site-time-zone day', function () {
        var h = setup();
        fixtures.order(h, '1001', { created: new Date('2026-10-28T03:00:00Z'), lines: [['V1', 1, 10]] }); // 22:00 on the 27th
        reconcile(h);
        assert.equal(site(h, '20261027').orders, 1);
    });

    it('resumes after MaxOrders without missing or repeating orders changed in the same second', function () {
        var h = setup();
        var second = new Date('2026-10-27T16:00:00Z');
        for (var i = 0; i < 7; i++) fixtures.order(h, 'S' + i, { created: CREATED_AT, modified: second, lines: [['V1', 1, 10]] });
        fixtures.order(h, 'T1', { created: CREATED_AT, modified: new Date('2026-10-27T16:00:05Z'), lines: [['P2', 1, 10]] });
        fixtures.jobs(h).reconcileOrders({ MaxOrders: 3 });
        assert.equal(site(h).orders, 3);
        fixtures.jobs(h).reconcileOrders({ MaxOrders: 3 });
        fixtures.jobs(h).reconcileOrders({ MaxOrders: 3 });
        fixtures.jobs(h).reconcileOrders({ MaxOrders: 3 });
        assert.equal(site(h).orders, 8);
        assert.equal(product(h, 'M1').unitsSold, 7);
    });

    it('reports a failed order and carries on with the others', function () {
        var h = setup();
        fixtures.order(h, '1001', { created: CREATED_AT, lines: [['V1', 1, 10]] });
        var broken = fixtures.order(h, '1002', { created: CREATED_AT, lines: [['V1', 1, 10]] });
        Object.defineProperty(broken, 'productLineItems', { get: function () { throw new Error('line items unavailable'); } });
        var status = reconcile(h);
        assert.equal(status.code, 'ATTENTION');
        assert.equal(site(h).orders, 1);
    });

    it('skips the step while purchase tracking is off', function () {
        var h = setup({ preferences: { analyticsPurchaseTrackingEnabled: false } });
        fixtures.order(h, '1001', { created: CREATED_AT, lines: [['V1', 1, 10]] });
        reconcile(h);
        assert.lengthOf(h.rows('AnalyticsSiteDaily'), 0);
        assert.isUndefined(h.state.orders['1001'].custom.analyticsSnapshot);
    });
});
