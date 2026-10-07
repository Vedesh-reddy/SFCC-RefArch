'use strict';

/**
 * Wishlist storage on the native customer wish list (dw.customer.ProductList),
 * extended with the price captured when each item was added.
 * @module scripts/customWishlist
 */

var ProductListMgr = require('dw/customer/ProductListMgr');
var ProductList = require('dw/customer/ProductList');
var ProductMgr = require('dw/catalog/ProductMgr');
var Transaction = require('dw/system/Transaction');
var Money = require('dw/value/Money');
var URLUtils = require('dw/web/URLUtils');

/**
 * @param {dw.customer.Customer} customer - Registered customer
 * @param {boolean} create - Create the list when missing (caller owns the transaction)
 * @returns {dw.customer.ProductList|null} The customer's wish list
 */
function getList(customer, create) {
    var lists = ProductListMgr.getProductLists(customer, ProductList.TYPE_WISH_LIST);
    if (lists.length) {
        return lists[0];
    }
    return create ? ProductListMgr.createProductList(customer, ProductList.TYPE_WISH_LIST) : null;
}

/**
 * Price from the applicable price books, ignoring promotions. Masters are rarely
 * priced themselves, so they fall back to their lowest variant price, as the PDP shows.
 * @param {dw.catalog.Product} product - Product
 * @returns {dw.value.Money|null} Current price, null when no price book prices the product
 */
function currentPrice(product) {
    var model = product.priceModel;
    var price = model.price.available || !product.master ? model.price : model.minPrice;
    return price && price.available ? price : null;
}

/**
 * @param {dw.customer.ProductListItem} item - Wishlist item
 * @returns {number|null} Price the next drop is measured against
 */
function baseline(item) {
    return item.custom.wishlistLastNotifiedPrice || item.custom.wishlistAddedPrice || null;
}

/**
 * @param {number} value - Amount
 * @param {string} currency - ISO currency code
 * @returns {string} Localized amount
 */
function format(value, currency) {
    return new Money(value, currency).toFormattedString();
}

/**
 * @param {dw.customer.ProductListItem} item - Wishlist item with an online product
 * @returns {Object} View model shared by the page, popup and email
 */
function toViewModel(item) {
    var product = item.product;
    var currency = item.custom.wishlistPriceCurrency;
    var price = currentPrice(product);
    var added = item.custom.wishlistAddedPrice;
    var sameCurrency = price && price.currencyCode === currency;
    var image = product.getImage('small', 0);
    return {
        id: item.ID,
        pid: product.ID,
        name: product.name,
        url: URLUtils.https('Product-Show', 'pid', product.ID).toString(),
        image: image ? { url: image.absURL.toString(), alt: image.alt || product.name } : null,
        addedPrice: added && currency ? format(added, currency) : null,
        currentPrice: price ? price.toFormattedString() : null,
        dropped: !!(sameCurrency && added && price.value < added)
    };
}

/**
 * @param {dw.customer.ProductList} list - Wish list
 * @returns {Array<dw.customer.ProductListItem>} Items whose product is still online
 */
function onlineItems(list) {
    return list.productItems.toArray().filter(function (item) {
        return item.product && item.product.online;
    });
}

/**
 * @param {string} pid - Product ID from the request
 * @returns {dw.catalog.Product|null} Online product
 */
function getProduct(pid) {
    var product = pid ? ProductMgr.getProduct(String(pid)) : null;
    return product && product.online ? product : null;
}

/**
 * Adds a product once; re-adding keeps the original price so earlier drops stay visible.
 * @param {dw.customer.Customer} customer - Registered customer
 * @param {dw.catalog.Product} product - Online product
 */
function addProduct(customer, product) {
    var price = currentPrice(product);
    Transaction.wrap(function () {
        var list = getList(customer, true);
        var exists = list.productItems.toArray().some(function (item) {
            return item.productID === product.ID;
        });
        if (!exists) {
            var item = list.createProductItem(product);
            item.custom.wishlistAddedPrice = price ? price.value : null;
            item.custom.wishlistPriceCurrency = price ? price.currencyCode : null;
        }
    });
}

/**
 * Looks the item up inside the customer's own list, so foreign item IDs are ignored.
 * @param {dw.customer.Customer} customer - Registered customer
 * @param {string} itemID - Wishlist item ID from the request
 */
function removeItem(customer, itemID) {
    var list = getList(customer, false);
    var item = list && itemID ? list.getItem(String(itemID)) : null;
    if (item) {
        Transaction.wrap(function () {
            list.removeItem(item);
        });
    }
}

/**
 * @param {dw.customer.Customer} customer - Registered customer
 * @returns {Array<Object>} Wishlist view models
 */
function getItems(customer) {
    var list = getList(customer, false);
    return list ? onlineItems(list).map(toViewModel) : [];
}

/**
 * Returns price drops flagged by the job and clears the flag so the popup shows once.
 * @param {dw.customer.Customer} customer - Registered customer
 * @returns {Array<Object>} Wishlist view models for dropped items
 */
function takePendingAlerts(customer) {
    var list = getList(customer, false);
    if (!list) {
        return [];
    }
    var pending = onlineItems(list).filter(function (item) {
        return item.custom.wishlistPriceAlertPending;
    });
    if (pending.length) {
        Transaction.wrap(function () {
            pending.forEach(function (item) {
                item.custom.wishlistPriceAlertPending = false; // eslint-disable-line no-param-reassign
            });
        });
    }
    return pending.map(toViewModel);
}

/**
 * Flags an item when its price fell below the added price or the last notified
 * price, so each lower price is reported once. Caller owns the transaction.
 * @param {dw.customer.ProductListItem} item - Wishlist item with an online product
 * @returns {boolean} Whether a new drop was flagged
 */
function flagPriceDrop(item) {
    var price = currentPrice(item.product);
    var reference = baseline(item);
    if (!price || !reference || price.currencyCode !== item.custom.wishlistPriceCurrency || price.value >= reference) {
        return false;
    }
    item.custom.wishlistLastNotifiedPrice = price.value; // eslint-disable-line no-param-reassign
    item.custom.wishlistPriceAlertPending = true; // eslint-disable-line no-param-reassign
    return true;
}

module.exports = {
    getProduct: getProduct,
    addProduct: addProduct,
    removeItem: removeItem,
    getItems: getItems,
    takePendingAlerts: takePendingAlerts,
    onlineItems: onlineItems,
    flagPriceDrop: flagPriceDrop,
    toViewModel: toViewModel
};
