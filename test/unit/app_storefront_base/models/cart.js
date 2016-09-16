'use strict';

var assert = require('chai').assert;
var ArrayList = require('../../../mocks/dw.util.Collection');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var urlUtilsMock = require('../../../mocks/dw.web.URLUtils');


var createApiBasket = function () {
    var basket = {
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

var totalsModel = {
    subTotal: '$10.50',
    grandTotal: '$12.50',
    totalTax: '$1.00',
    totalShippingCost: '$1.00'
};

describe('cart', function () {
    var Cart = null;
    Cart = proxyquire('../../../../app_storefront_base/cartridge/models/cart', {
        'dw/web/URLUtils': urlUtilsMock,
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

    it('should get shippingMethods from the shipping model', function () {
        var result = new Cart(
            createApiBasket(),
            createShipmentShippingModel(),
            createProductLineItemModel(),
            totalsModel
        );
        assert.equal(result.shippingMethods[0].description, 'Order received within 7-10 ' +
            'business days'
        );
        assert.equal(result.shippingMethods[0].displayName, 'Ground');
        assert.equal(result.shippingMethods[0].ID, '001');
        assert.equal(result.shippingMethods[0].shippingCost, '$0.00');
        assert.equal(result.shippingMethods[0].estimatedArrivalTime, '7-10 Business Days');
    });

    it('should get totals from totals model', function () {
        var result = new Cart(createApiBasket(), null, createProductLineItemModel(), totalsModel);
        assert.equal(result.totals.subTotal, '$10.50');
        assert.equal(result.totals.grandTotal, '$12.50');
        assert.equal(result.totals.totalTax, '$1.00');
        assert.equal(result.totals.totalShippingCost, '$1.00');
    });
});
