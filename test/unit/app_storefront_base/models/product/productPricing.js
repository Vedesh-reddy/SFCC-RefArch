'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var ArrayList = require('../../../../mocks/dw.util.Collection');
var toProductMock = require('../../../../util');

describe('productPricing', function () {
    var ProductPricing = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/models/product/productPricing', {
        'dw/value/Money': require('../../../../mocks/dw.value.Money'),
        'dw/util/StringUtils': {
            formatMoney: function () {
                return 'formattedMoney';
            }
        },
        'dw/campaign/Promotion': {
            PROMOTION_CLASS_PRODUCT: 'someClass'
        },
        '../../scripts/dwHelpers': proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/dwHelpers', {
            'dw/util/ArrayList': ArrayList
        })
    });

    var priceMock = {
        ID: 1234567,
        available: true,
        getCurrency: {
            return: {
                getCurrencyCode: {
                    return: 'USD',
                    type: 'function'
                }
            },
            type: 'function'
        },
        getCurrencyCode: {
            return: 'USD',
            type: 'function'
        },
        getDecimalValue: {
            return: {
                get: {
                    return: '10.99',
                    type: 'function'
                }
            },
            type: 'function'
        }
    };

    var pricingMock = {
        length: 1,
        getPrice: {
            return: priceMock,
            type: 'function'
        },
        priceInfo: {
            priceBook: {
                parentPriceBook: {
                    parentPriceBook: priceMock
                }
            }
        },
        getPriceBookPrice: {
            return: priceMock,
            type: 'function'
        },
        isPriceRange: {
            return: false,
            type: 'function'
        },
        getPriceTable: {
            return: {
                getQuantities: {
                    return: new ArrayList([]),
                    type: 'function'
                }
            },
            type: 'function'
        },
        getBasePriceQuantity: {
            return: null,
            type: 'function'
        }
    };

    var productMock = {
        getPriceModel: {
            return: pricingMock,
            type: 'function'
        },
        master: true
    };

    it('should get standard product pricing', function () {
        var mock = toProductMock(productMock);
        var productPricing = new ProductPricing(mock, []);
        assert.equal(productPricing.type, 'standard');
        assert.equal(productPricing.value, '10.99');
        assert.equal(productPricing.currency, 'USD');
        assert.equal(productPricing.formatted, 'formattedMoney');
    });

    it('should get range product pricing', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.getPriceModel.return.minPrice = Object.assign({}, priceMock);
        tempMock.getPriceModel.return.maxPrice = Object.assign({}, priceMock, {
            getDecimalValue: {
                return: {
                    get: {
                        return: '20.99',
                        type: 'function'
                    }
                },
                type: 'function'
            }
        });
        tempMock.getPriceModel.return.isPriceRange.return = true;
        var mock = toProductMock(tempMock);
        var productPricing = new ProductPricing(mock, []);
        assert.equal(productPricing.type, 'range');
        assert.equal(productPricing.min.value, '10.99');
        assert.equal(productPricing.max.value, '20.99');
    });
});
