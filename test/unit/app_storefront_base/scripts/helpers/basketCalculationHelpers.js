'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var sinon = require('sinon');

describe('Helpers - Totals', function () {
    var hookMgrSpy = sinon.spy();

    var basketCalculationHelpers = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/helpers/basketCalculationHelpers', {
        'dw/system/HookMgr': { callHook: hookMgrSpy }
    });

    beforeEach(function () {
        hookMgrSpy.reset();
    });

    it('Should call taxes hook', function () {
        basketCalculationHelpers.calculateTaxes();

        assert.isTrue(hookMgrSpy.calledWith('app.basket.taxes', 'calculateTaxes'));
    });

    it('Should call totals hook', function () {
        basketCalculationHelpers.calculateTotals();

        assert.isTrue(hookMgrSpy.calledWith('dw.order.calculate', 'calculate'));
    });
});
