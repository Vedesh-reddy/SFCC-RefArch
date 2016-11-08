'use strict';

var helper = require('~/cartridge/scripts/dwHelpers');

var PaymentInstrument = require('dw/order/PaymentInstrument');
var PaymentMgr = require('dw/order/PaymentMgr');
var PaymentStatusCodes = require('dw/order/PaymentStatusCodes');
var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');

/**
 * Verifies that entered credit card information is a valid card. If the information is valid a
 * credit card payment instrument is created
 * @param {dw.order.Basket} basket Current users's basket
 * @param {Object} form - the payment form
 * @return {Object} returns an error object
 */
function Handle(basket, form) {
    var currentBasket = basket;
    var cardErrors = {};
    var cardNumber = form.cardNumber.value;
    var cardSecurityCode = form.securityCode.value;
    var expirationMonth = form.expirationMonth.value;
    var expirationYear = form.expirationYear.value;

    var cardType = form.cardType.value;
    var paymentCard = PaymentMgr.getPaymentCard(cardType);

    var creditCardStatus = paymentCard.verify(
        expirationMonth,
        expirationYear,
        cardNumber,
        cardSecurityCode
    );

    if (creditCardStatus.error) {
        for (var i = 0; i < creditCardStatus.items.length; i++) {
            if (creditCardStatus.items[i].code ===
                PaymentStatusCodes.CREDITCARD_INVALID_CARD_NUMBER
            ) {
                cardErrors[form.cardNumber.htmlName] =
                    Resource.msg('error.invalid.card.number', 'creditCard', null);
            } else if (creditCardStatus.items[i].code ===
                PaymentStatusCodes.CREDITCARD_INVALID_EXPIRATION_DATE
            ) {
                cardErrors[form.expirationMonth.htmlName] =
                    Resource.msg('error.expired.credit.card', 'creditCard', null);
                cardErrors[form.expirationYear.htmlName] =
                    Resource.msg('error.expired.credit.card', 'creditCard', null);
            } else if (creditCardStatus.items[i].code ===
                PaymentStatusCodes.CREDITCARD_INVALID_SECURITY_CODE
            ) {
                cardErrors[form.securityCode.htmlName] =
                    Resource.msg('error.invalid.security.code', 'creditCard', null);
            }
        }
        return { fieldErrors: [cardErrors], serverErrors: [], error: true };
    }

    Transaction.wrap(function () {
        var paymentInstruments = currentBasket.getPaymentInstruments(
            PaymentInstrument.METHOD_CREDIT_CARD
        );

        helper.forEach(paymentInstruments, function (item) {
            currentBasket.removePaymentInstrument(item);
        });

        var paymentInstrument = currentBasket.createPaymentInstrument(
            PaymentInstrument.METHOD_CREDIT_CARD, currentBasket.totalGrossPrice
        );

        paymentInstrument.creditCardHolder = currentBasket.billingAddress.fullName;
        paymentInstrument.creditCardNumber = cardNumber;
        paymentInstrument.creditCardType = cardType;
        paymentInstrument.creditCardExpirationMonth = expirationMonth;
        paymentInstrument.creditCardExpirationYear = expirationYear;
    });

    return { fieldErrors: cardErrors, serverErrors: [], error: false };
}

exports.Handle = Handle;
