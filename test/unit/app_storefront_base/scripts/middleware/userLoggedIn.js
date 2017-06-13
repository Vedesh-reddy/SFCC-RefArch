'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var userLoggedInMiddleware = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/middleware/userLoggedIn', {
    'dw/web/URLUtils': {
        url: function () {
            return 'some url';
        }
    }
});

describe('userLoggedInMiddleware', function () {
    var next = sinon.spy();
    var req = {
        currentCustomer: {
            raw: 'something'
        }
    };
    var res = {
        redirect: sinon.spy(),
        setStatusCode: sinon.spy(),
        setViewData: sinon.spy()
    };

    afterEach(function () {
        next.reset();
        res.redirect.reset();
        res.setStatusCode.reset();
        res.setViewData.reset();
    });

    it('Should redirect if a user is not logged in', function () {
        userLoggedInMiddleware.validateLoggedIn(req, res, next);
        assert.isTrue(res.redirect.calledOnce);
        assert.isTrue(next.calledOnce);
    });

    it('Should redirect if a user is not logged in for an Ajax request', function () {
        userLoggedInMiddleware.validateLoggedInAjax(req, res, next);
        assert.isTrue(res.setStatusCode.withArgs(500).calledOnce);
        assert.isTrue(res.setViewData.calledOnce);
        assert.isTrue(next.calledOnce);
    });

    it('Should not redirect and just call next if user is logged in', function () {
        req.currentCustomer.profile = 'profile';
        userLoggedInMiddleware.validateLoggedIn(req, res, next);
        assert.isTrue(res.redirect.notCalled);
        assert.isTrue(next.calledOnce);
    });

    it('Should not redirect and just call next if user is logged in for ajax request', function () {
        req.currentCustomer.profile = 'profile';
        userLoggedInMiddleware.validateLoggedInAjax(req, res, next);
        assert.isTrue(res.setStatusCode.withArgs(500).notCalled);
        assert.isTrue(res.setViewData.calledOnce);
        assert.isTrue(next.calledOnce);
    });
});
