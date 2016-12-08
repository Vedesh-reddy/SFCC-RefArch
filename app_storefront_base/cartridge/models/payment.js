'use strict';

var helper = require('~/cartridge/scripts/dwHelpers');

/**
 * Creates an array of objects containing applicable payment methods
 * @param {dw.util.ArrayList <dw.order.dw.order.PaymentMethod>} paymentMethods - An ArrayList of
 *      applicable payment methods that the user could use for the current basket.
 * @returns {Array} of object that contain information about the applicable payment methods for the
 *      current cart
 */
function applicablePaymentMethods(paymentMethods) {
    var results = [];
    helper.forEach(paymentMethods, function (method) {
        if (method.ID === 'CREDIT_CARD') {
            results.push({
                ID: method.ID,
                name: method.name
            });
        }
    });
    return results;
}

/**
 * Creates an array of objects containing applicable credit cards
 * @param {dw.util.Collection <dw.order.PaymentCard>} paymentCards - An ArrayList of applicable
 *      payment cards that the user could use for the current basket.
 * @returns {Array} Array of objects that contain information about applicable payment cards for
 *      current basket.
 */
function applicablePaymentCards(paymentCards) {
    return helper.map(paymentCards, function (card) {
        return {
            cardType: card.cardType,
            name: card.name
        };
    });
}

/**
 * Creates an array of objects containing selected payment information
 * @param {dw.util.ArrayList <dw.order.PaymentInstrument>} selectedPaymentInstruments - ArrayList
 *      of payment instruments that the user is using to pay for the current basket
 * @returns {Array} Array of objects that contain information about the selected payment instruments
 */
function getSelectedPaymentInstruments(selectedPaymentInstruments) {
    return helper.map(selectedPaymentInstruments, function (paymentInstrument) {
        var results = {
            paymentMethod: paymentInstrument.paymentMethod,
            amount: paymentInstrument.paymentTransaction.amount.value
        };
        if (paymentInstrument.paymentMethod === 'CREDIT_CARD') {
            results.lastFour = paymentInstrument.creditCardNumberLastDigits;
            results.owner = paymentInstrument.creditCardHolder;
            results.expirationYear = paymentInstrument.creditCardExpirationYear;
            results.type = paymentInstrument.creditCardType;
            results.maskedCreditCardNumber = paymentInstrument.maskedCreditCardNumber;
            results.expirationMonth = paymentInstrument.creditCardExpirationMonth;
        } else if (paymentInstrument.paymentMethod === 'GIFT_CERTIFICATE') {
            results.giftCertificateCode = paymentInstrument.giftCertificateCode;
            results.maskedGiftCertificateCode = paymentInstrument.maskedGiftCertificateCode;
        }

        return results;
    });
}

/**
 * payment class that represents payment information for the current basket
 * @param {dw.util.ArrayList <dw.order.dw.order.PaymentMethod>} paymentMethods - An ArrayList of
 *      applicable payment methods that the user could use for the current basket.
 * @param {dw.util.Collection <dw.order.PaymentCard>} paymentCards - An ArrayList of applicable
 *      payment cards that the user could use for the current basket.
 * @param {dw.util.ArrayList <dw.order.PaymentInstrument>} selectedPaymentInstruments - ArrayList
 *      of payment instruments that the user is using to pay for the current basket
 * @constructor
 */
function payment(paymentMethods, paymentCards, selectedPaymentInstruments) {
    this.applicablePaymentMethods =
        paymentMethods ? applicablePaymentMethods(paymentMethods) : null;

    this.applicablePaymentCards = paymentCards ? applicablePaymentCards(paymentCards) : null;

    this.selectedPaymentInstruments = selectedPaymentInstruments ?
        getSelectedPaymentInstruments(selectedPaymentInstruments) : null;
}

module.exports = payment;
