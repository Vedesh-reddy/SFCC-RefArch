'use strict';

var assert = require('chai').assert;
var Order = require('../../../../cartridges/app_storefront_base/cartridge/models/order');

var createApiBasket = function () {
    return {
        billingAddress: true,
        defaultShipment: {
            shippingAddress: true
        },
        orderNo: 'some String',
        creationDate: 'some Date',
        customerEmail: 'some Email',
        status: 'some status',
        productQuantityTotal: 1
    };
};

var shippingModel = {};
var billingModel = {};
var totalsModel = {};
var productLineItemsModel = {};
var config = {
    numberOfLineItems: '*'
};

describe('Order', function () {
    it('should handle null parameters', function () {
        var result = new Order(null, null, null, null, null);
        assert.equal(result.shipping, null);
        assert.equal(result.billing, null);
        assert.equal(result.totals, null);
        assert.equal(result.items, null);
        assert.equal(result.steps, null);
        assert.equal(result.orderNumber, null);
        assert.equal(result.creationDate, null);
        assert.equal(result.orderEmail, null);
    });

    it('should handle a basket object ', function () {
        var modelsObject = {
            billingModel: billingModel,
            shippingModel: shippingModel,
            totalsModel: totalsModel,
            productLineItemsModel: productLineItemsModel
        };

        var result = new Order(createApiBasket(), modelsObject, config);
        assert.equal(result.shipping, shippingModel);
        assert.equal(result.billing, billingModel);
        assert.equal(result.totals, totalsModel);
        assert.equal(result.items, productLineItemsModel);
        assert.deepEqual(result.steps, {
            shipping: {
                iscompleted: true
            },
            billing: {
                iscompleted: true
            }
        });
        assert.equal(result.orderNumber, 'some String');
        assert.equal(result.creationDate, 'some Date');
        assert.equal(result.orderEmail, 'some Email');
    });

    it('should handle a basket that does not have a defaultShipment', function () {
        var basket = {
            billingAddress: true
        };
        var modelsObject = {
            billingModel: null,
            shippingModel: null,
            totalsModel: null,
            productLineItemsModel: null
        };

        var result = new Order(basket, modelsObject, config);
        assert.deepEqual(result.steps, {
            shipping: {
                iscompleted: false
            },
            billing: {
                iscompleted: true
            }
        });
    });

    it('should return the subset of the order model when using config.numberOfLineItems = "single".', function () {
        config = {
            numberOfLineItems: 'single'
        };

        productLineItemsModel = {
            length: 2,
            items: [
                {
                    images: {
                        small: [
                            {
                                url: 'url to small image',
                                alt: 'url to small image',
                                title: 'url to small image'
                            }
                        ]
                    }
                }
            ]
        };

        shippingModel = {
            shippingAddress: {
                firstName: 'John',
                lastName: 'Snow'
            }
        };

        totalsModel = {
            grandTotal: '$129.87'
        };

        var modelsObject = {
            billingModel: null,
            shippingModel: shippingModel,
            totalsModel: totalsModel,
            productLineItemsModel: productLineItemsModel
        };

        var result = new Order(createApiBasket(), modelsObject, config);

        assert.equal(result.creationDate, 'some Date');
        assert.equal(result.shippedToLastName, 'Snow');
        assert.equal(result.shippedToFirstName, 'John');
        assert.equal(result.productQuantityTotal, 1);
        assert.equal(result.priceTotal, totalsModel.grandTotal);
        assert.equal(result.orderStatus, 'some status');
        assert.equal(result.orderNumber, 'some String');
        assert.equal(result.orderEmail, 'some Email');
    });
});
