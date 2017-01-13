'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();


describe('Default Price Model', function () {
    var DefaultPrice = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/models/price/default.js', {
        '../../scripts/helpers/pricing': {
            toPriceModel: function (price) {
                return price;
            }
        }
    });
    var unavailablePromotionPrice = {
        available: false
    };
    var availablePromotionPrice = {
        available: true,
        value: 2
    };

    it('should set type property to "default"', function () {
        var defaultPrice = new DefaultPrice(null, null, unavailablePromotionPrice);
        assert.equal(defaultPrice.type, 'default');
    });

    it('should set list price to sales and sales to promotion price when applicable', function () {
        var listPrice = { value: 15 };
        var salesPrice = {
            compareTo: function () { return true; },
            value: 5
        };
        var defaultPrice = new DefaultPrice(listPrice, salesPrice, availablePromotionPrice);
        assert.equal(defaultPrice.list, salesPrice);
        assert.equal(defaultPrice.sales, availablePromotionPrice);
    });

    it('should set list property to null if sales and list prices are equal', function () {
        var listPrice = { value: 5 };
        var salesPrice = { value: 5 };
        var defaultPrice = new DefaultPrice(listPrice, salesPrice, unavailablePromotionPrice);
        assert.isNull(defaultPrice.list);
    });

    it('should set list and sales prices to prices provided if no promotion and not equal', function () {
        var listPrice = { value: 15 };
        var salesPrice = { value: 5 };
        var defaultPrice = new DefaultPrice(listPrice, salesPrice, unavailablePromotionPrice);
        assert.equal(defaultPrice.list, listPrice);
        assert.equal(defaultPrice.sales, salesPrice);
    });
});
