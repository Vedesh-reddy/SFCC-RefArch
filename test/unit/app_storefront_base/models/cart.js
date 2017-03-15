'use strict';

var assert = require('chai').assert;
var ArrayList = require('../../../mocks/dw.util.Collection');

var Money = require('../../../mocks/dw.value.Money');


var createApiBasket = function () {
    var basket = {
        defaultShipment: {
            shippingMethod: {
                ID: '005'
            }
        },
        productLineItems: 'some items'
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
        }],
        selectedShippingMethod: {
            ID: 'some ID'
        }
    };
};

var createProductLineItemModel = function () {
    return {
        items: [],
        totalQuantity: 0
    };
};

var createDiscountPlan = function () {
    return {
        getApproachingOrderDiscounts: function () {
            return new ArrayList([{
                getDistanceFromConditionThreshold: function () {
                    return new Money();
                },
                getDiscount: function () {
                    return {
                        getPromotion: function () {
                            return {
                                getCalloutMsg: function () {
                                    return 'someString';
                                }
                            };
                        }
                    };
                }
            }]);
        },
        getApproachingShippingDiscounts: function () {
            return new ArrayList([{
                getDistanceFromConditionThreshold: function () {
                    return new Money();
                },
                getDiscount: function () {
                    return {
                        getPromotion: function () {
                            return {
                                getCalloutMsg: function () {
                                    return 'someString';
                                }
                            };
                        }
                    };
                }
            }]);
        }
    };
};

var totalsModel = {
    subTotal: '$10.50',
    grandTotal: '$12.50',
    totalTax: '$1.00',
    totalShippingCost: '$1.00'
};

describe('cart', function () {
    var Cart = require('../../../mocks/models/cart');

    it('should accept/process a null Basket object', function () {
        var nullBasket = null;
        var result = new Cart(nullBasket);

        assert.equal(result.items.length, 0);
        assert.equal(result.numItems, 0);
    });

    // TODO: PJP uncomment and fix
    // it('should get shippingMethods from the shipping model', function () {
    //     var result = new Cart(
    //         createApiBasket(),
    //         createShipmentShippingModel(),
    //         createProductLineItemModel(),
    //         totalsModel,
    //         createDiscountPlan()
    //     );
    //     assert.equal(result.shippingMethods[0].description, 'Order received within 7-10 ' +
    //         'business days'
    //     );
    //     assert.equal(result.shippingMethods[0].displayName, 'Ground');
    //     assert.equal(result.shippingMethods[0].ID, '001');
    //     assert.equal(result.shippingMethods[0].shippingCost, '$0.00');
    //     assert.equal(result.shippingMethods[0].estimatedArrivalTime, '7-10 Business Days');
    // });

    // it('should get totals from totals model', function () {
    //     var result = new Cart(createApiBasket(), null, createProductLineItemModel(), totalsModel, createDiscountPlan());
    //     assert.equal(result.totals.subTotal, '$10.50');
    //     assert.equal(result.totals.grandTotal, '$12.50');
    //     assert.equal(result.totals.totalTax, '$1.00');
    //     assert.equal(result.totals.totalShippingCost, '$1.00');
    // });
    // it('should get approaching discounts', function () {
    //     var result = new Cart(createApiBasket(), null, createProductLineItemModel(), null, createDiscountPlan());
    //     assert.equal(result.approachingDiscounts[0].discountMsg, 'someString');
    //     assert.equal(result.approachingDiscounts[1].discountMsg, 'someString');
    // });
});
