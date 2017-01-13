'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();


describe('Range Price Model', function () {
    var RangePrice = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/models/price/range.js', {
        '../../scripts/helpers/pricing': {
            toPriceModel: function (price) {
                return price;
            }
        }
    });
    var minPrice = '$5';
    var maxPrice = '$15';

    it('should set type property value to "range"', function () {
        var rangePrice = new RangePrice();
        assert.equal(rangePrice.type, 'range');
    });

    it('should set min property', function () {
        var rangePrice = new RangePrice(minPrice, maxPrice);
        assert.equal(rangePrice.min, minPrice);
    });

    it('should set max property', function () {
        var rangePrice = new RangePrice(minPrice, maxPrice);
        assert.equal(rangePrice.max, maxPrice);
    });
});
