'use strict';

/**
 * Order creation and placement wrappers:
 * - pickup shipments are pinned to their store right before the order is created;
 * - placed orders hold export until the modification window closes, activate or
 *   consume price locks, and get a pickup code when they contain store pickup.
 */

var base = module.superModule;
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');
var storePickup = require('*/cartridge/scripts/storePickup');
var priceLock = require('*/cartridge/scripts/priceLock');
var orderSelfService = require('*/cartridge/scripts/orderSelfService');
var smartMail = require('*/cartridge/scripts/smartMail');

var customLogger = Logger.getLogger('smart-commerce', 'checkout-order');

/**
 * @param {dw.order.Basket} currentBasket - Basket to turn into an order
 * @returns {dw.order.Order|null} Created order
 */
function createOrder(currentBasket) {
    Transaction.wrap(function () {
        storePickup.enforce(currentBasket);
    });
    return base.createOrder(currentBasket);
}

/**
 * The order is already placed when this runs, so failures are logged, never
 * turned into a checkout error.
 * @param {dw.order.Order} order - Order to place
 * @param {Object} fraudDetectionStatus - Fraud detection result
 * @returns {Object} Base result
 */
function placeOrder(order, fraudDetectionStatus) {
    var result = base.placeOrder(order, fraudDetectionStatus);
    if (result.error) {
        return result;
    }
    try {
        var code = Transaction.wrap(function () {
            order.setExportAfter(orderSelfService.editableUntil(order));
            priceLock.onOrderPlaced(order);
            return storePickup.issueCode(order);
        });
        if (code && order.customerEmail) {
            smartMail.sendCode(order.customerEmail, code, 'email.code.reason.pickup');
        }
    } catch (e) {
        customLogger.error('Post-placement processing failed for order {0}: {1}', order.orderNo, e.message);
    }
    return result;
}

module.exports = Object.assign({}, base, {
    createOrder: createOrder,
    placeOrder: placeOrder
});
