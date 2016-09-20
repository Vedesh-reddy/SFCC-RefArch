'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var getMockMoney = require('../../../mocks/dw.value.Money');

var createApiBasket = function (isAvailable) {
    return {
        totalGrossPrice: {
            value: 302.32,
            currencyCode: 'USD',
            available: isAvailable
        },
        totalTax: {
            value: 14.40,
            currencyCode: 'USD',
            available: isAvailable
        },
        shippingTotalPrice: {
            value: 9.99,
            currencyCode: 'USD',
            available: isAvailable
        },
        adjustedMerchandizeTotalPrice: {
            value: 9.99,
            currencyCode: 'USD',
            available: isAvailable
        }
    };
};

describe('Totals', function () {
    var Totals = null;
    Totals = proxyquire('../../../../app_storefront_base/cartridge/models/totals', {
        'dw/util/StringUtils': {
            formatMoney: function () {
                return 'formatted money';
            }
        },
        'dw/value/Money': getMockMoney
    });

    it('should accept/process a null Basket object', function () {
        var result = new Totals(null);
        assert.equal(result.subTotal, '-');
        assert.equal(result.grandTotal, '-');
        assert.equal(result.totalTax, '-');
        assert.equal(result.totalShippingCost, '-');
    });

    it('should accept a basket and format the totals', function () {
        var result = new Totals(createApiBasket(true));
        assert.equal(result.subTotal, 'formatted money');
        assert.equal(result.grandTotal, 'formatted money');
        assert.equal(result.totalTax, 'formatted money');
        assert.equal(result.totalShippingCost, 'formatted money');
    });

    it('should accept a basket where the totals are unavailable', function () {
        var result = new Totals(createApiBasket(false));
        assert.equal(result.subTotal, '-');
        assert.equal(result.grandTotal, '-');
        assert.equal(result.totalTax, '-');
        assert.equal(result.totalShippingCost, '-');
    });
});
