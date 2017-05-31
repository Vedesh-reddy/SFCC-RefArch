'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var sinon = require('sinon');

var ArrayList = require('../../../../mocks/dw.util.Collection.js');

var mockOptions = [{
    optionId: 'option 1',
    selectedValueId: '123'
}];

var productLineItemMock = {
    productID: 'someProductID',
    quantity: {
        value: 1
    },
    setQuantityValue: function () {
        return;
    },
    product: {
        availabilityModel: {
            inventoryRecord: {
                ATS: {
                    value: 3
                }
            }
        }
    },
    optionProductLineItems: new ArrayList(mockOptions)
};

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
        currentBasket.productLineItems = [productLineItemMock];
    } else {
        currentBasket.productLineItems = [];
    }

    return currentBasket;
};

describe('cartHelpers', function () {
    var findStub = sinon.stub();
    findStub.withArgs([productLineItemMock]).returns(productLineItemMock);

    var cartHelpers = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/cart/cartHelpers', {
        'dw/catalog/ProductMgr': {
            getProduct: function () {
                return {
                    optionModel: {
                        getOption: function () {},
                        getOptionValue: function () {},
                        setSelectedOptionValue: function () {}
                    }
                };
            }
        },
        '~/cartridge/scripts/util/collections': proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/util/collections', {
            'dw/util/ArrayList': ArrayList
        }),
        '~/cartridge/scripts/checkout/shippingHelpers': {},
        'dw/system/Transaction': {
            wrap: function (item) {
                item();
            }
        },
        '~/cartridge/scripts/util/array': { find: findStub },
        'dw/web/Resource': {
            msg: function () {
                return 'someString';
            },
            msgf: function () {
                return 'someString';
            }
        },
        '~/cartridge/scripts/helpers/productHelpers': {
            getOptions: function () {},
            getCurrentOptionModel: function () {}
        }
    });

    it('should add a product to the cart', function () {
        var currentBasket = createApiBasket(false);
        var spy = sinon.spy(currentBasket, 'createProductLineItem');
        spy.withArgs(1);

        cartHelpers.addProductToCart(currentBasket, 'someProductID', 1, [], mockOptions);
        assert.isTrue(spy.calledOnce);
        currentBasket.createProductLineItem.restore();
    });

    it('should set the quantity of the product in the cart', function () {
        var currentBasket = createApiBasket(true);
        var spy = sinon.spy(currentBasket.productLineItems[0], 'setQuantityValue');
        spy.withArgs(1);

        cartHelpers.addProductToCart(currentBasket, 'someProductID', 1, [], mockOptions);
        assert.isTrue(spy.calledOnce);
        currentBasket.productLineItems[0].setQuantityValue.restore();
    });

    it('should not add a product to the cart', function () {
        var currentBasket = createApiBasket(true);

        var result = cartHelpers.addProductToCart(currentBasket, 'someProductID', 4, [], mockOptions);
        assert.isTrue(result.error);
        assert.equal(result.message, 'someString');
    });

    it('should not add a product to the cart when ATS is already in cart', function () {
        var currentBasket = createApiBasket(true);
        currentBasket.productLineItems[0].quantity.value = 3;

        var result = cartHelpers.addProductToCart(currentBasket, 'someProductID', 3, [], mockOptions);
        assert.isTrue(result.error);
        assert.equal(result.message, 'someString');
    });
});
