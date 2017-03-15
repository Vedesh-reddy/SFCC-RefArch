'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var sinon = require('sinon');

var createApiBasket = function (productInBasket) {
    var currentBasket = {
        defaultShipment: {},
        createProductLineItem: function () {
            return {
                setQuantityValue: function () {
                    return;
                }
            };
        }
    };

    if (productInBasket) {
        currentBasket.productLineItems = [
            {
                productID: 'someProductID',
                quantity: 1,
                setQuantityValue: function () {
                    return;
                }
            }
        ];
    } else {
        currentBasket.productLineItems = [];
    }

    return currentBasket;
};

describe('cartHelpers', function () {
    var cartHelpers = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/cart/cartHelpers', {
        'dw/catalog/ProductMgr': {
            getProduct: function () {
                return {
                    optionModel: {}
                };
            }
        },
        '~/cartridge/scripts/util/collections': {
        },
        '~/cartridge/scripts/checkout/shippingHelpers': {},
        'dw/system/Transaction': {
            wrap: function (item) {
                item();
            }
        }
    });

    it('should add a product to the cart', function () {
        var currentBasket = createApiBasket(false);
        var spy = sinon.spy(currentBasket, 'createProductLineItem');
        spy.withArgs(1);

        cartHelpers.addProductToCart(currentBasket, 'someProductID', 1);
        assert.isTrue(spy.calledOnce);
        currentBasket.createProductLineItem.restore();
    });

    it('should set the quantity of the product in the cart', function () {
        var currentBasket = createApiBasket(true);
        var spy = sinon.spy(currentBasket.productLineItems[0], 'setQuantityValue');
        spy.withArgs(1);

        cartHelpers.addProductToCart(currentBasket, 'someProductID', 1);
        assert.isTrue(spy.calledOnce);
        currentBasket.productLineItems[0].setQuantityValue.restore();
    });
});
