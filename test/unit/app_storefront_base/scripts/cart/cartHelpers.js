'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var sinon = require('sinon');

var ArrayList = require('../../../../mocks/dw.util.Collection.js');

var mockOptions = [{
    optionId: 'option 1',
    selectedValueId: '123'
}];

var availabilityModelMock = {
    inventoryRecord: {
        ATS: {
            value: 3
        }
    }
};

var productLineItemMock = {
    productID: 'someProductID',
    quantity: {
        value: 1
    },
    setQuantityValue: function () {
        return;
    },
    quantityValue: 1,
    product: {
        availabilityModel: availabilityModelMock
    },
    optionProductLineItems: new ArrayList(mockOptions),
    bundledProductLineItems: new ArrayList([])
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
        currentBasket.productLineItems = new ArrayList([productLineItemMock]);
    } else {
        currentBasket.productLineItems = new ArrayList([]);
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
                    },
                    availabilityModel: availabilityModelMock
                };
            }
        },
        '*/cartridge/scripts/util/collections': proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/util/collections', {
            'dw/util/ArrayList': ArrayList
        }),
        '*/cartridge/scripts/checkout/shippingHelpers': {},
        'dw/system/Transaction': {
            wrap: function (item) {
                item();
            }
        },
        '*/cartridge/scripts/util/array': { find: findStub },
        'dw/web/Resource': {
            msg: function () {
                return 'someString';
            },
            msgf: function () {
                return 'someString';
            }
        },
        '*/cartridge/scripts/helpers/productHelpers': {
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
        var spy = sinon.spy(currentBasket.productLineItems.toArray()[0], 'setQuantityValue');
        spy.withArgs(1);

        cartHelpers.addProductToCart(currentBasket, 'someProductID', 1, [], mockOptions);
        assert.isTrue(spy.calledOnce);
        currentBasket.productLineItems.toArray()[0].setQuantityValue.restore();
    });

    it('should not add a product to the cart', function () {
        var currentBasket = createApiBasket(true);

        var result = cartHelpers.addProductToCart(currentBasket, 'someProductID', 4, [], mockOptions);
        assert.isTrue(result.error);
        assert.equal(result.message, 'someString');
    });

    it('should not add a product to the cart when ATS is already in cart', function () {
        var currentBasket = createApiBasket(true);
        currentBasket.productLineItems.toArray()[0].quantity.value = 3;

        var result = cartHelpers.addProductToCart(currentBasket, 'someProductID', 3, [], mockOptions);
        assert.isTrue(result.error);
        assert.equal(result.message, 'someString');
    });

    describe('getQtyAlreadyInCart() function', function () {
        var productId1 = 'product1';

        it('should provide the quantities of a product already in the Cart', function () {
            var lineItems = new ArrayList([{
                bundledProductLineItems: [],
                productID: productId1,
                quantityValue: 3
            }]);
            var qtyAlreadyInCart = cartHelpers.getQtyAlreadyInCart(productId1, lineItems);
            assert.equal(3, qtyAlreadyInCart);
        });

        it('should provide the quantities of a product inside a bundle already in the Cart',
            function () {
                var lineItems = new ArrayList([{
                    bundledProductLineItems: new ArrayList([{
                        productID: productId1,
                        quantityValue: 4
                    }])
                }]);
                var qtyAlreadyInCart = cartHelpers.getQtyAlreadyInCart(productId1, lineItems);
                assert.equal(4, qtyAlreadyInCart);
            });

        it('should not include the quantity a product matching the uuid', function () {
            var uuid = 'abc';
            var lineItems = new ArrayList([{
                bundledProductLineItems: [],
                productID: productId1,
                quantityValue: 5,
                UUID: uuid
            }]);
            var qtyAlreadyInCart = cartHelpers.getQtyAlreadyInCart(productId1, lineItems, uuid);
            assert.equal(0, qtyAlreadyInCart);
        });

        it('should not include the quantity a product inside a bundle matching the uuid',
            function () {
                var uuid = 'abc';
                var lineItems = new ArrayList([{
                    bundledProductLineItems: new ArrayList([{
                        productID: productId1,
                        quantityValue: 4,
                        UUID: uuid
                    }])
                }]);
                var qtyAlreadyInCart = cartHelpers.getQtyAlreadyInCart(productId1, lineItems, uuid);
                assert.equal(0, qtyAlreadyInCart);
            });
    });
});
