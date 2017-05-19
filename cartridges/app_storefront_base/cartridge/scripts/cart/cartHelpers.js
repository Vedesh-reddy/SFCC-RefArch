'use strict';

var ProductMgr = require('dw/catalog/ProductMgr');
var Resource = require('dw/web/Resource');

var Collections = require('~/cartridge/scripts/util/collections');
var ShippingHelpers = require('~/cartridge/scripts/checkout/shippingHelpers');

/**
 * Set the selected value on a product option
 *
 * @param {dw.catalog.ProductOptionModel} optionModel - A product's option model
 * @param {string} optionId - A product option for the product being updated
 * @param {string} selectedValueId - Selected option value ID
 * @return {boolean} - Standard return value
 */
function setSelectedOptionValue(optionModel, optionId, selectedValueId) {
    var apiOption = optionModel.getOption(optionId);
    var apiOptionValue = optionModel.getOptionValue(apiOption, selectedValueId);
    optionModel.setSelectedOptionValue(apiOption, apiOptionValue);
    return true;
}

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
 * @param {ProductOptions} options - Selected product options dictionary
 */
function updateBundleProducts(apiLineItem, childPids, options) {
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
                if (Object.keys(options).indexOf(variant.ID) !== -1) {
                    options[variant.ID].forEach(function (option) {
                        setSelectedOptionValue(variant.optionModel, option.optionId,
                            option.selectedValueId);
                    });
                }
                item.replaceProduct(variant);
            }
        });
    });
}

/**
 * @typedef Option
 * @type Object
 * @property {string} id - Option ID
 * @property {string} selectedValueId - Selected option value ID
 */

/**
 * Adds a product to the cart. If the product is already in the cart it increases the quantity of
 * that product.
 * @param {dw.order.Basket} currentBasket - Current users's basket
 * @param {string} productId - the productId of the product being added to the cart
 * @param {number} quantity - the number of products to the cart
 * @param {string[]} childPids - the number of products to the cart
 * @param {Option[]} options - product options
 *  @return {Object} returns an error object
 */
function addProductToCart(currentBasket, productId, quantity, childPids, options) {
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

    // Set selected option values for non-bundle/set products
    var optionKeys = Object.keys(options);
    if (optionKeys.indexOf(productId) !== -1) {
        options[productId].forEach(function (option) {
            setSelectedOptionValue(optionModel, option.id, option.selectedValueId);
        });
    }

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
            updateBundleProducts(productLineItem, childPids, options);
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
