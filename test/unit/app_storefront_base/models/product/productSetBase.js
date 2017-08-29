'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var ArrayList = require('../../../../mocks/dw.util.Collection');
var toProductMock = require('../../../../util');

describe('productSetBase', function () {
    var ProductSetBase = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/models/product/productSetBase', {
        '*/cartridge/models/product/productBase': proxyquire('../../../../../cartridges/app_storefront_base/cartridge/models/product/productBase', {
            '*/cartridge/models/product/productImages': function () {},
            '*/cartridge/models/product/productAttributes': function () { return []; },
            '*/cartridge/scripts/util/collections': proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/util/collections', {
                'dw/util/ArrayList': ArrayList
            }),
            '*/cartridge/scripts/factories/price': { getPrice: function () {} },
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
        })
    });

    var regularPriceObject = {
        sales: {
            value: 85,
            currency: 'USD',
            formatted: 'USD 85'
        }
    };

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
        price: regularPriceObject
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
        attributeModel: attributeModel
    };

    var productFactoryMock = {
        get: function () {
            return productMock;
        }
    };

    it('should have bundled products', function () {
        var tempMock = Object.assign({}, setProductMock);
        var productSetBase = new ProductSetBase(toProductMock(tempMock), null, null, productFactoryMock);
        assert.deepEqual(productSetBase.individualProducts, [productMock, productMock]);
    });
});
