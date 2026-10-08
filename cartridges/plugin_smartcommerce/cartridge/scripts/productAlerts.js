'use strict';

/**
 * Back-in-stock and price-drop subscriptions. The custom object key is
 * type|productID|email, so one shopper has at most one subscription per alert
 * type and SKU. Status: pending, sent, expired or failed.
 * @module scripts/productAlerts
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Site = require('dw/system/Site');
var priceHistory = require('*/cartridge/scripts/priceHistory');

var TYPE = 'SmartProductAlert';
var TYPES = ['stock', 'price'];
var DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {string} type - stock or price
 * @param {dw.catalog.Product} product - Product the shopper chose
 * @returns {string|null} smartcommerce resource key of the reason it cannot be subscribed
 */
function rejection(type, product) {
    if (TYPES.indexOf(type) < 0 || !product || !product.online) {
        return 'error.alert.product';
    }
    if (product.master || product.variationGroup || product.productSet) {
        return 'error.alert.variant';
    }
    if (type === 'stock' && product.availabilityModel.isOrderable()) {
        return 'error.alert.instock';
    }
    if (type === 'price' && !priceHistory.currentPrice(product)) {
        return 'error.alert.noprice';
    }
    return null;
}

/**
 * Re-subscribing to a pending alert changes nothing; a sent, expired or failed
 * one starts again with a fresh reference price and expiry.
 * @param {string} type - stock or price
 * @param {dw.catalog.Product} product - Orderable-level product (variant or simple)
 * @param {string} email - Validated, lower-case email
 * @returns {Object} { error: resource key } or { already: boolean }
 */
function subscribe(type, product, email) {
    var error = rejection(type, product);
    if (error) {
        return { error: error };
    }
    var key = type + '|' + product.ID + '|' + email;
    var existing = CustomObjectMgr.getCustomObject(TYPE, key);
    if (existing && existing.custom.status === 'pending') {
        return { already: true };
    }
    var price = priceHistory.currentPrice(product);
    var days = Site.current.getCustomPreferenceValue('smartAlertExpiryDays') || 30;
    Transaction.wrap(function () {
        var alert = existing || CustomObjectMgr.createCustomObject(TYPE, key);
        alert.custom.alertType = type;
        alert.custom.productID = product.ID;
        alert.custom.email = email;
        alert.custom.referencePrice = price ? price.value : null;
        alert.custom.currencyCode = price ? price.currencyCode : null;
        alert.custom.status = 'pending';
        alert.custom.expiresAt = new Date(Date.now() + (days * DAY_MS));
        alert.custom.notifiedAt = null;
    });
    return { already: false };
}

/**
 * @param {dw.object.CustomObject} alert - Pending alert
 * @param {dw.catalog.Product} product - Its online product
 * @returns {boolean} Whether the shopper should be notified now
 */
function isTriggered(alert, product) {
    if (alert.custom.alertType === 'stock') {
        return product.availabilityModel.isOrderable();
    }
    var price = priceHistory.currentPrice(product);
    return !!(price && price.currencyCode === alert.custom.currencyCode && price.value < alert.custom.referencePrice);
}

/**
 * @param {dw.object.CustomObject} alert - Alert
 * @param {string} status - New status
 */
function setStatus(alert, status) {
    Transaction.wrap(function () {
        alert.custom.status = status; // eslint-disable-line no-param-reassign
        if (status === 'sent') {
            alert.custom.notifiedAt = new Date(); // eslint-disable-line no-param-reassign
        }
    });
}

module.exports = {
    TYPE: TYPE,
    subscribe: subscribe,
    isTriggered: isTriggered,
    setStatus: setStatus
};
