'use strict';

/**
 * @param {Object} h - harness
 * @param {string} customerNo - owner
 * @param {number} availableCents - balance to fund (through a real TOPUP journal)
 * @returns {Object} owner wallet context
 */
function fundedWallet(h, customerNo, availableCents) {
    var accountHelpers = h.require('scripts/helpers/walletAccountHelpers');
    var context = accountHelpers.getWalletContext(h.customer(customerNo), true);
    h.mock('dw/system/Transaction').wrap(function () {
        if (availableCents > 0) {
            accountHelpers.postTransaction({ key: 'TOPUP:FIXTURE-' + customerNo, txType: 'TOPUP', walletId: context.walletId, amountCents: availableCents, actor: { type: 'SYSTEM', ref: 'fixture' } });
        }
        // The test session has paid before, so no step-up code is needed unless a test asks for one.
        accountHelpers.rememberSession(context.wallet, 'session-1');
    });
    return accountHelpers.getWalletContext(h.customer(customerNo), false);
}

/**
 * @param {Object} h - harness
 * @param {string} methodId - payment method
 * @param {number} cents - amount
 * @returns {Object} payment instrument double
 */
function instrument(h, methodId, cents) {
    var pi = {
        paymentMethod: methodId,
        custom: {},
        paymentTransaction: {
            amount: new h.Money(cents / 100, 'USD'),
            transactionID: null,
            setAmount: function (money) { pi.paymentTransaction.amount = money; },
            setTransactionID: function (id) { pi.paymentTransaction.transactionID = id; },
            setPaymentProcessor: function () {}
        }
    };
    return pi;
}

/**
 * @param {Object} h - harness
 * @param {number} totalCents - basket total
 * @param {string[]} [productIds] - products
 * @returns {Object} basket double
 */
function basket(h, totalCents, productIds) {
    var pis = [];
    var b = {
        UUID: 'BASKET-' + Math.random().toString(16).slice(2, 10),
        totalGrossPrice: new h.Money(totalCents / 100, 'USD'),
        adjustedMerchandizeTotalPrice: new h.Money(totalCents / 100, 'USD'),
        paymentInstruments: { toArray: function () { return pis.slice(); } },
        productLineItems: { toArray: function () { return (productIds || ['P1']).map(function (id) { return { productID: id }; }); } },
        createPaymentInstrument: function (methodId, money) {
            var pi = instrument(h, methodId, Math.round(money.value * 100));
            pis.push(pi);
            return pi;
        },
        removePaymentInstrument: function (pi) {
            var i = pis.indexOf(pi);
            if (i >= 0) pis.splice(i, 1);
        }
    };
    return b;
}

/**
 * @param {Object} h - harness
 * @param {string} orderNo - order number
 * @param {number} status - order status constant
 * @param {Object[]} pis - payment instruments
 * @param {number} totalCents - order total
 * @returns {Object} order double registered in the harness
 */
function order(h, orderNo, status, pis, totalCents) {
    var o = {
        orderNo: orderNo,
        status: { value: status },
        totalGrossPrice: new h.Money(totalCents / 100, 'USD'),
        paymentInstruments: { toArray: function () { return pis; } },
        setPaymentStatus: function (s) { o.paymentStatus = s; }
    };
    h.state.orders[orderNo] = o;
    return o;
}

module.exports = {
    fundedWallet: fundedWallet,
    instrument: instrument,
    basket: basket,
    order: order
};
