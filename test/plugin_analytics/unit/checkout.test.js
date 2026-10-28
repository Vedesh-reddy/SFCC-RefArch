'use strict';

var assert = require('chai').assert;
var harness = require('./harness');
var fixtures = require('./fixtures');

/**
 * @param {Object} [options] - harness options
 * @returns {Object} harness with the storefront controllers loaded
 */
function setup(options) {
    var h = harness(options);
    ['Cart', 'Checkout', 'CheckoutShippingServices', 'CheckoutServices'].forEach(function (c) { h.require('controllers/' + c); });
    fixtures.product(h, 'M1', { category: 'rings' });
    fixtures.product(h, 'V1', { master: 'M1' });
    fixtures.product(h, 'P2', { category: 'necklaces' });
    return h;
}

/**
 * @param {Object} actual - object
 * @param {Object} expected - properties it must have
 */
function includes(actual, expected) {
    var picked = {};
    Object.keys(expected).forEach(function (k) { picked[k] = actual[k]; });
    assert.deepEqual(picked, expected);
}

/**
 * @param {Object} h - harness
 * @returns {Array} stored events
 */
function events(h) {
    return h.rows('AnalyticsEventBatch').reduce(function (all, b) { return all.concat(JSON.parse(b.custom.events)); }, []);
}

/**
 * @param {Object} h - harness
 * @returns {Object} site record of today after aggregation
 */
function site(h) {
    fixtures.jobs(h).aggregateEvents({});
    return h.rows('AnalyticsSiteDaily')[0].custom;
}

describe('plugin_analytics cart and checkout integration', function () {
    it('records a successful add to cart: one action, all units, the basket price', function () {
        var h = setup();
        fixtures.basket(h, [['V1', 3, 49.5]]);
        h.run('AddProduct', { form: { pid: 'V1', quantity: '3' }, viewData: { error: false, pliUUID: 'pli-0' } });
        var event = events(h)[0];
        includes(event, { n: 'add_to_cart', p: 'V1', q: 3, u: 4950 });
        assert.equal(h.rows('AnalyticsEventBatch')[0].custom.source, 'SERVER');
        var s = site(h);
        assert.equal(s.cartAdds, 1);
        assert.equal(s.unitsAdded, 3);
        var p = h.get('AnalyticsProductDaily', h.rows('AnalyticsSiteDaily')[0].custom.day + '_M1').custom;
        assert.equal(p.cartAdds, 1, 'variant rolls up to its master');
        assert.equal(p.unitsAdded, 3);
        assert.equal(p.uniqueCartAdds, 1);
        assert.equal(p.categoryId, 'rings', 'the master category');
    });

    it('records nothing when the add to cart failed (stock, not orderable, rejected)', function () {
        var h = setup();
        fixtures.basket(h, [['V1', 1, 10]]);
        h.run('AddProduct', { form: { pid: 'V1', quantity: '5' }, viewData: { error: true, message: 'out of stock' } });
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 0);
    });

    it('records each product of a product set and never touches the basket', function () {
        var h = setup();
        var basket = fixtures.basket(h, [['V1', 1, 10], ['P2', 2, 20]]);
        var before = JSON.stringify(basket);
        h.run('AddProduct', { form: { pidsObj: JSON.stringify([{ pid: 'V1', qty: '1' }, { pid: 'P2', qty: '2' }]) }, viewData: { error: false } });
        assert.deepEqual(events(h).map(function (e) { return [e.p, e.q, e.u]; }), [['V1', 1, 1000], ['P2', 2, 2000]]);
        assert.equal(JSON.stringify(basket), before);
    });

    it('swallows a malformed product set form instead of breaking the cart response', function () {
        var h = setup();
        fixtures.basket(h, [['V1', 1, 10]]);
        var res = h.run('AddProduct', { form: { pidsObj: '{broken' }, viewData: { error: false, quantityTotal: 1 } });
        assert.equal(res.getViewData().quantityTotal, 1);
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 0);
        assert.isTrue(h.state.logs.some(function (l) { return l.level === 'error'; }));
    });

    it('counts one checkout attempt per basket and session, however often Checkout-Begin loads', function () {
        var h = setup();
        fixtures.basket(h, [['V1', 2, 10], ['P2', 1, 5]]);
        h.run('Begin', { customer: { registered: true } });
        h.run('Begin', { customer: { registered: true } });
        h.run('Begin', { customer: { registered: true } });
        var begun = events(h).filter(function (e) { return e.n === 'begin_checkout'; });
        assert.lengthOf(begun, 1);
        includes(begun[0], { i: 2, q: 3, a: 2500, g: 1, f: 1 });
        assert.match(begun[0].w, /^[a-f0-9]{16}$/);
        assert.notInclude(JSON.stringify(begun[0]), 'basket-1', 'only a hash of the basket');
        fixtures.basket(h, [['P2', 1, 5]], { uuid: 'basket-2' });
        h.run('Begin', {});
        assert.lengthOf(events(h).filter(function (e) { return e.n === 'begin_checkout'; }), 2, 'a new basket is a new attempt');
        assert.equal(events(h).filter(function (e) { return e.n === 'begin_checkout'; })[1].g, 0, 'guest');
    });

    it('does not count a checkout start that redirects back to the cart or has no basket', function () {
        var h = setup();
        fixtures.basket(h, [['V1', 1, 10]]);
        h.run('Begin', { redirectUrl: '/cart' });
        h.state.basket = null;
        h.run('Begin', {});
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 0);
    });

    it('records accepted shipping steps only, after the base route has saved them, without address data', function () {
        var h = setup();
        fixtures.basket(h, [['V1', 1, 10]]);
        var order = [];
        h.run('SubmitShipping', {
            viewData: { error: true },
            base: function (req, res) { res.json({ error: true, fieldErrors: [{ postalCode: 'invalid' }] }); }
        });
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 0);
        h.run('SubmitShipping', {
            base: function (req, res, route) {
                route.on('route:BeforeComplete', function () { order.push('base'); res.json({ order: {} }); });
            }
        });
        // the giftResult error branch of the base route answers error after validation passed
        h.run('SubmitShipping', {
            base: function (req, res, route) { route.on('route:BeforeComplete', function () { res.json({ error: true }); }); }
        });
        var shipping = events(h).filter(function (e) { return e.n === 'add_shipping_info'; });
        assert.lengthOf(shipping, 1);
        includes(shipping[0], { m: 'standard', y: 'US', h: 1, f: 1 });
        assert.notMatch(JSON.stringify(events(h)), /Jane|Main St/);
        assert.deepEqual(order, ['base']);
    });

    it('records accepted payment steps with the method only, never card data', function () {
        var h = setup();
        fixtures.basket(h, [['V1', 1, 10]]);
        h.run('SubmitPayment', { base: function (req, res) { res.json({ error: true }); } });
        h.run('SubmitPayment', { base: function (req, res, route) { route.on('route:BeforeComplete', function () { res.json({ error: false }); }); } });
        h.run('SubmitPayment', { base: function (req, res, route) { route.on('route:BeforeComplete', function () { res.json({ error: false }); }); } });
        var payment = events(h).filter(function (e) { return e.n === 'add_payment_info'; });
        assert.lengthOf(payment, 2, 'each accepted submission is an event');
        assert.equal(payment[0].m, 'CREDIT_CARD');
        assert.equal(payment[0].f, 1);
        assert.isUndefined(payment[1].f, 'one unique per checkout attempt');
        assert.notInclude(JSON.stringify(events(h)), '4111');
        var s = site(h);
        assert.equal(s.paymentSubmits, 2);
        assert.equal(s.paymentFlows, 1);
    });

    it('links a placed order to its checkout attempt without creating any custom object', function () {
        var h = setup();
        fixtures.basket(h, [['V1', 1, 10]]);
        h.run('Begin', {});
        var placed = fixtures.order(h, '00001', { lines: [['V1', 1, 10]] });
        var creates = h.state.creates;
        h.run('PlaceOrder', { viewData: { error: false, orderID: '00001', orderToken: 'token-00001' } });
        assert.equal(h.state.creates, creates, 'PlaceOrder must leave the 10-create quota to checkout');
        assert.match(placed.custom.analyticsFlowId, /^[a-f0-9]{16}$/);
        assert.match(placed.custom.analyticsFlowDay, /^\d{8}$/);
        assert.match(placed.custom.analyticsSessionToken, /^[a-f0-9]{24}$/);
        assert.isNull(JSON.parse(global.session.privacy.analyticsState).c, 'the attempt is closed');
        var failed = fixtures.order(h, '00002', { lines: [['V1', 1, 10]] });
        h.run('PlaceOrder', { viewData: { error: true, orderID: '00002' } });
        assert.isUndefined(failed.custom.analyticsFlowId);
    });

    it('creates at most one custom object per storefront request', function () {
        var h = setup();
        fixtures.basket(h, [['V1', 1, 10], ['P2', 1, 5]]);
        [
            function () { h.run('AddProduct', { form: { pidsObj: JSON.stringify([{ pid: 'V1', qty: '1' }, { pid: 'P2', qty: '1' }]) }, viewData: { error: false } }); },
            function () { h.run('Begin', {}); },
            function () { h.run('SubmitShipping', {}); },
            function () { h.run('SubmitPayment', {}); }
        ].forEach(function (request, index) {
            var before = h.state.creates;
            request();
            assert.isAtMost(h.state.creates - before, 1, 'request ' + index);
        });
    });

    it('rate-limits server events too and leaves checkout alone when analytics fails', function () {
        var h = setup({ preferences: { analyticsMaxBatchesPerMinute: 1 } });
        fixtures.basket(h, [['V1', 1, 10]]);
        h.run('AddProduct', { form: { pid: 'V1', quantity: '1' }, viewData: { error: false, pliUUID: 'pli-0' } });
        h.run('AddProduct', { form: { pid: 'V1', quantity: '1' }, viewData: { error: false, pliUUID: 'pli-0' } });
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 1);

        h = setup({ mocks: { 'dw/object/CustomObjectMgr': { getCustomObject: function () { throw new Error('quota'); } } } });
        fixtures.basket(h, [['V1', 1, 10]]);
        var res = h.run('PlaceOrder', { viewData: { error: false, orderID: 'X', orderToken: 't' } });
        assert.isFalse(res.getViewData().error);
        res = h.run('SubmitPayment', { base: function (req, r, route) { route.on('route:BeforeComplete', function () { r.json({ error: false }); }); } });
        assert.isFalse(res.getViewData().error);
    });

    it('does not record checkout steps with checkout tracking off, nor links orders with purchase tracking off', function () {
        var h = setup({ preferences: { analyticsCheckoutTrackingEnabled: false, analyticsPurchaseTrackingEnabled: false } });
        fixtures.basket(h, [['V1', 1, 10]]);
        h.run('Begin', {});
        h.run('SubmitShipping', {});
        var placed = fixtures.order(h, '00001', { lines: [['V1', 1, 10]] });
        h.run('PlaceOrder', { viewData: { error: false, orderID: '00001', orderToken: 'token-00001' } });
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 0);
        assert.isUndefined(placed.custom.analyticsFlowId);
    });
});
