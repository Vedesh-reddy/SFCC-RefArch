'use strict';

var Order = require('dw/order/Order');
var store = require('./store');
var token = require('../util/token');
var registryHelper = require('./registryHelper');
var items = require('./registryItemHelper');
var v = require('../util/validation');
/**
 * Persist an idempotent event or purchase in the caller domain.
 * @param {*} order - order input
 */
function record(order) {
    if ([Order.ORDER_STATUS_NEW, Order.ORDER_STATUS_OPEN, Order.ORDER_STATUS_COMPLETED].indexOf(order.status.value) === -1) return;
    store.transaction(function () {
        order.productLineItems.toArray().forEach(function (line) {
            if (!line.custom.sgRegistryKey) return;
            var key = token.key([order.orderNo, line.UUID, 'PURCHASE']);
            if (store.get('RegistryPurchase', key)) return;
            var registry = registryHelper.get(line.custom.sgRegistryKey);
            var pair = items.resolve(registry, line.custom.sgRegistryItemKey);
            var reservation = store.get('RegistryReservation', line.custom.sgReservationKey);
            if (!reservation || reservation.custom.status !== 'ORDER_PENDING' || reservation.custom.orderNo !== order.orderNo
                || reservation.custom.registryKey !== registry.custom.publicKey || reservation.custom.itemKey !== pair.state.custom.publicKey
                || pair.item.productID !== line.productID || reservation.custom.quantity !== line.quantityValue) v.fail('PURCHASE_CONTEXT_INVALID', 409);
            store.mutate('item:' + line.custom.sgRegistryItemKey, pair.state);
            if (pair.state.custom.purchased + line.quantityValue > pair.state.custom.desired) v.fail('OVERPURCHASE', 409);
            pair.state.custom.purchased += line.quantityValue;
            pair.state.custom.reserved -= line.quantityValue;
            reservation.custom.status = 'PURCHASED';
            store.create('RegistryPurchase', key, { orderNo: order.orderNo, lineItemID: line.UUID, registryKey: registry.custom.publicKey,
                itemKey: line.custom.sgRegistryItemKey, quantity: line.quantityValue, anonymous: line.custom.sgAnonymousGift, status: 'PURCHASED' });
            // Never write donor identity to native ProductListItemPurchase fields.
            var event = require('./activityHelper').record(registry.custom.publicKey, 'PRODUCT_PURCHASED', line.custom.sgRegistryItemKey, line.custom.sgAnonymousGift);
            require('./notificationHelper').enqueue(registry.custom.publicKey, event, 'purchase');
        });
        order.custom.sgRegistryProcessedAt = new Date();
    });
}
/**
 * Reverse registry quantities only after an authoritative order cancellation.
 * @param {dw.order.Order} order - Cancelled commerce order
 */
function cancel(order) {
    if (order.status.value !== Order.ORDER_STATUS_CANCELLED) return;
    store.transaction(function () {
        if (order.custom.sgGroupGiftKey) {
            var gift = require('./groupGiftHelper').get(order.custom.sgGroupGiftKey);
            store.mutate('gift:' + gift.custom.publicKey, gift);
            gift.custom.status = 'CANCELLED';
        }
        store.query('RegistryPurchase', 'custom.orderNo = {0}', [order.orderNo], 100).forEach(function (purchase) {
            if (purchase.custom.status === 'CANCELLED') return;
            var pair = items.resolve(registryHelper.get(purchase.custom.registryKey), purchase.custom.itemKey);
            store.mutate('item:' + purchase.custom.itemKey, pair.state);
            if (pair.state.custom.purchased < purchase.custom.quantity) v.fail('PURCHASE_CONTEXT_INVALID', 409);
            pair.state.custom.purchased -= purchase.custom.quantity;
            purchase.custom.status = 'CANCELLED';
        });
    });
}
module.exports = { record: record, cancel: cancel };
