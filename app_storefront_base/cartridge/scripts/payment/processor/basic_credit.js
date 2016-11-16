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
 * @param {Object} paymentInformation - the payment information
 * @return {Object} returns an error object
 */
function Handle(basket, paymentInformation) {
    var currentBasket = basket;
    var cardErrors = {};
    var cardNumber = paymentInformation.cardNumber.value;
    var cardSecurityCode = paymentInformation.securityCode.value;
    var expirationMonth = paymentInformation.expirationMonth.value;
    var expirationYear = paymentInformation.expirationYear.value;
    var serverErrors = [];

    var cardType = paymentInformation.cardType.value;
    var paymentCard = PaymentMgr.getPaymentCard(cardType);

    var creditCardStatus = paymentCard.verify(
        expirationMonth,
        expirationYear,
        cardNumber,
        cardSecurityCode
    );

    if (creditCardStatus.error) {
        helper.forEach(creditCardStatus.items, function (item) {
            switch (item.code) {
                case PaymentStatusCodes.CREDITCARD_INVALID_CARD_NUMBER:
                    cardErrors[paymentInformation.cardNumber.htmlName] =
                        Resource.msg('error.invalid.card.number', 'creditCard', null);
                    break;

                case PaymentStatusCodes.CREDITCARD_INVALID_EXPIRATION_DATE:
                    cardErrors[paymentInformation.expirationMonth.htmlName] =
                        Resource.msg('error.expired.credit.card', 'creditCard', null);
                    cardErrors[paymentInformation.expirationYear.htmlName] =
                        Resource.msg('error.expired.credit.card', 'creditCard', null);
                    break;

                case PaymentStatusCodes.CREDITCARD_INVALID_SECURITY_CODE:
                    cardErrors[paymentInformation.securityCode.htmlName] =
                        Resource.msg('error.invalid.security.code', 'creditCard', null);
                    break;
                default:
                    serverErrors.push(
                        Resource.msg('error.card.information.error', 'creditCard', null)
                    );
            }
        });

        return { fieldErrors: [cardErrors], serverErrors: serverErrors, error: true };
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

    return { fieldErrors: cardErrors, serverErrors: serverErrors, error: false };
}

exports.Handle = Handle;
