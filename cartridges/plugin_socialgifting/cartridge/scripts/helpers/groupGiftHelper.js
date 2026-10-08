'use strict';

var store = require('./store');
var registryHelper = require('./registryHelper');
var permission = require('./registryPermissionHelper');
var items = require('./registryItemHelper');
var token = require('../util/token');
var prefs = require('../util/preferences');
var v = require('../util/validation');
var money = require('../util/money');
/**
 * Get the groupGiftHelper domain operation.
 * @param {*} key - key input
 * @returns {*} Domain result
 */
function get(key) { var gift = store.get('GroupGift', key); if (!gift) v.fail('NOT_FOUND', 404); return gift; }
/**
 * Create the groupGiftHelper domain operation.
 * @param {*} actor - actor input
 * @param {*} input - input input
 * @returns {*} Domain result
 */
function create(actor, input) {
    prefs.requireFeature('GroupGiftingEnabled');
    return store.transaction(function () {
        var registry = registryHelper.get(input.registryKey);
        permission.requireRight(registry, actor, 'edit');
        if (!registry.custom.allowGroupGifting || registry.custom.status !== 'ACTIVE') v.fail('GROUP_GIFT_DISABLED', 409);
        var pair = items.resolve(registry, input.itemKey);
        if (!pair.item.custom.sgAllowGroupGifting || pair.item.custom.sgGroupGiftKey || pair.item.custom.sgStatus !== 'ACTIVE') v.fail('GROUP_GIFT_DISABLED', 409);
        if (v.remaining(pair.state.custom.desired, pair.state.custom.purchased, pair.state.custom.reserved) < 1) v.fail('GIFT_ALREADY_PURCHASED', 409);
        var product = pair.item.product;
        var price = product && product.priceModel.price;
        if (!price || !price.available || price.currencyCode !== actor.currency) v.fail('PRICE_UNAVAILABLE', 409);
        var target = money.amount(price.decimalValue.toString(), price.currencyCode);
        var key = token.random();
        store.mutate('item:' + input.itemKey, pair.state);
        pair.state.custom.reserved += 1; // Campaign exclusively holds one desired unit.
        pair.item.custom.sgGroupGiftKey = key;
        store.create('GroupGift', key, { publicKey: key, registryKey: input.registryKey, itemKey: input.itemKey,
            target: target, paid: '0', held: '0', refunded: '0', currency: price.currencyCode, status: 'OPEN', revision: 0, unitHeld: true,
            expiresAt: new Date(Date.now() + prefs.number('GroupGiftExpirationDays') * 86400000) });
        require('./activityHelper').record(input.registryKey, 'GROUP_GIFT_CREATED', input.itemKey);
        return key;
    });
}
/**
 * Stop the groupGiftHelper domain operation.
 * @param {*} actor - actor input
 * @param {*} input - input input
 */
function stop(actor, input) {
    store.transaction(function () {
        var gift = get(input.giftKey);
        var registry = registryHelper.get(gift.custom.registryKey);
        permission.requireRight(registry, actor, 'edit');
        if (gift.custom.status === 'COMPLETED') v.fail('GIFT_COMPLETED', 409);
        store.mutate('gift:' + input.giftKey, gift);
        gift.custom.status = 'CANCELLED';
        // Keep campaign unit held until every payment is reconciled/refunded.
        releaseUnit(gift);
    });
}
/**
 * Release campaign capacity only when all funding is settled.
 * @param {*} gift - gift input
 */
function releaseUnit(gift) {
    if (['CANCELLED', 'EXPIRED'].indexOf(gift.custom.status) === -1 || money.cmp(gift.custom.paid, '0') !== 0 || money.cmp(gift.custom.held, '0') !== 0) return;
    var pair = items.resolve(registryHelper.get(gift.custom.registryKey), gift.custom.itemKey);
    if (pair.item.custom.sgGroupGiftKey !== gift.custom.publicKey) return;
    store.mutate('item:' + gift.custom.itemKey, pair.state);
    if (gift.custom.unitHeld) pair.state.custom.reserved -= 1;
    gift.custom.unitHeld = false;
    pair.item.custom.sgGroupGiftKey = null;
}
/**
 * Consume the held registry unit after the merchant creates a funded fulfillment order.
 * @param {string} key - Campaign key
 * @param {dw.order.Order} order - Server-resolved fulfillment order
 */
function complete(key, order) {
    var Order = require('dw/order/Order');
    store.transaction(function () {
        var gift = get(key);
        if (gift.custom.status === 'COMPLETED' && gift.custom.fulfillmentOrderNo === order.orderNo) return;
        if (gift.custom.status !== 'FUNDED' || order.custom.sgGroupGiftKey !== key
            || [Order.ORDER_STATUS_NEW, Order.ORDER_STATUS_OPEN, Order.ORDER_STATUS_COMPLETED].indexOf(order.status.value) === -1
            || order.paymentStatus.value !== Order.PAYMENT_STATUS_PAID || order.currencyCode !== gift.custom.currency
            || money.cmp(order.totalGrossPrice.decimalValue.toString(), gift.custom.target) !== 0) v.fail('FULFILLMENT_MISMATCH', 409);
        var pair = items.resolve(registryHelper.get(gift.custom.registryKey), gift.custom.itemKey);
        var lines = order.productLineItems.toArray();
        if (lines.length !== 1 || lines[0].productID !== pair.item.productID || lines[0].quantityValue !== 1
            || pair.item.custom.sgGroupGiftKey !== key || pair.state.custom.purchased >= pair.state.custom.desired) v.fail('FULFILLMENT_MISMATCH', 409);
        store.mutate('gift:' + key, gift);
        store.mutate('item:' + gift.custom.itemKey, pair.state);
        store.create('RegistryPurchase', token.key([order.orderNo, lines[0].UUID, 'GROUP']), {
            orderNo: order.orderNo, lineItemID: lines[0].UUID, registryKey: gift.custom.registryKey,
            itemKey: gift.custom.itemKey, quantity: 1, anonymous: true, status: 'PURCHASED'
        });
        pair.state.custom.purchased += 1;
        pair.state.custom.reserved -= 1;
        gift.custom.unitHeld = false;
        gift.custom.status = 'COMPLETED';
        gift.custom.fulfillmentOrderNo = order.orderNo;
        require('./activityHelper').record(gift.custom.registryKey, 'PRODUCT_PURCHASED', gift.custom.itemKey, true);
    });
}
module.exports = { get: get, create: create, stop: stop, releaseUnit: releaseUnit, complete: complete };
