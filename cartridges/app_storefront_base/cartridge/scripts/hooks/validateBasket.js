'use strict';

var Collections = require('~/cartridge/scripts/util/collections');

var ProductInventoryMgr = require('dw/catalog/ProductInventoryMgr');
var Resource = require('dw/web/Resource');
var StoreMgr = require('dw/catalog/StoreMgr');

/**
 * validates that the product line items are exist, are online, and have available inventory.
 * @param {dw.order.Basket} basket - The current user's basket
 * @returns {Object} an error object
 */
function validateProducts(basket) {
    var result = {
        error: false,
        hasInventory: true
    };
    var productLineItems = basket.productLineItems;

    Collections.forEach(productLineItems, function (item) {
        if (item.product === null || !item.product.online) {
            result.error = true;
            return;
        }

        if (Object.hasOwnProperty.call(item.custom, 'fromStoreId')
            && item.custom.fromStoreId) {
            var store = StoreMgr.getStore(item.custom.fromStoreId);
            var storeInventory = ProductInventoryMgr.getInventoryList(store.custom.inventoryListId);

            result.hasInventory = result.hasInventory
                && (storeInventory.getRecord(item.productID)
                && storeInventory.getRecord(item.productID).ATS.value >= item.quantityValue);
        } else {
            var availabilityLevels = item.product.availabilityModel
                .getAvailabilityLevels(item.quantityValue);
            result.hasInventory = result.hasInventory
                && (availabilityLevels.notAvailable.value === 0);
        }
    });

    return result;
}

/**
 * Validates coupons
 * @param {dw.order.Basket} basket - The current user's basket
 * @returns {Object} an error object
 */
function validateCoupons(basket) {
    var invalidCouponLineItem = Collections.find(basket.couponLineItems, function (couponLineItem) {
        return !couponLineItem.valid;
    });

    return {
        error: !!invalidCouponLineItem
    };
}

/**
 * validates the current users basket
 * @param {dw.order.Basket} basket - The current user's basket
 * @param {boolean} validateTax - boolean that determines whether or not to validate taxes
 * @returns {Object} an error object
 */
function validateBasket(basket, validateTax) {
    var result = { error: false, message: null };

    if (!basket) {
        result.error = true;
        result.message = Resource.msg('error.cart.expired', 'cart', null);
    } else {
        var productExistence = validateProducts(basket);
        var validCoupons = validateCoupons(basket);
        var totalTax = true;

        if (validateTax) {
            totalTax = basket.totalTax.available;
        }

        if (productExistence.error || !productExistence.hasInventory) {
            result.error = true;
            result.message = Resource.msg('error.cart.or.checkout.error', 'cart', null);
        } else if (validCoupons.error) {
            result.error = true;
            result.message = Resource.msg('error.invalid.coupon', 'cart', null);
        } else if (basket.productLineItems.getLength() === 0) {
            result.error = true;
        } else if (!basket.merchandizeTotalPrice.available) {
            result.error = true;
            result.message = Resource.msg('error.cart.or.checkout.error', 'cart', null);
        } else if (!totalTax) {
            result.error = true;
            result.message = Resource.msg('error.invalid.tax', 'cart', null);
        }
    }

    return result;
}

exports.validateBasket = validateBasket;
