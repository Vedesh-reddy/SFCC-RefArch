'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var ArrayList = require('../../../../mocks/dw.util.Collection');
var toProductMock = require('../../../../util');

describe('productSet', function () {
    var ProductSet = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/models/product/productSet', {
        './productSetBase': proxyquire('../../../../../cartridges/app_storefront_base/cartridge/models/product/productSetBase', {
            './productBase': proxyquire('../../../../../cartridges/app_storefront_base/cartridge/models/product/productBase', {
                './productImages': function () {},
                './productAttributes': function () { return []; },
                '*/cartridge/scripts/util/collections': proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/util/collections', {
                    'dw/util/ArrayList': ArrayList
                }),
                '../../scripts/factories/price': { getPrice: function () {} },
                'dw/web/Resource': {
                    msgf: function (params) { return params; },
                    msg: function (params) { return params; }
                },
                '*/cartridge/scripts/helpers/productHelpers': {
                    getSelectedOptionsUrl: function () { return ''; }
                }
            }),
            '*/cartridge/scripts/util/collections': proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/util/collections', {
                'dw/util/ArrayList': ArrayList
            }),
            '~/cartridge/scripts/util/formatting': {
                formatCurrency: function () {
                    return 'formatted money';
                }
            }
        })
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

    var stockLevels = {
        inStock: {
            value: 2
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

    var availabilityModelMock = {
        getAvailabilityLevels: {
            return: stockLevels,
            type: 'function'
        },
        isOrderable: {
            return: true,
            type: 'function'
        },
        inventoryRecord: {
            inStockDate: {
                toDateString: function () {
                    return 'some date';
                }
            }
        }
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

    var mockOption1 = {
        ID: 'Option 1 ID',
        displayName: 'Option 1',
        htmlName: 'Option 1 HTML',
        selectedValueId: 'Option Value 1 ID',
        optionId: 'Option 1 ID',
        values: [{
            ID: 'Option Value 1 ID',
            displayValue: 'Option 1 Display Value',
            price: '$9.99',
            priceValue: 9.99
        }]
    };

    var optionUrl = 'some url';
    var optionModelMock = {
        getOptions: function () {
            return new ArrayList([mockOption1]);
        },
        getPrice: function (value) {
            return {
                toFormattedString: function () {
                    return value.price;
                },
                decimalValue: 9.99
            };
        },
        getOptionValue: function () {},
        getSelectedOptionValue: function (option) {
            return option.values[0];
        },
        setSelectedOptionValue: function () {},
        urlSelectOptionValue: function () {
            return {
                toString: function () {
                    return optionUrl;
                }
            };
        },
        options: new ArrayList([mockOption1])
    };

    var productVariantMock = {
        ID: '1234567',
        name: 'test product',
        variant: false,
        variationGroup: false,
        productSet: false,
        bundle: false,
        master: true,
        attributeModel: attributeModel,
        availabilityModel: availabilityModelMock,
        optionModel: optionModelMock,
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
            setSelectedAttributeValue: {
                return: null,
                type: 'function'
            },
            selectedVariant: productVariantMock,
            getAllValues: {
                return: new ArrayList([]),
                type: 'function'
            }
        },
        attributeModel: attributeModel,
        optionModel: optionModelMock,
        master: false,
        variant: false,
        variationGroup: false,
        productSet: false,
        bundle: false,
        optionProduct: false,
        availabilityModel: availabilityModelMock,
        minOrderQuantity: {
            value: 2
        },
        price: {
            sales: {
                value: 85,
                currency: 'USD',
                formatted: 'USD 85'
            }
        }
    };

    var setProductMock = {
        ID: 'set-product',
        name: 'aSetProduct',
        productSet: true,
        bundledProducts: new ArrayList([productMock, productMock]),
        variationModel: {},
        availabilityModel: availabilityModelMock,
        optionModel: optionModelMock,
        minOrderQuantity: {
            value: 2
        },
        attributeModel: attributeModel,
        price: {
            sales: {
                value: 85,
                currency: 'USD',
                formatted: 'USD 85'
            }
        }
    };

    var productFactoryMock = {
        get: function () {
            return productMock;
        }
    };

    it('should load set product', function () {
        var tempMock = Object.assign({}, setProductMock);
        tempMock.bundledProducts = new ArrayList([productMock, productMock]);
        var mock = toProductMock(tempMock);
        var productSet = new ProductSet(mock, null, null, productFactoryMock);

        assert.equal(productSet.productName, 'aSetProduct');
    });

    it('should load product set without minOrder', function () {
        var tempMock = Object.assign({}, setProductMock);
        tempMock.variationModel.selectedVariant = null;
        tempMock = Object.assign({}, productVariantMock, tempMock);
        tempMock.minOrderQuantity.value = null;
        var productSet = new ProductSet(toProductMock(tempMock), null, null, productFactoryMock);

        assert.equal(productSet.minOrderQuantity, 1);
        assert.equal(productSet.maxOrderQuantity, 9);
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

        var tempMock = Object.assign({}, setProductMock);
        tempMock.variationModel.selectedVariant = null;
        tempMock = Object.assign({}, productVariantMock, tempMock);
        tempMock.minOrderQuantity.value = null;
        var productSet = new ProductSet(toProductMock(tempMock), null, promotions, productFactoryMock);

        assert.deepEqual(productSet.promotions, expectedPromotions);
    });

    it('should handle no promotions', function () {
        var tempMock = Object.assign({}, setProductMock);
        tempMock.variationModel.selectedVariant = null;
        tempMock = Object.assign({}, productVariantMock, tempMock);
        tempMock.minOrderQuantity.value = null;
        var productSet = new ProductSet(toProductMock(tempMock), null, null, productFactoryMock);

        assert.deepEqual(productSet.promotions, null);
    });

    it('should have bundled products', function () {
        var tempMock = Object.assign({}, setProductMock);
        var productSet = new ProductSet(toProductMock(tempMock), null, null, productFactoryMock);
        assert.deepEqual(productSet.individualProducts, [productMock, productMock]);
    });
});
