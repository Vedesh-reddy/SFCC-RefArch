'use strict';

var assert = require('chai').assert;
var ArrayList = require('../../../mocks/dw.util.Collection');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var getMockMoney = require('../../../mocks/dw.value.Money');
var urlUtilsMock = require('../../../mocks/dw.web.URLUtils');


var createApiBasket = function (isAvailable) {
    var basket = {
        totalGrossPrice: {
            value: 302.32,
            currencyCode: 'USD',
            available: isAvailable
        },
        totalTax: {
            value: 14.40,
            currencyCode: 'USD',
            available: isAvailable
        },
        shippingTotalPrice: {
            value: 9.99,
            currencyCode: 'USD',
            available: isAvailable
        },
        adjustedMerchandizeTotalPrice: {
            value: 9.99,
            currencyCode: 'USD',
            available: isAvailable
        },
        defaultShipment: {
            shippingMethod: {
                ID: '005'
            }
        }
    };

    basket.shipments = new ArrayList([{}]);

    return basket;
};

var createShipmentShippingModel = function () {
    return {
        applicableShippingMethods: [{
            description: 'Order received within 7-10 business days',
            displayName: 'Ground',
            ID: '001',
            shippingCost: '$0.00',
            estimatedArrivalTime: '7-10 Business Days'
        }]
    };
};

var createProductLineItemModel = function () {
    return {
        items: [],
        totalQuantity: 0
    };
};

describe('cart', function () {
    var Cart = null;
    Cart = proxyquire('../../../../app_storefront_base/cartridge/models/cart', {
        'dw/web/URLUtils': urlUtilsMock,
        'dw/util/StringUtils': {
            formatMoney: function () {
                return 'formattedMoney';
            }
        },
        'dw/value/Money': getMockMoney,
        'dw/web/Resource': {
            msg: function () {
                return 'someString';
            },
            msgf: function () {
                return 'someString';
            }
        }
    });

    it('should accept/process a null Basket object', function () {
        var nullBasket = null;
        var result = new Cart(nullBasket, null, createProductLineItemModel());
        assert.equal(result.items.length, 0);
        assert.equal(result.numItems, 0);
    });

    it('should get shippingMethods and convert to a plain object', function () {
        var result = new Cart(createApiBasket(true), createShipmentShippingModel(), createProductLineItemModel());
        assert.equal(result.shippingMethods[0].description, 'Order received within 7-10 ' +
            'business days'
        );
        assert.equal(result.shippingMethods[0].displayName, 'Ground');
        assert.equal(result.shippingMethods[0].ID, '001');
        assert.equal(result.shippingMethods[0].shippingCost, '$0.00');
        assert.equal(result.shippingMethods[0].estimatedArrivalTime, '7-10 Business Days');
    });

    it('should set cart totals to "-" if cart totals are unavailable', function () {
        var result = new Cart(createApiBasket(false), null, createProductLineItemModel());
        assert.equal(result.totals.subTotal, '-');
        assert.equal(result.totals.grandTotal, result.totals.subTotal);
        assert.equal(result.totals.totalTax, '-');
        assert.equal(result.totals.totalShippingCost, '-');
    });
});
