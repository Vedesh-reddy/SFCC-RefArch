'use strict';

var ProductMgr = require('dw/catalog/ProductMgr');

var Collections = require('~/cartridge/scripts/util/collections');
var ShippingHelpers = require('~/cartridge/scripts/checkout/shippingHelpers');


/**
 * Replaces Bundle master product items with their selected variants
 * @param {dw.order.ProductLineItem} apiLineItem - Cart line item
 * @param {dw.catalog.Product} apiProduct - Bundle product
 * @param {string[]} childPids - List of bundle product item ID's with chosen product variant ID's
 */
function processBundle(apiLineItem, apiProduct, childPids) {
    var bundleProducts = apiProduct.getBundledProducts();
    var bundlePids = Collections.map(bundleProducts, function (product) { return product.ID; });
    var selectedPids = childPids.filter(function (pid) {
        return bundlePids.indexOf(pid) === -1;
    });

    selectedPids.forEach(function (productId) {
        var bundleLineItems = apiLineItem.getBundledProductLineItems();
        var variant = ProductMgr.getProduct(productId);

        Collections.forEach(bundleLineItems, function (item) {
            if (item.productID === variant.masterProduct.ID) {
                item.replaceProduct(variant);
            }
        });
    });
}

/**
 * Adds a product to the cart. If the product is already in the cart it increases the quantity of
 * that product.
 * @param {dw.order.Basket} currentBasket - Current users's basket
 * @param {string} productId - the productId of the product being added to the cart
 * @param {number} quantity - the number of products to the cart
 * @param {string[]} childPids - the number of products to the cart
 */
function addProductToCart(currentBasket, productId, quantity, childPids) {
    var defaultShipment = currentBasket.defaultShipment;
    var product = ProductMgr.getProduct(productId);
    var productInCart;
    var productLineItems = currentBasket.productLineItems;
    var productQuantityInCart;
    var quantityToSet;
    var productLineItem;
    var optionModel = product.optionModel;

    for (var i = 0; i < currentBasket.productLineItems.length; i++) {
        if (productLineItems[i].productID === productId) {
            productInCart = productLineItems[i];
            break;
        }
    }

    if (productInCart) {
        productQuantityInCart = productInCart.quantity;
        quantityToSet = quantity ? quantity + productQuantityInCart : productQuantityInCart + 1;
        productInCart.setQuantityValue(quantityToSet);
    } else {
        productLineItem = currentBasket.createProductLineItem(
            product,
            optionModel,
            defaultShipment
        );

        if (product.bundle && childPids.length) {
            processBundle(productLineItem, product, childPids);
        }

        productLineItem.setQuantityValue(quantity);
    }
}

/**
 * Loops through all Shipments and attempts to select a ShippingMethod, where absent
 * @param {dw.order.Basket} basket - the target Basket object
 */
function ensureAllShipmentsHaveMethods(basket) {
    var shipments = basket.shipments;

    Collections.forEach(shipments, function (shipment) {
        ShippingHelpers.ensureShipmentHasMethod(shipment);
    });
}

module.exports = {
    addProductToCart: addProductToCart,
    ensureAllShipmentsHaveMethods: ensureAllShipmentsHaveMethods
};
