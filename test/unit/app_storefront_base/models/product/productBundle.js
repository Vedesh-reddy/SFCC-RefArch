'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var ArrayList = require('../../../../mocks/dw.util.Collection');
var toProductMock = require('../../../../util');

describe('bundleProduct', function () {
    var ProductBundle = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/models/product/productBundle', {
        '*/cartridge/models/product/productBase': proxyquire('../../../../../cartridges/app_storefront_base/cartridge/models/product/productBase', {
            '*/cartridge/models/product/productImages': function () {},
            '*/cartridge/models/product/productAttributes': function () { return []; },
            '*/cartridge/scripts/util/collections': proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/util/collections', {
                'dw/util/ArrayList': ArrayList
            }),
            '*/cartridge/scripts/factories/price': { getPrice: function () {} },
            'dw/web/Resource': {
                msgf: function () { return 'some string with param'; },
                msg: function () { return 'some string'; }
            },
            '*/cartridge/scripts/helpers/productHelpers': {
                getSelectedOptionsUrl: function () { return ''; }
            }
        }),
        '*/cartridge/scripts/util/collections': proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/util/collections', {
            'dw/util/ArrayList': ArrayList
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
        variant: true,
        master: false,
        productSet: false,
        bundle: false,
        availabilityModel: availabilityModelMock,
        optionModel: optionModelMock,
        shortDescription: {
            markup: 'Hello World'
        },
        longDescription: {
            markup: 'Hello World Long'
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
            setSelectedAttributeValue: {
                return: null,
                type: 'function'
            },
            selectedVariant: productVariantMock,
            getAllValues: {
                return: new ArrayList([]),
                type: 'function'
            }
        }
    };

    var bundleProductMock = {
        ID: 'bundle-product',
        name: 'aBundleProduct',
        bundle: true,
        bundledProducts: new ArrayList([productMock]),
        variationModel: {},
        availabilityModel: availabilityModelMock,
        optionModel: optionModelMock,
        minOrderQuantity: {
            value: 2
        },
        stepQuantity: {
            value: 1
        },
        attributeModel: attributeModel,
        getBundledProductQuantity: function () { return { value: 5 }; }
    };

    var promotionsMock = new ArrayList([{
        calloutMsg: { markup: 'Super duper promotion discount' },
        details: { markup: 'Some Details' },
        enabled: true,
        ID: 'SuperDuperPromo',
        name: 'Super Duper Promo',
        promotionClass: 'Some Class',
        rank: null
    }]);

    var productFactoryMock = {
        get: function () {
            return 'some product';
        }
    };

    it('should load bundle product with one variant', function () {
        var mock = toProductMock(bundleProductMock);
        var bundleProduct = new ProductBundle(mock, null, null, productFactoryMock);

        assert.equal(bundleProduct.productName, 'aBundleProduct');
        assert.equal(bundleProduct.id, 'bundle-product');
        assert.equal(bundleProduct.productType, 'bundle');
        assert.equal(bundleProduct.promotions, null);
        assert.deepEqual(bundleProduct.bundledProducts, ['some product']);
    });

    it('should load bundle product with promotion', function () {
        var mock = toProductMock(bundleProductMock);
        var expectedPromotions = [{
            calloutMsg: 'Super duper promotion discount',
            details: 'Some Details',
            enabled: true,
            id: 'SuperDuperPromo',
            name: 'Super Duper Promo',
            promotionClass: 'Some Class',
            rank: null
        }];
        var bundleProduct = new ProductBundle(mock, null, promotionsMock, productFactoryMock);

        assert.deepEqual(bundleProduct.promotions, expectedPromotions);
    });

    it('should load bundle product without minOrder', function () {
        var tempMock = bundleProductMock;
        tempMock.minOrderQuantity.value = null;
        var mock = toProductMock(tempMock);
        var bundleProduct = new ProductBundle(mock, null, null, productFactoryMock);
        assert.equal(bundleProduct.minOrderQuantity, 1);
        assert.equal(bundleProduct.maxOrderQuantity, 9);
    });
});
