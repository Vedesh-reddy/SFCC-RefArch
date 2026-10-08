'use strict';

/**
 * Price lock: a registered shopper locks today's price of a SKU for a configured
 * number of hours. Members of the configured customer groups lock for free; others
 * buy the configured lock-fee product through normal checkout, so any payment
 * integration on the site takes the fee, and the lock activates when that order is placed.
 *
 * While active, the lock is applied in basket calculation as a custom price adjustment
 * worth the difference to the current price. Status: pending, active, used or expired.
 * @module scripts/priceLock
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var ProductMgr = require('dw/catalog/ProductMgr');
var BasketMgr = require('dw/order/BasketMgr');
var UUIDUtils = require('dw/util/UUIDUtils');
var Money = require('dw/value/Money');
var Site = require('dw/system/Site');
var Resource = require('dw/web/Resource');
var priceHistory = require('*/cartridge/scripts/priceHistory');

var TYPE = 'SmartPriceLock';
var ADJUSTMENT_ID = 'smart-price-lock';
var HOUR_MS = 60 * 60 * 1000;

/**
 * @param {string} name - Site preference ID
 * @returns {Array<string>} Comma-separated preference as a list
 */
function listPreference(name) {
    return String(Site.current.getCustomPreferenceValue(name) || '').split(',').map(function (value) {
        return value.trim();
    }).filter(Boolean);
}

/**
 * @returns {number} Lock duration in hours
 */
function lockHours() {
    return Site.current.getCustomPreferenceValue('smartPriceLockHours') || 24;
}

/**
 * @param {dw.customer.Customer} customer - Registered customer
 * @returns {boolean} Whether the customer locks without paying the fee
 */
function locksFree(customer) {
    return listPreference('smartPriceLockFreeGroups').some(function (groupID) {
        return customer.isMemberOfCustomerGroup(groupID);
    });
}

/**
 * @param {string} customerNo - Customer number
 * @param {string} pid - Product ID
 * @param {string} status - Lock status
 * @returns {dw.object.CustomObject|null} Unexpired lock in that status
 */
function findLock(customerNo, pid, status) {
    var lock = CustomObjectMgr.queryCustomObject(TYPE,
        'custom.customerNo = {0} AND custom.productID = {1} AND custom.status = {2} AND custom.expiresAt > {3}',
        customerNo, pid, status, new Date());
    return lock || null;
}

/**
 * @param {dw.customer.Customer} customer - Session customer
 * @param {dw.catalog.Product} product - Product on the page
 * @returns {Object} View model for the product page
 */
function viewFor(customer, product) {
    var registered = !!(customer && customer.authenticated && customer.registered);
    var customerNo = registered ? customer.profile.customerNo : null;
    var lock = registered ? findLock(customerNo, product.ID, 'active') || findLock(customerNo, product.ID, 'pending') : null;
    return {
        registered: registered,
        hours: lockHours(),
        free: registered && locksFree(customer),
        lock: lock ? {
            status: lock.custom.status,
            price: new Money(lock.custom.lockedPrice, lock.custom.currencyCode).toFormattedString(),
            expiresAt: lock.custom.expiresAt
        } : null
    };
}

/**
 * Locks today's price; paid locks add the fee product to the basket.
 * Caller owns the transaction and recalculates the basket.
 * @param {dw.customer.Customer} customer - Registered customer
 * @param {dw.catalog.Product} product - Variant or simple product
 * @returns {string|null} smartcommerce resource key of the error
 */
function create(customer, product) {
    var price = priceHistory.currentPrice(product);
    if (!price || !product.online) {
        return 'error.lock.product';
    }
    var customerNo = customer.profile.customerNo;
    if (findLock(customerNo, product.ID, 'active') || findLock(customerNo, product.ID, 'pending')) {
        return 'error.lock.exists';
    }
    var free = locksFree(customer);
    var fee = free ? null : ProductMgr.getProduct(Site.current.getCustomPreferenceValue('smartPriceLockFeeProductID') || '');
    if (!free && !(fee && fee.online && priceHistory.currentPrice(fee))) {
        return 'error.lock.unavailable';
    }
    var lockID = UUIDUtils.createUUID();
    var lock = CustomObjectMgr.createCustomObject(TYPE, lockID);
    lock.custom.customerNo = customerNo;
    lock.custom.productID = product.ID;
    lock.custom.lockedPrice = price.value;
    lock.custom.currencyCode = price.currencyCode;
    lock.custom.status = free ? 'active' : 'pending';
    // A pending lock waits the same number of hours for its fee to be paid.
    lock.custom.expiresAt = new Date(Date.now() + (lockHours() * HOUR_MS));
    if (!free) {
        var basket = BasketMgr.getCurrentOrNewBasket();
        basket.createProductLineItem(fee.ID, basket.defaultShipment).custom.smartPriceLockID = lockID;
    }
    return null;
}

/**
 * Keeps one price-lock adjustment per locked line in step with quantity and current
 * price, and removes it when the lock no longer applies. Runs inside basket calculation.
 * @param {dw.order.Basket} basket - Basket being calculated
 */
function syncBasket(basket) {
    // ponytail: one custom object query per basket line per calculation | upgrade path: load the customer's active locks once if baskets grow large
    var customer = basket.customer;
    var customerNo = customer && customer.registered ? customer.profile.customerNo : null;
    basket.productLineItems.toArray().forEach(function (pli) {
        var adjustment = pli.getPriceAdjustmentByPromotionID(ADJUSTMENT_ID);
        var lock = customerNo && pli.product && !pli.bonusProductLineItem ? findLock(customerNo, pli.productID, 'active') : null;
        var price = lock ? pli.product.priceModel.getPrice(pli.quantity) : null;
        var unitSaving = price && price.available && price.currencyCode === lock.custom.currencyCode
            ? price.value - lock.custom.lockedPrice : 0;
        if (unitSaving <= 0) {
            if (adjustment) {
                pli.removePriceAdjustment(adjustment);
            }
            return;
        }
        adjustment = adjustment || pli.createPriceAdjustment(ADJUSTMENT_ID);
        adjustment.setPriceValue(-Math.round(unitSaving * pli.quantityValue * 100) / 100);
        adjustment.setLineItemText(Resource.msg('lock.adjustment', 'smartcommerce', null));
    });
}

/**
 * Activates locks whose fee was paid and consumes locks used by the order.
 * Caller owns the transaction.
 * @param {dw.order.Order} order - Placed order
 */
function onOrderPlaced(order) {
    order.productLineItems.toArray().forEach(function (pli) {
        var paid = pli.custom.smartPriceLockID ? CustomObjectMgr.getCustomObject(TYPE, pli.custom.smartPriceLockID) : null;
        if (paid && paid.custom.status === 'pending') {
            paid.custom.status = 'active';
            paid.custom.expiresAt = new Date(Date.now() + (lockHours() * HOUR_MS));
            paid.custom.feeOrderNo = order.orderNo;
        }
        var used = pli.getPriceAdjustmentByPromotionID(ADJUSTMENT_ID) ? findLock(order.customerNo, pli.productID, 'active') : null;
        if (used) {
            used.custom.status = 'used';
            used.custom.usedOrderNo = order.orderNo;
        }
    });
}

module.exports = {
    TYPE: TYPE,
    viewFor: viewFor,
    create: create,
    syncBasket: syncBasket,
    onOrderPlaced: onOrderPlaced
};
