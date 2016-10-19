'use strict';

var assert = require('chai').assert;
var ArrayList = require('../../../mocks/dw.util.Collection');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var toProductMock = require('../../../util');

var productVariantMock = {
    ID: '1234567',
    name: 'test product',
    variant: true,
    availabilityModel: {
        isOrderable: {
            return: true,
            type: 'function'
        },
        inventoryRecord: {
            ATS: {
                value: 100
            }
        }
    },
    minOrderQuantity: {
        value: 2
    }
};

var productMock = {
    variationModel: {
        productVariationAttributes: new ArrayList([{
            attributeID: '',
            value: ''
        }]),
        selectedVariant: productVariantMock
    }
};

var apiBasket = {
    allProductLineItems: new ArrayList([{
        bonusProductLineItem: false,
        gift: false,
        UUID: 'some UUID',
        adjustedPrice: {
            value: 'some value',
            currencyCode: 'US'
        },
        quantity: {
            value: 1
        },
        product: toProductMock(productMock)
    }])
};

describe('cart', function () {
    var helper = proxyquire('../../../../app_storefront_base/cartridge/scripts/dwHelpers', {
        'dw/util/ArrayList': ArrayList
    });
    var ProductLineItems = proxyquire('../../../../app_storefront_base/cartridge/models/productLineItems', {
        '~/cartridge/scripts/dwHelpers': helper,
        './productLineItem': proxyquire('../../../../app_storefront_base/cartridge/models/product/productBase', {
            './productPricing': function () {},
            './productImages': function () {},
            './productAttributes': function () { return []; },
            '../../scripts/dwHelpers': proxyquire('../../../../app_storefront_base/cartridge/scripts/dwHelpers', {
                'dw/util/ArrayList': ArrayList
            })
        })
    });

    it('should accept/process a null Basket object', function () {
        var nullBasket = null;
        var result = new ProductLineItems(nullBasket);
        assert.equal(result.items.length, 0);
        assert.equal(result.totalQuantity, 0);
    });

    it('should create product line items and get total quantity', function () {
        var result = new ProductLineItems(apiBasket);
        assert.equal(result.items.length, 1);
        assert.equal(result.totalQuantity, 1);
    });
});
