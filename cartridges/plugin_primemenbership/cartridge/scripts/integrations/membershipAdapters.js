'use strict';

/**
 * Optional integrations. Nothing here is required: a benefit that depends on a system which
 * isn't connected is reported as unavailable, never as active. Contracts are in
 * docs/plugin_primemenbership/prime-membership-api-contracts.md.
 *
 *   app.plugin.primemembership.payment   verifyPayment({orderNo, totalCents, currency}) -> {status, amountCents, currency, reference}
 *   app.plugin.primemembership.recurring chargeRenewal({transactionID, customerNo, planID, amountCents, currency}) -> {status, orderNo, amountCents, currency, reference}
 *   app.plugin.primemembership.loyalty   applyMultiplier({orderNo, customerNo, multiplier}) -> {status: APPLIED|PENDING|VOID, bonusPoints}
 *
 * status is CAPTURED, PENDING or FAILED. A provider answers server to server; a browser
 * redirect or a request parameter never counts as payment.
 */

var HookMgr = require('dw/system/HookMgr');
var Logger = require('dw/system/Logger');
var membershipHelpers = require('*/cartridge/scripts/helpers/membershipHelpers');

var log = Logger.getLogger('prime-membership', 'membership-integration');
var PAYMENT_HOOK = 'app.plugin.primemembership.payment';
var RECURRING_HOOK = 'app.plugin.primemembership.recurring';
var LOYALTY_HOOK = 'app.plugin.primemembership.loyalty';

/**
 * @param {string} hook - extension point
 * @param {string} fn - function
 * @param {Object} data - plain input
 * @returns {?Object} answer, or null on any failure
 */
function callAdapter(hook, fn, data) {
    try {
        return HookMgr.callHook(hook, fn, data) || null;
    } catch (e) {
        log.error('{0} {1} failed: {2}', hook, fn, e.message);
        return null;
    }
}

/**
 * The payment state of an order. Without an adapter this is the platform's own state, which the
 * payment processor, Business Manager or the OMS sets. Base SFRA's card processor does not set
 * PAID by itself, so such an order waits for that confirmation.
 * @param {dw.order.Order} order - order
 * @returns {{status: string, amountCents: ?number, currency: ?string, reference: ?string}} CAPTURED, PENDING or FAILED; UNKNOWN when the adapter gave no usable answer
 */
function verifyOrderPayment(order) {
    var Order = require('dw/order/Order');
    var status = order.status.value;
    if (status === Order.ORDER_STATUS_FAILED || status === Order.ORDER_STATUS_CANCELLED) {
        return { status: 'FAILED', amountCents: null, currency: null, reference: null };
    }
    if (status === Order.ORDER_STATUS_CREATED) {
        return { status: 'PENDING', amountCents: null, currency: null, reference: null };
    }
    var instruments = order.paymentInstruments.toArray ? order.paymentInstruments.toArray() : Array.prototype.slice.call(order.paymentInstruments);
    var reference = instruments.length && instruments[0].paymentTransaction ? instruments[0].paymentTransaction.transactionID : null;
    var totalCents = membershipHelpers.centsOf(order.totalGrossPrice);
    if (HookMgr.hasHook(PAYMENT_HOOK)) {
        var answer = callAdapter(PAYMENT_HOOK, 'verifyPayment', { orderNo: order.orderNo, totalCents: totalCents, currency: order.currencyCode });
        if (!answer || ['CAPTURED', 'PENDING', 'FAILED'].indexOf(answer.status) < 0) return { status: 'UNKNOWN', amountCents: null, currency: null, reference: null };
        return { status: answer.status, amountCents: typeof answer.amountCents === 'number' ? answer.amountCents : null, currency: answer.currency ? String(answer.currency) : null, reference: answer.reference ? String(answer.reference).slice(0, 128) : reference };
    }
    if (order.paymentStatus.value !== Order.PAYMENT_STATUS_PAID) {
        return { status: 'PENDING', amountCents: null, currency: null, reference: reference };
    }
    var paid = instruments.reduce(function (sum, instrument) {
        return sum + (instrument.paymentTransaction ? membershipHelpers.centsOf(instrument.paymentTransaction.amount) : 0);
    }, 0);
    return { status: 'CAPTURED', amountCents: paid, currency: order.currencyCode, reference: reference };
}

/**
 * @returns {boolean} true when renewals can really be charged automatically
 */
function isAutoRenewAvailable() {
    return membershipHelpers.getPreference('primeMembershipAutoRenewEnabled') === true && HookMgr.hasHook(RECURRING_HOOK);
}

/**
 * Charges a renewal through the recurring payment adapter. A job calls this outside any transaction.
 * @param {Object} data - {transactionID, customerNo, planID, amountCents, currency}
 * @returns {{status: string, orderNo: ?string, amountCents: ?number, currency: ?string, reference: ?string}} CAPTURED, PENDING, FAILED or UNKNOWN
 */
function chargeRenewal(data) {
    var answer = callAdapter(RECURRING_HOOK, 'chargeRenewal', data);
    if (!answer || ['CAPTURED', 'PENDING', 'FAILED'].indexOf(answer.status) < 0) return { status: 'UNKNOWN', orderNo: null, amountCents: null, currency: null, reference: null };
    return { status: answer.status, orderNo: answer.orderNo ? String(answer.orderNo) : null, amountCents: typeof answer.amountCents === 'number' ? answer.amountCents : null, currency: answer.currency ? String(answer.currency) : null, reference: answer.reference ? String(answer.reference).slice(0, 128) : null };
}

/**
 * plugin_loyalty stays optional, so its helper is only looked up when needed.
 * @returns {?Object} the plugin_loyalty order helper, or null when it isn't on the cartridge path
 */
function getPluginLoyalty() {
    try {
        return require('*/cartridge/scripts/helpers/loyaltyOrderHelper');
    } catch (e) {
        return null;
    }
}

/**
 * @returns {boolean} true when a loyalty system can apply a multiplier
 */
function isLoyaltyAvailable() {
    if (membershipHelpers.getPreference('primeMembershipLoyaltyEnabled') !== true) return false;
    return HookMgr.hasHook(LOYALTY_HOOK) || !!getPluginLoyalty();
}

/**
 * Adds the member bonus to what plugin_loyalty released for this order. It waits for the release,
 * so the bonus follows the loyalty program's delivery and return window. The lot key is unique
 * per order, so the bonus can't be credited twice.
 * @param {Object} data - {orderNo, customerNo, multiplier}
 * @returns {{status: string, bonusPoints: number}} APPLIED, PENDING or VOID
 */
function applyPluginLoyaltyMultiplier(data) {
    var CustomObjectMgr = require('dw/object/CustomObjectMgr');
    var record = CustomObjectMgr.getCustomObject('LoyaltyOrder', data.orderNo);
    if (!record) return { status: 'PENDING', bonusPoints: 0 };
    if (record.custom.customerNo !== data.customerNo) return { status: 'VOID', bonusPoints: 0 };
    if (record.custom.status === 'PENDING' || record.custom.status === 'CREATED') return { status: 'PENDING', bonusPoints: 0 };
    var bonus = record.custom.status === 'AVAILABLE' ? Math.floor((record.custom.earnedPoints || 0) * (data.multiplier - 1)) : 0;
    if (bonus <= 0) return { status: 'VOID', bonusPoints: 0 };
    var lotKey = 'MEMBERSHIP:' + data.orderNo;
    if (CustomObjectMgr.getCustomObject('LoyaltyLot', lotKey)) return { status: 'APPLIED', bonusPoints: 0 };
    var loyalty = require('*/cartridge/scripts/helpers/loyaltyHelper');
    require('dw/system/Transaction').wrap(function () {
        loyalty.credit(loyalty.getAccount(data.customerNo), lotKey, bonus, { type: 'BONUS', source: 'MEMBERSHIP', orderNo: data.orderNo });
    });
    return { status: 'APPLIED', bonusPoints: bonus };
}

/**
 * @param {Object} data - {orderNo, customerNo, multiplier}
 * @returns {{status: string, bonusPoints: number}} APPLIED, PENDING (try again later) or VOID
 */
function applyLoyaltyMultiplier(data) {
    if (HookMgr.hasHook(LOYALTY_HOOK)) {
        var answer = callAdapter(LOYALTY_HOOK, 'applyMultiplier', data);
        return { status: answer && ['APPLIED', 'VOID'].indexOf(answer.status) >= 0 ? answer.status : 'PENDING', bonusPoints: answer && answer.bonusPoints ? answer.bonusPoints : 0 };
    }
    return getPluginLoyalty() ? applyPluginLoyaltyMultiplier(data) : { status: 'VOID', bonusPoints: 0 };
}

/**
 * @param {string} integration - dependency name from the benefit catalog
 * @returns {boolean} true when the merchant confirmed that system is connected
 */
function isConnected(integration) {
    if (integration === 'loyalty') return isLoyaltyAvailable();
    return membershipHelpers.getListPreference('primeMembershipConnectedIntegrations').indexOf(integration) >= 0;
}

module.exports = {
    verifyOrderPayment: verifyOrderPayment,
    isAutoRenewAvailable: isAutoRenewAvailable,
    chargeRenewal: chargeRenewal,
    isLoyaltyAvailable: isLoyaltyAvailable,
    applyLoyaltyMultiplier: applyLoyaltyMultiplier,
    isConnected: isConnected
};
