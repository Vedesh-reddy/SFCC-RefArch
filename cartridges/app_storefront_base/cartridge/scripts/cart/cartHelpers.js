'use strict';

var ProductMgr = require('dw/catalog/ProductMgr');
var Resource = require('dw/web/Resource');

var Collections = require('~/cartridge/scripts/util/collections');
var ShippingHelpers = require('~/cartridge/scripts/checkout/shippingHelpers');


/**
 * Replaces Bundle master product items with their selected variants
 *
 * @param {dw.order.ProductLineItem} apiLineItem - Cart line item containing Bundle
 * @param {string[]} childPids - List of bundle product item ID's with chosen product variant ID's
 */
function updateBundleProducts(apiLineItem, childPids) {
    var bundle = apiLineItem.product;
    var bundleProducts = bundle.getBundledProducts();
    var bundlePids = Collections.map(bundleProducts, function (product) { return product.ID; });
    var selectedPids = childPids.filter(function (pid) {
        return bundlePids.indexOf(pid) === -1;
    });
    var bundleLineItems = apiLineItem.getBundledProductLineItems();

    selectedPids.forEach(function (productId) {
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
 *  @return {Object} returns an error object
 */
function addProductToCart(currentBasket, productId, quantity, childPids) {
    var availableToSell;
    var defaultShipment = currentBasket.defaultShipment;
    var product = ProductMgr.getProduct(productId);
    var productInCart;
    var productLineItem;
    var productLineItems = currentBasket.productLineItems;
    var productQuantityInCart;
    var quantityToSet;
    var optionModel = product.optionModel;
    var result = {
        error: false,
        message: Resource.msg('text.alert.addedtobasket', 'product', null)
    };

    for (var i = 0; i < currentBasket.productLineItems.length; i++) {
        if (productLineItems[i].productID === productId) {
            productInCart = productLineItems[i];
            break;
        }
    }

    if (productInCart) {
        productQuantityInCart = productInCart.quantity.value;
        quantityToSet = quantity ? quantity + productQuantityInCart : productQuantityInCart + 1;
        availableToSell = productInCart.product.availabilityModel.inventoryRecord.ATS.value;

        if (availableToSell >= quantityToSet) {
            productInCart.setQuantityValue(quantityToSet);
        } else {
            if (availableToSell === productQuantityInCart) {
                result.message = Resource.msg('error.alert.max.quantity.in.cart', 'product', null);
            } else {
                result.message = Resource.msg(
                    'error.alert.selected.quantity.cannot.be.added',
                    'product',
                    null
                );
            }

            result.error = true;
        }
    } else {
        productLineItem = currentBasket.createProductLineItem(
            product,
            optionModel,
            defaultShipment
        );

        if (product.bundle && childPids.length) {
            updateBundleProducts(productLineItem, childPids);
        }

        productLineItem.setQuantityValue(quantity);
    }

    return result;
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
