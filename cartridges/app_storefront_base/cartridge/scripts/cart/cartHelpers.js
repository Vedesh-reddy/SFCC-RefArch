'use strict';

var ProductMgr = require('dw/catalog/ProductMgr');
var Resource = require('dw/web/Resource');

var collections = require('*/cartridge/scripts/util/collections');
var ShippingHelpers = require('*/cartridge/scripts/checkout/shippingHelpers');
var productHelper = require('*/cartridge/scripts/helpers/productHelpers');
var arrayHelper = require('*/cartridge/scripts/util/array');

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
 * @param {string[]} childProducts - List of bundle product item ID's with chosen product variant
 *     ID's
 */
function updateBundleProducts(apiLineItem, childProducts) {
    var bundle = apiLineItem.product;
    var bundleProducts = bundle.getBundledProducts();
    var bundlePids = collections.map(bundleProducts, function (product) { return product.ID; });
    var selectedProducts = childProducts.filter(function (product) {
        return bundlePids.indexOf(product.pid) === -1;
    });
    var bundleLineItems = apiLineItem.getBundledProductLineItems();

    selectedProducts.forEach(function (product) {
        var variant = ProductMgr.getProduct(product.pid);

        collections.forEach(bundleLineItems, function (item) {
            if (item.productID === variant.masterProduct.ID) {
                item.replaceProduct(variant);
            }
        });
    });
}


/**
 * @typedef urlObject
 * @type Object
 * @property {string} url - Option ID
 * @property {string} configureProductsUrl - url that will be used to get selected bonus products
 * @property {string} adToCartUrl - url to use to add products to the cart
 */

/**
 * Gets the newly added bonus discount line item
 * @param {dw.order.Basket} currentBasket -
 * @param {dw.util.Collection} previousBonusDiscountLineItems - contains BonusDiscountLineItems
 *                                                              already processed
 * @param {Object} urlObject - Object with data to be used in the choice of bonus products modal
 * @param {string} uuid - BonusDiscountLineItem's uuid to use to attach bonus products
 * @return {Object} - either the object that represents data needed for the choice of
 *                    bonus products modal window or undefined
 */
function getNewBonusDiscountLineItem(
    currentBasket,
    previousBonusDiscountLineItems,
    urlObject,
    uuid) {
    var newBonusDiscountLineItems = currentBasket.getBonusDiscountLineItems();
    var newBonusDiscountLineItem;
    var result = {};

    newBonusDiscountLineItem = collections.find(newBonusDiscountLineItems, function (item) {
        return !previousBonusDiscountLineItems.contains(item);
    });
    if (newBonusDiscountLineItem) {
        result.bonuspids = [];
        var iterBonusProducts = newBonusDiscountLineItem.bonusProducts.iterator();
        while (iterBonusProducts.hasNext()) {
            var newBProduct = iterBonusProducts.next();
            result.bonuspids.push(newBProduct.ID);
        }

        result.uuid = uuid;
        result.maxBonusItems = newBonusDiscountLineItem.maxBonusItems;
        result.addToCartUrl = urlObject.addToCartUrl;
        result.configureProductstUrl = urlObject.configureProductstUrl;
        result.url = urlObject.url + '?pids=' + result.bonuspids.toString();
        result.newBonusDiscountLineItem = newBonusDiscountLineItem; // todo see if we need this

        result.labels = {};
        result.labels.selectbonus =
            Resource.msg('label.choiceofbonus.selectbonus', 'product', null);
        result.labels.close =
            Resource.msg('link.choiceofbonus.close', 'product', null);
        result.labels.selectattrs =
            Resource.msg('label.choiceofbonus.selectattrs', 'product', null);
        result.labels.selectprods =
            Resource.msgf('label.choiceofbonus.selectproducts',
                'product',
                null,
                newBonusDiscountLineItem.maxBonusItems);
    }

    return newBonusDiscountLineItem ? result : undefined;
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
 * @param {string[]} childProducts - List of bundle items for the submitted Bundle under
 *     consideration
 * @return {boolean} - Whether provided Bundle items are in the list of submitted bundle item IDs
 */
function allBundleItemsSame(productLineItems, childProducts) {
    return collections.every(productLineItems, function (item) {
        return arrayHelper.find(childProducts, function (childProduct) {
            return item.productID === childProduct.pid;
        });
    });
}

/**
 * Adds a line item for this product to the Cart
 *
 * @param {dw.order.Basket} currentBasket -
 * @param {dw.catalog.Product} product -
 * @param {number} quantity - Quantity to add
 * @param {string[]}  childProducts - the products' sub-products
 * @param {dw.catalog.ProductOptionModel} optionModel - the product's option model
 * @param {dw.order.Shipment} defaultShipment - the cart's default shipment method
 * @return {dw.order.ProductLineItem} - The added product line item
 */
function addLineItem(
    currentBasket,
    product,
    quantity,
    childProducts,
    optionModel,
    defaultShipment
) {
    var productLineItem = currentBasket.createProductLineItem(
        product,
        optionModel,
        defaultShipment
    );

    if (product.bundle && childProducts.length) {
        updateBundleProducts(productLineItem, childProducts);
    }

    productLineItem.setQuantityValue(quantity);

    return productLineItem;
}

/**
 * Sets a flag to exclude the quantity for a product line item matching the provided UUID.  When
 * updating a quantity for an already existing line item, we want to exclude the line item's
 * quantity and use the updated quantity instead.
 * @param {string} selectedUuid - Line item UUID to exclude
 * @param {string} itemUuid - Line item in-process to consider for exclusion
 * @return {boolean} - Whether to include the line item's quantity
 */
function excludeUuid(selectedUuid, itemUuid) {
    return selectedUuid
        ? itemUuid !== selectedUuid
        : true;
}

/**
 * Calculate the quantities for any existing instance of a product, either as a single line item
 * with the same or different options, as well as inclusion in product bundles.  Providing an
 * optional "uuid" parameter, typically when updating the quantity in the Cart, will exclude the
 * quantity for the matching line item, as the updated quantity will be used instead.  "uuid" is not
 * used when adding a product to the Cart.
 *
 * @param {string} productId - ID of product to be added or updated
 * @param {dw.util.Collection<dw.order.ProductLineItem>} lineItems - Cart product line items
 * @param {string} [uuid] - When provided, excludes the quantity for the matching line item
 * @return {number} - Total quantity of all instances of requested product in the Cart and being
 *     requested
 */
function getQtyAlreadyInCart(productId, lineItems, uuid) {
    var qtyAlreadyInCart = 0;

    collections.forEach(lineItems, function (item) {
        if (item.bundledProductLineItems.length) {
            collections.forEach(item.bundledProductLineItems, function (bundleItem) {
                if (bundleItem.productID === productId && excludeUuid(uuid, bundleItem.UUID)) {
                    qtyAlreadyInCart += bundleItem.quantityValue;
                }
            });
        } else if (item.productID === productId && excludeUuid(uuid, item.UUID)) {
            qtyAlreadyInCart += item.quantityValue;
        }
    });
    return qtyAlreadyInCart;
}

/**
 * Find all line items that contain the product specified.  A product can appear in different line
 * items that have different option selections or in product bundles.
 *
 * @param {string} productId - Product ID to match
 * @param {dw.util.Collection<dw.order.ProductLineItem>} productLineItems - Collection of the Cart's
 *     product line items
 * @return {Object} properties includes,
 *                  matchingProducts - collection of matching products
 *                  uuid - string value for the last product line item
 * @return {dw.order.ProductLineItem[]} - Filtered list of product line items matching productId
 */
function getMatchingProducts(productId, productLineItems) {
    var matchingProducts = [];
    var uuid;
    collections.forEach(productLineItems, function (item) {
        if (item.productID === productId) {
            matchingProducts.push(item);
            uuid = item.UUID;
        }
    });
    return {
        matchingProducts: matchingProducts,
        uuid: uuid
    };
}

/**
 * Adds a product to the cart. If the product is already in the cart it increases the quantity of
 * that product.
 * @param {dw.order.Basket} currentBasket - Current users's basket
 * @param {string} productId - the productId of the product being added to the cart
 * @param {number} quantity - the number of products to the cart
 * @param {string[]} childProducts - the products' sub-products
 * @param {SelectedOption[]} options - product options
 *  @return {Object} returns an error object
 */
function addProductToCart(currentBasket, productId, quantity, childProducts, options) {
    var availableToSell;
    var defaultShipment = currentBasket.defaultShipment;
    var product = ProductMgr.getProduct(productId);
    var productInCart;
    var productLineItems = currentBasket.productLineItems;
    var productQuantityInCart;
    var quantityToSet;
    var optionModel = productHelper.getCurrentOptionModel(product.optionModel, options);
    var result = {
        error: false,
        message: Resource.msg('text.alert.addedtobasket', 'product', null)
    };

    var totalQtyRequested = 0;
    var canBeAdded = false;

    if (product.bundle) {
        var atsValueByChildPid = {};
        childProducts.forEach(function (childProduct) {
            var apiChildProduct = ProductMgr.getProduct(childProduct.pid);
            atsValueByChildPid[childProduct.pid] =
                apiChildProduct.availabilityModel.inventoryRecord.ATS.value;
        });

        canBeAdded = childProducts.every(function (childProduct) {
            var bundleQuantity = quantity;
            var itemQuantity = bundleQuantity * childProduct.quantity;
            var childPid = childProduct.pid;
            totalQtyRequested = itemQuantity + getQtyAlreadyInCart(childPid, productLineItems);
            return totalQtyRequested <= atsValueByChildPid[childPid];
        });
    } else {
        totalQtyRequested = quantity + getQtyAlreadyInCart(productId, productLineItems);
        canBeAdded = totalQtyRequested <= product.availabilityModel.inventoryRecord.ATS.value;
    }

    if (!canBeAdded) {
        result.error = true;
        result.message = Resource.msgf(
            'error.alert.selected.quantity.cannot.be.added.for',
            'product',
            null,
            product.name
        );
        return result;
    }

    var matchingProductsObj = getMatchingProducts(productId, productLineItems);
    var matchingProducts = matchingProductsObj.matchingProducts;
    productInCart = arrayHelper.find(matchingProducts, function (matchingProduct) {
        return product.bundle
            ? allBundleItemsSame(matchingProduct.bundledProductLineItems, childProducts)
            : hasSameOptions(matchingProduct.optionProductLineItems, options || []);
    });

    if (productInCart) {
        productQuantityInCart = productInCart.quantity.value;
        quantityToSet = quantity ? quantity + productQuantityInCart : productQuantityInCart + 1;
        availableToSell = productInCart.product.availabilityModel.inventoryRecord.ATS.value;

        if (availableToSell >= quantityToSet) {
            productInCart.setQuantityValue(quantityToSet);
            result.uuid = productInCart.UUID;
        } else {
            result.error = true;
            result.message = availableToSell === productQuantityInCart
                ? Resource.msg('error.alert.max.quantity.in.cart', 'product', null)
                : Resource.msg('error.alert.selected.quantity.cannot.be.added', 'product', null);
        }
    } else {
        var productLineItem;
        productLineItem = addLineItem(
            currentBasket,
            product,
            quantity,
            childProducts,
            optionModel,
            defaultShipment
        );

        result.uuid = productLineItem.UUID;
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
    ensureAllShipmentsHaveMethods: ensureAllShipmentsHaveMethods,
    getQtyAlreadyInCart: getQtyAlreadyInCart,
    getNewBonusDiscountLineItem: getNewBonusDiscountLineItem
};
