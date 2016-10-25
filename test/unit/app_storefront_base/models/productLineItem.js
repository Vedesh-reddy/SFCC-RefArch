'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var ArrayList = require('../../../mocks/dw.util.Collection');
var toProductMock = require('../../../util');

describe('fullProduct', function () {
    var ProductLineItem = proxyquire('../../../../app_storefront_base/cartridge/models/productLineItem', {
        './product/productBase': proxyquire('../../../../app_storefront_base/cartridge/models/product/productBase', {
            './productPricing': function () {},
            './productImages': function () {},
            './productAttributes': function () { return []; },
            '../../scripts/dwHelpers': proxyquire('../../../../app_storefront_base/cartridge/scripts/dwHelpers', {
                'dw/util/ArrayList': ArrayList
            })
        }),
        'dw/util/StringUtils': {
            formatMoney: function () {
                return 'formattedMoney';
            }
        },
        'dw/value/Money': require('../../../mocks/dw.value.Money')
    });

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

    var lineItem = {
        bonusProductLineItem: false,
        gift: false,
        UUID: 'some UUID',
        adjustedPrice: {
            value: 'some value',
            currencyCode: 'US'
        },
        product: toProductMock(productMock)
    };

    it('should load productLineItem', function () {
        var productLineItem = new ProductLineItem(lineItem.product, null, 1, lineItem);

        assert.equal(productLineItem.productName, 'test product');
        assert.equal(productLineItem.id, 1234567);
        assert.equal(productLineItem.rating, 4);
        assert.equal(productLineItem.isBonusProductLineItem, false);
        assert.equal(productLineItem.isGift, false);
        assert.equal(productLineItem.UUID, 'some UUID');
        assert.equal(productLineItem.isOrderable, true);
        assert.equal(productLineItem.priceTotal, 'formattedMoney');
        assert.equal(productLineItem.quantity, 1);
    });
});

