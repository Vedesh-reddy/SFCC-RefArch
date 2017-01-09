'use strict';

var ProductMgr = require('dw/catalog/ProductMgr');
var Transaction = require('dw/system/Transaction');

/**
 * Adds a product to the cart. If the product is already in the cart it increases the quantity of
 * that product.
 * @param {dw.order.Basket} currentBasket - Current users's basket
 * @param {string} productId - the productId of the product being added to the cart
 * @param {number} quantity - the number of products to the cart
 */
function addProductToCart(currentBasket, productId, quantity) {
    var defaultShipment = currentBasket.defaultShipment;
    var product = ProductMgr.getProduct(productId);
    var productInCart;
    var productLineItems = currentBasket.productLineItems;
    var productQuantityInCart;
    var quantityToSet;

    var optionModel = product.optionModel;

    for (var i = 0; i < currentBasket.productLineItems.length; i++) {
        if (productLineItems[i].productID === productId) {
            productInCart = productLineItems[i];
            break;
        }
    }

    Transaction.wrap(function () {
        if (productInCart) {
            productQuantityInCart = productInCart.quantity;
            quantityToSet = quantity ? quantity + productQuantityInCart : productQuantityInCart + 1;
            productInCart.setQuantityValue(quantityToSet);
        } else {
            var productLineItem = currentBasket.createProductLineItem(
                product,
                optionModel,
                defaultShipment
            );

            productLineItem.setQuantityValue(quantity);
        }
    });
}

module.exports = {
    addProductToCart: addProductToCart
};
