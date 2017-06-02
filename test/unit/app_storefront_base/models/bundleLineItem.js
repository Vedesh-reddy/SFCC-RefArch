'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var ArrayList = require('../../../mocks/dw.util.Collection');
var toProductMock = require('../../../util');

describe('Bundle Product Line Item', function () {
    var ProductLineItem = proxyquire('../../../../cartridges/app_storefront_base/cartridge/models/productLineItem/productLineItem', {
        './../product/productBase': proxyquire('../../../../cartridges/app_storefront_base/cartridge/models/product/productBase', {
            './productImages': function () {},
            './productAttributes': function () { return []; },
            '*/cartridge/scripts/util/collections': proxyquire('../../../../cartridges/app_storefront_base/cartridge/scripts/util/collections', {
                'dw/util/ArrayList': ArrayList
            }),
            '../../scripts/factories/price': { getPrice: function () {} },
            'dw/web/Resource': {
                msgf: function () { return 'some string with param'; },
                msg: function () { return 'some string'; }
            },
            '*/cartridge/scripts/helpers/productHelpers': proxyquire('../../../../cartridges/app_storefront_base/cartridge/scripts/helpers/productHelpers', {
                '*/cartridge/scripts/util/collections': proxyquire('../../../../cartridges/app_storefront_base/cartridge/scripts/util/collections', {
                    'dw/util/ArrayList': ArrayList
                }),
                '*/cartridge/scripts/helpers/urlHelpers': {
                    appendQueryParams: function () {}
                }
            })
        }),
        'dw/util/StringUtils': {
            formatMoney: function () {
                return 'formattedMoney';
            }
        },
        'dw/value/Money': require('../../../mocks/dw.value.Money'),
        '~/cartridge/scripts/renderTemplateHelper': {
            getRenderedHtml: function () { return 'string'; }
        },
        '*/cartridge/scripts/util/collections': proxyquire('../../../../cartridges/app_storefront_base/cartridge/scripts/util/collections', {
            'dw/util/ArrayList': ArrayList
        }),
        '*/cartridge/scripts/helpers/productHelpers': {
            getCurrentOptionModel: function () {}
        }
    });

    var ProductLineItemBundle = proxyquire('../../../../cartridges/app_storefront_base/cartridge/models/productLineItem/bundleLineItem', {
        '*/cartridge/scripts/util/collections': proxyquire('../../../../cartridges/app_storefront_base/cartridge/scripts/util/collections', {
            'dw/util/ArrayList': ArrayList
        }),
        './productLineItem': ProductLineItem
    });

    var productFactoryMock = {
        get: function () {
            return 'some product';
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
            },
            ATS: {
                value: 100
            }
        }
    };

    var productVariantMock = {
        ID: '1234567',
        name: 'test product',
        variant: true,
        availabilityModel: availabilityModelMock,
        minOrderQuantity: {
            value: 2
        },
        attributeModel: attributeModel
    };

    var productMock = {
        ID: '12345679',
        variationModel: {
            productVariationAttributes: new ArrayList([{
                attributeID: '',
                value: ''
            }]),
            selectedVariant: productVariantMock
        },
        attributeModel: attributeModel,
        availabilityModel: availabilityModelMock,
        minOrderQuantity: {
            value: 2
        },
        optionModel: { options: new ArrayList() }
    };

    var priceAdjustments = new ArrayList([
        {
            promotion: {
                calloutMsg: { markup: 'string' },
                details: { markup: 'string' },
                name: 'some name'
            }
        }
    ]);

    var lineItem = {
        bonusProductLineItem: false,
        gift: false,
        UUID: 'some UUID',
        adjustedPrice: {
            value: 'some value',
            currencyCode: 'US'
        },
        priceAdjustments: priceAdjustments,
        getPrice: function () { return 'money object'; },
        product: toProductMock(productMock),
        shipment: {
            UUID: 'shipment UUID'
        },
        optionProductLineItems: new ArrayList(),
        bundledProductLineItems: new ArrayList([{ product: productMock, quantity: { value: 1 } }])
    };

    it('should load bundled product line item', function () {
        var productLineItemBundle = new ProductLineItemBundle(
            lineItem.product,
            1,
            lineItem,
            null,
            productFactoryMock
        );

        assert.equal(productLineItemBundle.bundledProductLineItems.length, 1);
    });
});
