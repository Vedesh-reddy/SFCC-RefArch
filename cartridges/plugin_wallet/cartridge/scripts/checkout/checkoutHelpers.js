'use strict';

var base = module.superModule;

/**
 * The base helper puts the whole order total on the first payment instrument. With a wallet
 * instrument, the wallet takes its (server-side) amount and the one other instrument takes
 * the rest; without one, the base behavior is unchanged.
 * @param {dw.order.Basket} currentBasket - basket
 * @returns {{error: boolean}} result
 */
function calculatePaymentTransaction(currentBasket) {
    var paymentHelpers = require('*/cartridge/scripts/helpers/walletPaymentHelpers');
    if (!paymentHelpers.getWalletInstruments(currentBasket).length) return base.calculatePaymentTransaction(currentBasket);
    var result = { error: false };
    try {
        require('dw/system/Transaction').wrap(function () {
            result.error = !paymentHelpers.allocatePayments(currentBasket);
        });
    } catch (e) {
        result.error = true;
    }
    return result;
}

module.exports = Object.assign({}, base, {
    calculatePaymentTransaction: calculatePaymentTransaction
});
