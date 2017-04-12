'use strict';

var Response = require('../../../../cartridges/modules/server/response');
var Route = require('../../../../cartridges/modules/server/route');
var assert = require('chai').assert;
var mockReq = {
    path: '',
    querystring: {},
    locale: ''
};
var mockRes = {
    setViewData: function () {}
};

describe('route', function () {
    it('should create a new route with a given number of steps', function () {
        function tempFunc(req, res, next) { next(); }
        var route = new Route('test', [tempFunc, tempFunc], mockReq, mockRes);
        assert.equal(route.name, 'test');
        assert.equal(route.chain.length, 2);
    });
    it('should update response after last step', function (done) {
        function tempFunc(req, res, next) {
            res.test = 'Hello'; // eslint-disable-line no-param-reassign
            next();
        }
        var route = new Route('test', [tempFunc], mockReq, mockRes);
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
        var route = new Route('test', [tempFunc, tempFunc], mockReq, mockRes);
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
        var route = new Route('test', [tempFunc], mockReq, response);
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
        var res = {
            log: function () {},
            setViewData: mockRes.setViewData };
        var route = new Route('test', [tempFunc], mockReq, res);
        assert.throws(function () { route.getRoute()(); });
    });
    it('should correct append a step to the route', function () {
        function tempFunc(req, res, next) {
            next();
        }
        var route = new Route('test', [tempFunc, tempFunc], mockReq, mockRes);
        assert.equal(route.chain.length, 2);
        route.append(tempFunc);
        assert.equal(route.chain.length, 3);
    });
    it('should set error object on the response', function () {
        function tempFunc(req, res, next) {
            next();
        }
        var req = {
            path: mockReq.path,
            querystring: mockReq.querystring,
            locale: mockReq.locale
        };
        var route = new Route('test', [tempFunc], req, mockRes);
        route.getRoute()({ ErrorText: 'hello' });
        assert.isNotNull(req.error);
        assert.equal(req.error.errorText, 'hello');
    });
});
