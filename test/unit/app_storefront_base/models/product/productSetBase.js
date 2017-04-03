'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var ArrayList = require('../../../../mocks/dw.util.Collection');
var toProductMock = require('../../../../util');

describe('productSetBase', function () {
    var ProductSetBase = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/models/product/productSetBase', {
        './productBase': proxyquire('../../../../../cartridges/app_storefront_base/cartridge/models/product/productBase', {
            './productImages': function () {},
            './productAttributes': function () { return []; },
            '../../scripts/dwHelpers': proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/dwHelpers', {
                'dw/util/ArrayList': ArrayList
            }),
            '../../scripts/factories/price': { getPrice: function () {} },
            'dw/web/Resource': {
                msgf: function (params) { return params; },
                msg: function (params) { return params; }
            }
        }),
        '../../scripts/dwHelpers': proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/dwHelpers', {
            'dw/util/ArrayList': ArrayList
        }),
        '~/cartridge/scripts/util/formatting': {
            formatCurrency: function () {
                return 'formatted money';
            }
        }
    });

    var regularPriceObject = {
        sales: {
            value: 85,
            currency: 'USD',
            formatted: 'USD 85'
        }
    };

    var tierPriceObject = {
        tiers: [{
            price: {
                sales: {
                    currency: 'USD',
                    formatted: 'USD 45',
                    value: 45
                }
            }
        },
        {
            price: {
                sales: {
                    currency: 'USD',
                    formatted: 'USD 30',
                    value: 30
                }
            }
        },
        {
            price: {
                sales: {
                    currency: 'USD',
                    formatted: 'USD 20',
                    value: 20
                }
            }
        }],
        type: 'tiered'
    };

    var rangePriceObject = {
        max: {
            sales: {
                currency: 'USD',
                formatted: 'USD 65',
                value: 65
            }
        },
        min: {
            sales: {
                currency: 'USD',
                formatted: 'USD 15',
                value: 15
            }
        },
        type: 'range'
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
        minOrderQuantity: {
            value: 2
        },
        attributeModel: attributeModel
    };

    var productFactoryMock = {
        get: function (param) {
            var product;
            var productMockA = Object.assign({}, productMock);
            var productMockB = Object.assign({}, productMock);
            var productMockC = Object.assign({}, productMock);
            productMockA.price = regularPriceObject;
            productMockB.price = rangePriceObject;
            productMockC.price = tierPriceObject;
            switch (param.pid) {
                case 'A':
                    product = productMockA;
                    break;
                case 'B':
                    product = productMockB;
                    break;
                case 'C':
                    product = productMockC;
                    break;
                default:
                    product = productMock;
            }
            return product;
        }
    };

    it('should load set product with regular prices', function () {
        var tempMock = Object.assign({}, setProductMock);
        var productMockA = Object.assign({}, productMock);
        productMockA.price = regularPriceObject;
        productMockA.ID = 'A';
        tempMock.bundledProducts = new ArrayList([productMockA, productMockA]);
        var mock = toProductMock(tempMock);
        var productSetBase = new ProductSetBase(mock, null, null, productFactoryMock);
        assert.equal(productSetBase.productName, 'aSetProduct');
        assert.equal(productSetBase.price.sales.value, 170);
    });

    it('should load set product with range prices', function () {
        var tempMock = Object.assign({}, setProductMock);
        var productMockB = Object.assign({}, productMock);
        productMockB.price = rangePriceObject;
        productMockB.ID = 'B';
        tempMock.bundledProducts = new ArrayList([productMockB, productMockB]);
        var mock = toProductMock(tempMock);
        var productSetBase = new ProductSetBase(mock, null, null, productFactoryMock);
        assert.equal(productSetBase.productName, 'aSetProduct');
        assert.equal(productSetBase.price.max.sales.value, 130);
        assert.equal(productSetBase.price.min.sales.value, 30);
        assert.equal(productSetBase.price.type, 'range');
    });

    it('should load set product with tiered prices', function () {
        var tempMock = Object.assign({}, setProductMock);
        var productMockC = Object.assign({}, productMock);
        productMockC.price = tierPriceObject;
        productMockC.ID = 'C';
        tempMock.bundledProducts = new ArrayList([productMockC, productMockC]);
        var mock = toProductMock(tempMock);
        var productSetBase = new ProductSetBase(mock, null, null, productFactoryMock);
        assert.equal(productSetBase.productName, 'aSetProduct');
        assert.equal(productSetBase.price.max.sales.value, 90);
        assert.equal(productSetBase.price.min.sales.value, 40);
        assert.equal(productSetBase.price.type, 'range');
    });

    it('should load set product with tiered, range and regular prices combined', function () {
        var tempMock = Object.assign({}, setProductMock);
        var productMockA = Object.assign({}, productMock);
        var productMockB = Object.assign({}, productMock);
        var productMockC = Object.assign({}, productMock);
        productMockA.price = regularPriceObject;
        productMockA.ID = 'A';
        productMockB.price = rangePriceObject;
        productMockB.ID = 'B';
        productMockC.price = tierPriceObject;
        productMockC.ID = 'C';
        tempMock.bundledProducts = new ArrayList([productMockA, productMockB, productMockC]);
        var mock = toProductMock(tempMock);
        var productSetBase = new ProductSetBase(mock, null, null, productFactoryMock);
        assert.equal(productSetBase.price.type, 'range');
        assert.equal(productSetBase.price.max.sales.value, 195);
        assert.equal(productSetBase.price.min.sales.value, 120);
    });

    it('should have bundled products', function () {
        var tempMock = Object.assign({}, setProductMock);
        var productSetBase = new ProductSetBase(toProductMock(tempMock), null, null, productFactoryMock);
        assert.deepEqual(productSetBase.individualProducts, [productMock, productMock]);
    });
});
