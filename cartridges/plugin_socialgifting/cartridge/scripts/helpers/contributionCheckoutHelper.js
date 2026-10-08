'use strict';

var BasketMgr = require('dw/order/BasketMgr');
var ProductMgr = require('dw/catalog/ProductMgr');
var Site = require('dw/system/Site');
var Money = require('dw/value/Money');
var store = require('./store');
var contributions = require('./contributionHelper');
var money = require('../util/money');
var v = require('../util/validation');
/**
 * Add the contributionCheckoutHelper domain operation.
 * @param {*} actor - actor input
 * @param {*} input - input input
 * @returns {*} Domain result
 */
function add(actor, input) {
    var basket = BasketMgr.getCurrentOrNewBasket();
    if (basket.productLineItems.length || basket.giftCertificateLineItems.length) v.fail('EMPTY_BASKET_REQUIRED', 409);
    var pid = Site.current.getCustomPreferenceValue('GroupGiftContributionProductID');
    var product = pid && ProductMgr.getProduct(pid);
    if (!product || !product.online || product.master || product.optionProduct || !product.custom.sgContributionProduct) v.fail('CONTRIBUTION_PRODUCT_NOT_CONFIGURED', 503);
    return store.transaction(function () {
        var key = contributions.create(actor, input);
        var contribution = contributions.get(key);
        if (basket.currencyCode !== contribution.custom.currency) v.fail('CURRENCY_MISMATCH');
        var pli = basket.createProductLineItem(product, product.optionModel, basket.defaultShipment);
        pli.setQuantityValue(1);
        pli.custom.sgContributionKey = key;
        basket.custom.sgContributionKey = key;
        calculate(basket);
        return key;
    });
}
/**
 * Recheck the server-owned basket context before creating an order.
 * @param {*} basket - basket input
 * @returns {*} Domain result
 */
function validate(basket) {
    var key = basket.custom.sgContributionKey;
    if (!key) return null;
    var record = contributions.get(key);
    var lines = basket.productLineItems;
    if (record.custom.status !== 'CREATED' || record.custom.holdExpiresAt.getTime() <= Date.now()) v.fail('CONTRIBUTION_EXPIRED', 409);
    if (lines.length !== 1 || lines[0].custom.sgContributionKey !== key || lines[0].quantityValue !== 1
        || !lines[0].product || !lines[0].product.custom.sgContributionProduct || basket.giftCertificateLineItems.length
        || basket.couponLineItems.length || basket.currencyCode !== record.custom.currency) v.fail('INVALID_CONTRIBUTION_BASKET', 409);
    return record;
}
/**
 * Price the contribution from its immutable ledger amount.
 * @param {*} basket - basket input
 * @returns {*} Domain result
 */
function calculate(basket) {
    var record = validate(basket);
    if (!record) return false;
    // The merchant must configure the funding SKU as a non-shipping, non-taxable funding instrument.
    // It represents money held, not the eventual taxable jewellery sale.
    var pli = basket.productLineItems[0];
    if (pli.priceAdjustments.length || basket.priceAdjustments.length) v.fail('CONTRIBUTION_DISCOUNT_NOT_ALLOWED', 409);
    pli.setPriceValue(new Money(Number(record.custom.amount), record.custom.currency).value);
    pli.updateTax(0);
    basket.shipments.toArray().forEach(function (shipment) {
        shipment.shippingLineItems.toArray().forEach(function (line) { line.setPriceValue(0); line.updateTax(0); });
    });
    basket.updateTotals();
    if (money.cmp(basket.totalGrossPrice.decimalValue.toString(), record.custom.amount) !== 0) v.fail('CONTRIBUTION_TOTAL_MISMATCH', 409);
    return true;
}
/**
 * Bind an existing capacity hold to the newly created order.
 * @param {*} order - order input
 * @param {*} key - key input
 */
function attach(order, key) {
    var record = contributions.get(key);
    var gift = require('./groupGiftHelper').get(record.custom.giftKey);
    store.mutate('gift:' + gift.custom.publicKey, gift);
    if (record.custom.status !== 'CREATED' || record.custom.holdExpiresAt.getTime() <= Date.now()) v.fail('CONTRIBUTION_EXPIRED', 409);
    record.custom.status = 'PENDING';
    record.custom.orderNo = order.orderNo;
    order.custom.sgContributionKey = key;
}
/**
 * Project confirmed server-side order payment state into the ledger.
 * @param {*} order - order input
 */
function reconcile(order) {
    var key = order.custom.sgContributionKey;
    if (!key) return;
    var record = contributions.get(key);
    var payment = require('../services/paymentAdapter').captured(order, record);
    if (payment) contributions.capture(key, payment);
    // FAILED/CANCELLED alone is not evidence that an authorization/capture was voided.
    // Keep pending holds until a verified provider failure event or operations reconciliation.
}
module.exports = { add: add, validate: validate, calculate: calculate, attach: attach, reconcile: reconcile };
