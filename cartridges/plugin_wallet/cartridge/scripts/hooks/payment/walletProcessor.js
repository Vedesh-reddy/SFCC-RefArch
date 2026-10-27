'use strict';

/**
 * Payment processor WALLET (hook app.payment.processor.wallet).
 *
 * Handle runs when the shopper submits payment with the wallet as the only method: the wallet
 * instrument (created by Wallet-Apply) must cover the whole basket, and other instruments
 * are removed. Authorize runs per wallet instrument while the base checkout authorizes the
 * order's payments, and places the wallet hold.
 */

var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');

/**
 * @param {dw.order.Basket} basket - current basket
 * @returns {Object} result in the base processor shape
 */
function Handle(basket) {
    var paymentHelpers = require('*/cartridge/scripts/helpers/walletPaymentHelpers');
    var wallet = paymentHelpers.getWalletInstruments(basket)[0];
    if (!wallet || paymentHelpers.getSplit(basket).remainingCents > 0) {
        return { fieldErrors: [], serverErrors: [Resource.msg('error.not-enough', 'wallet', null)], error: true };
    }
    Transaction.wrap(function () {
        basket.paymentInstruments.toArray().forEach(function (pi) {
            if (pi !== wallet) basket.removePaymentInstrument(pi);
        });
    });
    return { fieldErrors: {}, serverErrors: [], error: false };
}

/**
 * @param {string} orderNumber - order being placed
 * @param {dw.order.OrderPaymentInstrument} paymentInstrument - wallet instrument of the order
 * @param {dw.order.PaymentProcessor} paymentProcessor - WALLET processor
 * @returns {Object} {authorized, error, serverErrors}
 */
function Authorize(orderNumber, paymentInstrument, paymentProcessor) {
    var result = require('*/cartridge/scripts/helpers/walletPaymentHelpers').authorizePayment(orderNumber, paymentInstrument, customer, String(session.sessionID));
    if (result.error) {
        return { authorized: false, error: true, serverErrors: [result.errorMessage] };
    }
    Transaction.wrap(function () { paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor); });
    // The PlaceOrder extension captures or releases exactly the holds of this request.
    var holds = request.custom.walletHoldIds ? String(request.custom.walletHoldIds).split(',') : [];
    holds.push(result.holdId);
    request.custom.walletHoldIds = holds.join(',');
    return { authorized: true, error: false };
}

module.exports = {
    Handle: Handle,
    Authorize: Authorize
};
