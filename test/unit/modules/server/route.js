'use strict';

var Response = require('../../../../cartridges/modules/server/response');
var Route = require('../../../../cartridges/modules/server/route');
var assert = require('chai').assert;

describe('server', function () {
    it('should create a new route with a given number of steps', function () {
        function tempFunc(req, res, next) { next(); }
        var route = new Route('test', [tempFunc, tempFunc], {}, {});
        assert.equal(route.name, 'test');
        assert.equal(route.chain.length, 2);
    });
    it('should update response after last step', function (done) {
        function tempFunc(req, res, next) {
            res.test = 'Hello'; // eslint-disable-line no-param-reassign
            next();
        }
        var route = new Route('test', [tempFunc], {}, {});
        route.on('route:Complete', function (req, res) {
            assert.equal(res.test, 'Hello');
            done();
        });
        route.getRoute()();
    });
    it('should execute two middleware steps', function (done) {
        var i = 0;
        function tempFunc(req, res, next) {
            i += 1;
            next();
        }
        var route = new Route('test', [tempFunc, tempFunc], {}, {});
        route.on('route:Complete', function () {
            assert.equal(i, 2);
            done();
        });
        route.getRoute()();
    });
    it('should verify that response keeps redirect variable', function (done) {
        function tempFunc(req, res, next) {
            res.redirect('test');
            next();
        }
        var response = new Response({ redirect: function () {} });
        var route = new Route('test', [tempFunc], {}, response);
        route.on('route:Redirect', function (req, res) {
            assert.equal(res.redirectUrl, 'test');
            done();
        });
        route.getRoute()();
    });
    it('should throw an error', function () {
        function tempFunc(req, res, next) {
            next(new Error());
        }
        var res = { log: function () {} };
        var route = new Route('test', [tempFunc], {}, res);
        assert.throws(function () { route.getRoute()(); });
    });
    it('should correct append a step to the route', function () {
        function tempFunc(req, res, next) {
            next();
        }
        var route = new Route('test', [tempFunc, tempFunc], {}, {});
        assert.equal(route.chain.length, 2);
        route.append(tempFunc);
        assert.equal(route.chain.length, 3);
    });
});
