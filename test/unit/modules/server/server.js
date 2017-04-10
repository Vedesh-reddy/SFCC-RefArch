/* eslint "no-underscore-dangle": ["error", { "allow": ["__routes"] }] */

'use strict';

var Route = require('../../../../cartridges/modules/server/route');
var assert = require('chai').assert;
var middleware = require('../../../../cartridges/modules/server/middleware');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var sinon = require('sinon');

var render = {
    template: sinon.spy(),
    json: sinon.spy()
};
var server = null;

function request() {
    return {
        httpMethod: 'GET',
        host: 'localhost',
        path: 'test',
        querystring: '',
        locale: {
            id: ''
        },
        https: false,
        currentCustomer: {
            raw: {},
            profile: {},
            addressBook: {},
            wallet: {}
        }
    };
}

describe('server', function () {
    beforeEach(function () {
        server = proxyquire('../../../../cartridges/modules/server/server', {
            './render': render,
            './request': request
        });
    });
    it('should create a server with one route', function () {
        server.use('test', function () {});
        var exports = server.exports();
        assert.equal(typeof exports.test, 'function');
    });
    it('should create a server with a route of two steps', function () {
        server.get('test', function () {});
        var exports = server.exports();
        assert.equal(exports.__routes.test.chain.length, 2);
    });
    it('should create a server with two routes', function () {
        server.get('test', function () {}, function () {});
        server.post('test2', function () {});
        var exports = server.exports();
        assert.equal(typeof exports.test, 'function');
        assert.equal(typeof exports.test2, 'function');
        assert.equal(exports.__routes.test.chain.length, 3);
        assert.equal(exports.__routes.test2.chain.length, 2);
    });
    it('should extend existing chain with 2 more steps', function () {
        server.get('test', function () {});
        var exports = server.exports();
        assert.equal(exports.__routes.test.chain.length, 2);
        server.extend(exports);
        server.append('test', function () {}, function () {});
        assert.equal(exports.__routes.test.chain.length, 4);
    });
    it('should throw when trying to create two routes with the same name', function () {
        server.get('test', function () {});
        assert.throws(function () { server.post('test', function () {}); });
    });
    it('should throw when route name is not provided', function () {
        assert.throws(function () { server.get(function () {}); });
    });
    it('should throw when route chain contains non-functions', function () {
        assert.throws(function () { server.get('test', {}); });
    });
    it('should throw when trying to append to non-existing route', function () {
        server.get('test', function () {});
        server.extend(server.exports());
        assert.throws(function () { server.append('foo', function () {}); });
    });
    it('should throw when extending server without routes', function () {
        assert.throws(function () { server.extend(server.exports()); });
    });
    it('should throw when extending server with an object', function () {
        assert.throws(function () { server.extend({}); });
    });
    it('should throw when no route action has been taken', function () {
        server.get('test', function (req, res, next) { next(); });
        assert.throws(function () { server.exports().test(); });
    });
    it('should throw when middleware doesn\'t match route', function () {
        server.post('test', middleware.https, function (req, res, next) {
            req.render('test', { name: 'value' }); next();
        });
        assert.throws(function () { server.exports().test(); });
    });
    it('should verify that whole route passes', function () {
        server.get('test', middleware.http, function (req, res, next) {
            res.render('test', { name: 'value' });
            next();
        });
        var exports = server.exports();
        exports.test();
        var result = render.template.calledWith('test', { name: 'value', queryString: '', action: 'test', locale: '' });
        assert.isTrue(result);
    });
    it('should verify that all events are emitted', function (done) {
        server.get('test', middleware.http, function (req, res, next) {
            res.json({ name: 'value' });
            next();
        });
        var exports = server.exports();
        var route = exports.__routes.test;
        var routeStartHit = false;
        var routeStepHits = 0;

        route.once('route:Start', function () {
            routeStartHit = true;
        });
        route.on('route:Step', function () {
            routeStepHits += 1;
        });
        route.on('route:Complete', function () {
            assert.isTrue(routeStartHit);
            assert.equal(routeStepHits, 2);
            done();
        });
        exports.test();
    });
    it('should verify that request is frozen', function (done) {
        server.get('test', function (req) {
            assert.isFrozen(req);
            done();
        });
        server.exports().test();
    });
    it('should retrieve a route by name', function () {
        server.get('test', function (req, res, next) {
            res.json({ name: 'value' });
            next();
        });
        var testRoute = server.getRoute('test');
        assert.isNotNull(testRoute);
    });
    it('should return a route on get call', function () {
        var route = server.get('test', function () {});
        assert.isTrue(route instanceof Route);
    });
    it('should redirect if requested in BeforeComplete', function (done) {
        server.get('test', function (req, res, next) {
            this.on('route:BeforeComplete', function (r, response) {
                response.base.redirect = function (text) { // eslint-disable-line no-param-reassign
                    assert.equal(text, 'test');
                    done();
                };
                response.redirect('test');
            });
            next();
        });
        var exports = server.exports();
        exports.test();
    });
});
