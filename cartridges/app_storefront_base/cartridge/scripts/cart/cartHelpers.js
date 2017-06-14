'use strict';

var ProductMgr = require('dw/catalog/ProductMgr');
var Resource = require('dw/web/Resource');

var collections = require('*/cartridge/scripts/util/collections');
var ShippingHelpers = require('~/cartridge/scripts/checkout/shippingHelpers');
var productHelper = require('~/cartridge/scripts/helpers/productHelpers');
var arrayHelper = require('~/cartridge/scripts/util/array');

/**
 * @typedef ProductOption
 * @type Object
 * @property {string} id - Option ID
 * @property {string} selectedValueId - Selected option value ID
 */

/**
 * @typedef ProductOptions
 * @type Object.<string, ProductOption>
 */

/**
 * Replaces Bundle master product items with their selected variants
 *
 * @param {dw.order.ProductLineItem} apiLineItem - Cart line item containing Bundle
 * @param {string[]} childPids - List of bundle product item ID's with chosen product variant ID's
 */
function updateBundleProducts(apiLineItem, childPids) {
    var bundle = apiLineItem.product;
    var bundleProducts = bundle.getBundledProducts();
    var bundlePids = collections.map(bundleProducts, function (product) { return product.ID; });
    var selectedPids = childPids.filter(function (pid) {
        return bundlePids.indexOf(pid) === -1;
    });
    var bundleLineItems = apiLineItem.getBundledProductLineItems();

    selectedPids.forEach(function (productId) {
        var variant = ProductMgr.getProduct(productId);

        collections.forEach(bundleLineItems, function (item) {
            if (item.productID === variant.masterProduct.ID) {
                item.replaceProduct(variant);
            }
        });
    });
}

/**
 * @typedef SelectedOption
 * @type Object
 * @property {string} optionId - Option ID
 * @property {string} selectedValueId - Selected option value ID
 */

/**
 * Determines whether a product's current options are the same as those just selected
 *
 * @param {dw.util.Collection} existingOptions - Options currently associated with this product
 * @param {SelectedOption[]} selectedOptions - Product options just selected
 * @return {boolean} - Whether a product's current options are the same as those just selected
 */
function hasSameOptions(existingOptions, selectedOptions) {
    var selected = {};
    for (var i = 0, j = selectedOptions.length; i < j; i++) {
        selected[selectedOptions[i].optionId] = selectedOptions[i].selectedValueId;
    }
    return collections.every(existingOptions, function (option) {
        return option.optionValueID === selected[option.optionID];
    });
}

/**
 * Determines whether provided Bundle items are in the list of submitted bundle item IDs
 *
 * @param {dw.util.Collection<dw.order.ProductLineItem>} productLineItems - Bundle item IDs
 *     currently in the Cart
 * @param {string[]} childPids - List of product IDs for the submitted Bundle under consideration
 * @return {boolean} - Whether provided Bundle items are in the list of submitted bundle item IDs
 */
function allBundleItemsSame(productLineItems, childPids) {
    return collections.every(productLineItems, function (item) {
        return childPids.indexOf(item.productID) !== -1;
    });
}

/**
 * Adds a line item for this product to the Cart
 *
 * @param {dw.order.Basket} currentBasket -
 * @param {dw.catalog.Product} product -
 * @param {number} quantity - Quantity to add
 * @param {string[]}  childPids - the products' sub-products
 * @param {dw.catalog.ProductOptionModel} optionModel - the product's option model
 * @param {dw.order.Shipment} defaultShipment - the cart's default shipment method
 * @return {dw.order.ProductLineItem} - The added product line item
 */
function addLineItem(
    currentBasket,
    product,
    quantity,
    childPids,
    optionModel,
    defaultShipment
) {
    var productLineItem = currentBasket.createProductLineItem(
        product,
        optionModel,
        defaultShipment
    );

    if (product.bundle && childPids.length) {
        updateBundleProducts(productLineItem, childPids);
    }

    productLineItem.setQuantityValue(quantity);

    return productLineItem;
}

/**
 * Adds a product to the cart. If the product is already in the cart it increases the quantity of
 * that product.
 * @param {dw.order.Basket} currentBasket - Current users's basket
 * @param {string} productId - the productId of the product being added to the cart
 * @param {number} quantity - the number of products to the cart
 * @param {string[]} childPids - the products' sub-products
 * @param {SelectedOption[]} options - product options
 *  @return {Object} returns an error object
 */
function addProductToCart(currentBasket, productId, quantity, childPids, options) {
    var availableToSell;
    var defaultShipment = currentBasket.defaultShipment;
    var product = ProductMgr.getProduct(productId);
    var productInCart;
    var matchingProducts = [];
    var productLineItems = currentBasket.productLineItems;
    var productQuantityInCart;
    var quantityToSet;
    var optionModel = productHelper.getCurrentOptionModel(product.optionModel, options);
    var result = {
        error: false,
        message: Resource.msg('text.alert.addedtobasket', 'product', null)
    };

    for (var i = 0, j = currentBasket.productLineItems.length; i < j; i++) {
        if (productLineItems[i].productID === productId) {
            matchingProducts.push(productLineItems[i]);
        }
    }

    productInCart = arrayHelper.find(matchingProducts, function (matchingProduct) {
        return product.bundle
            ? allBundleItemsSame(matchingProduct.bundledProductLineItems, childPids)
            : hasSameOptions(matchingProduct.optionProductLineItems, options || []);
    });

    if (productInCart) {
        productQuantityInCart = productInCart.quantity.value;
        quantityToSet = quantity ? quantity + productQuantityInCart : productQuantityInCart + 1;
        availableToSell = productInCart.product.availabilityModel.inventoryRecord.ATS.value;

        if (availableToSell >= quantityToSet) {
            productInCart.setQuantityValue(quantityToSet);
        } else {
            result.error = true;
            result.message = availableToSell === productQuantityInCart
                ? Resource.msg('error.alert.max.quantity.in.cart', 'product', null)
                : Resource.msg('error.alert.selected.quantity.cannot.be.added', 'product', null);
        }
    } else {
        addLineItem(
            currentBasket,
            product,
            quantity,
            childPids,
            optionModel,
            defaultShipment
        );
    }

    return result;
}

/**
 * Loops through all Shipments and attempts to select a ShippingMethod, where absent
 * @param {dw.order.Basket} basket - the target Basket object
 */
function ensureAllShipmentsHaveMethods(basket) {
    var shipments = basket.shipments;

    collections.forEach(shipments, function (shipment) {
        ShippingHelpers.ensureShipmentHasMethod(shipment);
    });
}

module.exports = {
    addProductToCart: addProductToCart,
    ensureAllShipmentsHaveMethods: ensureAllShipmentsHaveMethods
};
