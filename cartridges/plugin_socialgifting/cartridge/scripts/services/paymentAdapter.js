'use strict';

var Order = require('dw/order/Order');
var money = require('../util/money');
var HookMgr = require('dw/system/HookMgr');
// Existing card integrations own authorization/capture and update authoritative SFCC payment status.
/**
 * Accept only placed, paid orders with the exact expected total.
 * @param {*} order - order input
 * @param {*} contribution - contribution input
 * @returns {*} Domain result
 */
function captured(order, contribution) {
    if (order.paymentStatus.value !== Order.PAYMENT_STATUS_PAID || [Order.ORDER_STATUS_NEW, Order.ORDER_STATUS_OPEN, Order.ORDER_STATUS_COMPLETED].indexOf(order.status.value) === -1) return null;
    if (order.currencyCode !== contribution.custom.currency || money.cmp(order.totalGrossPrice.decimalValue.toString(), contribution.custom.amount) !== 0) return null;
    return { provider: 'sfcc-order', paymentID: order.orderNo, amount: contribution.custom.amount, currency: order.currencyCode };
}
/**
 * Delegate raw webhook authentication to a configured gateway hook.
 * @param {*} request - request input
 * @returns {*} Domain result
 */
function callback(request) {
    // Optional gateway extension must authenticate raw body/signature and return a normalized verified event.
    if (!HookMgr.hasHook('app.socialGifting.payment')) require('../util/validation').fail('NOT_FOUND', 404);
    var event = HookMgr.callHook('app.socialGifting.payment', 'verifyCallback', request);
    if (!event || event.verified !== true || !event.eventID || !event.contributionKey || !event.orderNo || (event.type === 'FAILED' && event.definitive !== true)) require('../util/validation').fail('INVALID_SIGNATURE', 403);
    return event;
}
module.exports = { captured: captured, callback: callback };
