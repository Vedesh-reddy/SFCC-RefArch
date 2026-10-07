'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var serverMock = require('../../mocks/modules/serverMock');

describe('Reviews controller', function () {
    var routes;
    var service;
    var csrf;
    var req;
    var res;
    var session;
    var https;

    function run(name) {
        var chain = routes[name].chain;
        chain[chain.length - 1](req, res, function () {});
    }

    beforeEach(function () {
        session = {};
        service = {
            getSettings: sinon.stub().returns({ enabled: true, moderation: true }),
            getProduct: sinon.stub().returns({ ID: 'master', name: 'Test product' }),
            validate: sinon.stub().returns({ valid: true, values: { rating: 5, body: 'Review text' }, errors: {} }),
            getReviews: sinon.stub().returns({ items: [], total: 0, page: 1, pages: 1 }),
            getOwnReview: sinon.stub().returns(null),
            save: sinon.stub().returns({ status: 'pending' })
        };
        csrf = {
            validateRequest: sinon.stub().returns(true),
            getTokenName: function () { return 'csrf_token'; },
            generateToken: function () { return 'fresh-token'; }
        };
        req = {
            currentCustomer: { raw: { authenticated: true, profile: { customerNo: 'session-customer' } } },
            querystring: { pid: 'variant', page: '2' },
            form: { pid: 'variant', customerNo: 'forged', status: 'approved' },
            httpHeaders: { 'x-requested-with': 'XMLHttpRequest' },
            session: { privacyCache: {
                get: function (key) { return session[key]; },
                set: function (key, value) { session[key] = value; }
            } }
        };
        res = {
            setHttpHeader: sinon.stub().throws(new Error('Unsupported platform header')), setStatusCode: sinon.spy(), render: sinon.spy(),
            base: { setExpires: sinon.spy() },
            json: sinon.spy(), redirect: sinon.spy()
        };
        var server = serverMock.create();
        https = function () {};
        server.middleware.https = https;
        proxyquire('../../../cartridges/plugin_productreviews/cartridge/controllers/Reviews', {
            server: server,
            '*/cartridge/scripts/productReviews': service,
            'dw/web/Resource': {
                msg: function (key) { return key; },
                msgf: function (key) { return key; }
            },
            'dw/web/URLUtils': { https: function () {
                var args = Array.prototype.slice.call(arguments);
                return { toString: function () { return '/route/' + args.join('/'); } };
            } },
            'dw/web/CSRFProtection': csrf,
            'dw/system/Logger': { error: sinon.spy() }
        });
        routes = server.registrations;
    });

    it('uses HTTPS on every route and accepts writes only via POST', function () {
        Object.keys(routes).forEach(function (name) { assert.include(routes[name].chain, https); });
        assert.equal(routes.Submit.method, 'post');
        assert.equal(routes.List.method, 'get');
    });

    it('rejects invalid CSRF before querying or saving reviews and supplies a new token', function () {
        csrf.validateRequest.returns(false);
        run('Submit');
        assert.isTrue(res.setStatusCode.calledWith(403));
        assert.isFalse(service.save.called);
        assert.isFalse(service.getProduct.called);
        assert.equal(res.json.firstCall.args[0].csrf.value, 'fresh-token');
    });

    it('rejects guests and remembered but unauthenticated customers', function () {
        req.currentCustomer.raw.authenticated = false;
        run('Submit');
        assert.isTrue(res.setStatusCode.calledWith(401));
        assert.isFalse(service.save.called);
        req.currentCustomer.raw = null;
        run('Submit');
        assert.isFalse(service.save.called);
    });

    it('rejects unavailable products and disabled reviews', function () {
        service.getProduct.returns(null);
        run('Submit');
        assert.isTrue(res.setStatusCode.calledWith(404));
        assert.isFalse(service.save.called);
        service.getProduct.returns({ ID: 'master' });
        service.getSettings.returns({ enabled: false });
        run('Submit');
        assert.isFalse(service.save.called);
    });

    it('returns localized field validation errors without writing', function () {
        service.validate.returns({ valid: false, values: {}, errors: { rating: 'error.rating' } });
        run('Submit');
        assert.isTrue(res.setStatusCode.calledWith(400));
        assert.equal(res.json.firstCall.args[0].fieldErrors.rating, 'error.rating');
        assert.isFalse(service.save.called);
    });

    it('derives customer and product identity server-side and ignores forged approval', function () {
        run('Submit');
        assert.isTrue(service.save.calledOnce);
        assert.deepEqual(service.save.firstCall.args, ['master', 'session-customer', { rating: 5, body: 'Review text' }, true]);
        assert.equal(res.json.firstCall.args[0].message, 'success.pending');
    });

    it('supports automatic publication only when moderation is disabled server-side', function () {
        service.getSettings.returns({ enabled: true, moderation: false });
        service.save.returns({ status: 'approved' });
        run('Submit');
        assert.strictEqual(service.save.firstCall.args[3], false);
        assert.equal(res.json.firstCall.args[0].message, 'success.approved');
    });

    it('returns a retry interval for repeated submissions', function () {
        service.save.returns({ error: 'rate' });
        run('Submit');
        assert.isTrue(res.setStatusCode.calledWith(429));
        assert.equal(res.json.firstCall.args[0].retryAfter, 60);
        assert.isFalse(res.json.firstCall.args[0].success);
    });

    it('returns a controlled failure when storage or a concurrent transaction fails', function () {
        service.save.throws(new Error('Database unavailable'));
        run('Submit');
        assert.isTrue(res.setStatusCode.calledWith(503));
        assert.equal(res.json.firstCall.args[0].message, 'error.unavailable');
    });

    it('disables caching for personal fragments and tokens', function () {
        run('List');
        assert.strictEqual(res.cachePeriod, 0);
        assert.isTrue(res.base.setExpires.calledOnce);
        assert.equal(res.base.setExpires.firstCall.args[0].getTime(), 0);
        assert.isFalse(res.setHttpHeader.called);
        assert.equal(res.render.firstCall.args[0], 'reviews/content');
        assert.equal(res.render.firstCall.args[1].csrf.value, 'fresh-token');
        assert.isTrue(service.getOwnReview.calledWith('master', 'session-customer'));
    });

    it('shows guests a sign-in prompt without looking up an authenticated identity', function () {
        req.currentCustomer.raw = null;
        run('List');
        assert.isFalse(res.render.firstCall.args[1].loggedIn);
        assert.isTrue(service.getOwnReview.calledWith('master', null));
    });

    it('handles missing metadata without exposing database details', function () {
        service.getReviews.throws(new Error('Missing ProductReview type'));
        run('List');
        assert.isTrue(res.setStatusCode.calledWith(503));
        assert.deepEqual(res.render.firstCall.args[1], { unavailable: true });
    });

    it('preserves HTML form input on validation failure when JavaScript is disabled', function () {
        req.httpHeaders = {};
        service.validate.returns({ valid: false, values: { body: 'Keep this text' }, errors: { rating: 'error.rating' } });
        run('Submit');
        assert.isTrue(res.setStatusCode.calledWith(400));
        assert.equal(res.render.firstCall.args[0], 'reviews/page');
        assert.equal(res.render.firstCall.args[1].values.body, 'Keep this text');
    });

    it('redirects successful HTML submissions and consumes a primitive session flash once', function () {
        req.httpHeaders = {};
        run('Submit');
        assert.isString(session.productReviewSaved);
        assert.isTrue(res.redirect.calledWith('/route/Reviews-Show/pid/master'));
        run('Show');
        assert.equal(res.render.firstCall.args[1].notice, 'success.pending');
        assert.isNull(session.productReviewSaved);
    });

    it('returns shoppers to a validated product after login without accepting arbitrary redirects', function () {
        req.currentCustomer.raw = null;
        req.querystring.returnUrl = 'https://malicious.example';
        run('Login');
        assert.equal(session.productReviewsReturnPID, 'master');
        assert.isTrue(res.redirect.calledWith('/route/Login-Show/rurl/3'));
        run('Return');
        assert.isTrue(res.redirect.calledWith('/route/Product-Show/pid/master#product-reviews'));
        assert.isNull(session.productReviewsReturnPID);
    });
});
