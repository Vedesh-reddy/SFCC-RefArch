'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var ArrayList = require('../../../../mocks/dw.util.Collection');
var toProductMock = require('../../../../util');

var variationAttrsMock = [{
    attributeId: 'color',
    displayName: 'color',
    id: 'COLOR_ID',
    swatchable: true,
    values: [{ id: 'asdfa9s87sad',
        description: '',
        displayValue: 'blue',
        value: 'asdfa9s87sad',
        selected: true,
        selectable: false
    }]
}];

describe('fullProduct', function () {
    var FullProduct = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/models/product/product', {
        './productBase': proxyquire('../../../../../cartridges/app_storefront_base/cartridge/models/product/productBase', {
            './productImages': function () {},
            './productAttributes': function () { return variationAttrsMock; },
            '../../scripts/dwHelpers': proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/dwHelpers', {
                'dw/util/ArrayList': ArrayList
            }),
            '../../scripts/factories/price': { getPrice: function () {} },
            'dw/web/Resource': {
                msgf: function () { return 'some string with param'; },
                msg: function () { return 'some string'; }
            }
        }),
        'dw/web/URLUtils': { url: function () { return { relative: function () { return 'some url'; } }; } }
    });

    var attributeModel = {
        visibleAttributeGroups: new ArrayList([{
            ID: 'some ID',
            displayName: 'some name'
        }]),
        getVisibleAttributeDefinitions: function () {
            return new ArrayList([{
                multiValueType: false,
                displayName: 'some name'
            }]);
        },
        getDisplayValue: function () {
            return 'some value';
        }
    };

    var availabilityModelMock = {
        isOrderable: {
            return: true,
            type: 'function'
        },
        getAvailabilityLevels: function () {
            return {
                inStock: {
                    value: 1
                },
                preorder: {
                    value: 0
                },
                backorder: {
                    value: 0
                },
                notAvailable: {
                    value: 0
                }
            };
        },
        inventoryRecord: {
            inStockDate: {
                toDateString: function () {
                    return 'some date';
                }
            }
        }
    };

    var productVariantMock = {
        ID: '1234567',
        name: 'test product',
        variant: false,
        variationGroup: false,
        productSet: false,
        bundle: false,
        availabilityModel: availabilityModelMock,
        shortDescription: {
            markup: 'Hello World'
        },
        longDescription: {
            markup: 'Hello World Long'
        },
        minOrderQuantity: {
            value: 2
        },
        attributeModel: attributeModel
    };

    var productMock = {
        variationModel: {
            productVariationAttributes: new ArrayList([{
                attributeID: '',
                value: ''
            }]),
            setSelectedAttributeValue: {
                return: null,
                type: 'function'
            },
            selectedVariant: productVariantMock,
            getAllValues: {
                return: new ArrayList([]),
                type: 'function'
            },
            url: {
                return: {
                    relative: {
                        return: 'some url',
                        type: 'function'
                    }
                },
                type: 'function'
            }
        },
        attributeModel: attributeModel
    };

    var promotions = new ArrayList([{
        calloutMsg: { markup: 'Super duper promotion discount' },
        details: { markup: 'Some Details' },
        enabled: true,
        ID: 'SuperDuperPromo',
        name: 'Super Duper Promo',
        promotionClass: 'Some Class',
        rank: null
    }]);

    it('should load simple full product', function () {
        var mock = toProductMock(productMock);
        var product = new FullProduct(mock, null, null, promotions);

        assert.equal(product.productName, 'test product');
        assert.equal(product.id, 1234567);
        assert.equal(product.rating, 4);
        assert.equal(product.minOrderQuantity, 2);
        assert.equal(product.shortDescription, 'Hello World');
        assert.equal(product.longDescription, 'Hello World Long');
    });

    it('should load simple full product without minOrder', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.variationModel.selectedVariant = null;
        tempMock = Object.assign({}, productVariantMock, tempMock);
        tempMock.minOrderQuantity.value = null;
        var product = new FullProduct(toProductMock(tempMock), null, null, promotions);

        assert.equal(product.minOrderQuantity, 1);
        assert.equal(product.maxOrderQuantity, 9);
    });

    it('should have an array of Promotions when provided', function () {
        var expectedPromotions = [{
            calloutMsg: 'Super duper promotion discount',
            details: 'Some Details',
            enabled: true,
            id: 'SuperDuperPromo',
            name: 'Super Duper Promo',
            promotionClass: 'Some Class',
            rank: null
        }];

        var tempMock = Object.assign({}, productMock);
        tempMock.variationModel.selectedVariant = null;
        tempMock = Object.assign({}, productVariantMock, tempMock);
        tempMock.minOrderQuantity.value = null;
        var product = new FullProduct(toProductMock(tempMock), null, null, promotions);

        assert.deepEqual(product.promotions, expectedPromotions);
    });

    it('should handle no promotions', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.variationModel.selectedVariant = null;
        tempMock = Object.assign({}, productVariantMock, tempMock);
        tempMock.minOrderQuantity.value = null;
        var product = new FullProduct(toProductMock(tempMock), null, null);

        assert.deepEqual(product.promotions, null);
    });

    it('should create a master product', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.variationModel.selectedVariant = null;
        tempMock = Object.assign({}, productVariantMock, tempMock);
        tempMock.variationModel.master = true;
        var product = new FullProduct(toProductMock(tempMock));

        assert.equal(product.productName, 'test product');
        assert.equal(product.id, 1234567);
        assert.equal(product.rating, 4);
    });

    it('should create a url form the selected attributes', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock = Object.assign({}, productVariantMock, tempMock);
        var product = new FullProduct(toProductMock(tempMock), null, null);

        assert.equal(product.selectedVariantUrl, 'some url');
    });
});
