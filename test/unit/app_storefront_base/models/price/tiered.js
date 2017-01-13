'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var mockDwHelpers = require('../../../../mocks/dwHelpers');


describe('Tiered Price Model', function () {
    function MockQuantity(qty) {
        this.getValue = function () { return qty; };
    }

    var tiers = {
        '1-5': '$20',
        '6-10': '$10',
        '11-15': '$5'
    };
    var priceTable = {
        getQuantities: function () {
            return Object.keys(tiers).map(function (qty) {
                return new MockQuantity(qty);
            });
        },
        getPrice: function (qty) {
            return tiers[qty.getValue()];
        }
    };
    var TieredPrice = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/models/price/tiered.js', {
        '../../scripts/dwHelpers': {
            map: mockDwHelpers.map
        },
        '../../scripts/helpers/pricing': {
            toPriceModel: function (price) {
                return price;
            }
        }
    });

    it('should set startingFromPrice to the first tier price', function () {
        var tieredPrice = new TieredPrice(priceTable);
        assert.equal(tieredPrice.startingFromPrice, tiers[Object.keys(tiers)[0]]);
    });

    it('should set a tier to its proper quantity/price pairing', function () {
        var tieredPrice = new TieredPrice(priceTable);
        var firstTierQty = Object.keys(tiers)[0];
        assert.equal(tieredPrice.tiers[0].quantity, firstTierQty);
        assert.equal(tieredPrice.tiers[0].price, tiers[firstTierQty]);
    });

    it('should have type property value of "tiered"', function () {
        var tieredPrice = new TieredPrice(priceTable);
        assert.equal(tieredPrice.type, 'tiered');
    });

    it('should set isProductTile to false by default', function () {
        var tieredPrice = new TieredPrice(priceTable);
        assert.equal(tieredPrice.isProductTile, false);
    });

    it('should set isProductTile to true when provided', function () {
        var tieredPrice = new TieredPrice(priceTable, true);
        assert.equal(tieredPrice.isProductTile, true);
    });
});
