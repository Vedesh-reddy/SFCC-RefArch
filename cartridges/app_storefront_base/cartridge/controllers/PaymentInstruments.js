'use strict';

var server = require('server');
var helper = require('~/cartridge/scripts/dwHelpers');
var URLUtils = require('dw/web/URLUtils');
var CustomerMgr = require('dw/customer/CustomerMgr');
var Transaction = require('dw/system/Transaction');
var Resource = require('dw/web/Resource');
var PaymentMgr = require('dw/order/PaymentMgr');
var PaymentStatusCodes = require('dw/order/PaymentStatusCodes');

/**
 * Creates a list of address model for the logged in user
 * @param {Array} rawPaymentInstruments - current customer's payment instruments
 * @returns {List} a plain list of objects of the current customer's addresses
 */
function getList(rawPaymentInstruments) {
    var paymentInstruments;
    var length = rawPaymentInstruments.length;
    if (length) {
        paymentInstruments = helper.map(rawPaymentInstruments, function (rawPaymentInstrument) {
            return {
                creditCardHolder: rawPaymentInstrument.creditCardHolder,
                maskedCreditCardNumber: rawPaymentInstrument.maskedCreditCardNumber,
                creditCardType: rawPaymentInstrument.creditCardType,
                creditCardExpirationMonth: rawPaymentInstrument.creditCardExpirationMonth,
                creditCardExpirationYear: rawPaymentInstrument.creditCardExpirationYear,
                UUID: rawPaymentInstrument.UUID
            };
        });
    }
    return paymentInstruments;
}

/**
 * Checks if a credit card is valid or not
 * @param {Object} card - plain object with card details
 * @param {Object} form - form object
 * @param {Object} paymentInstruments - saved payment instruments of the customer
 * @param {string} UUID - UUID of the payment instrument
 * @returns {boolean} a boolean representing card validation
 */
function verifyCard(card, form, paymentInstruments, UUID) {
    var paymentCard = PaymentMgr.getPaymentCard(card.cardType);
    var error = false;
    var cardNumber = card.cardNumber;
    if (UUID && (!card.cardNumber)) {
        var payment = helper.find(paymentInstruments, function (paymentInstrument) {
            return card.UUID === paymentInstrument.UUID;
        });
        cardNumber = payment.creditCardNumber;
    }
    var creditCardStatus = paymentCard.verify(
        card.expirationMonth,
        card.expirationYear,
        cardNumber
    );
    if (creditCardStatus.error) {
        helper.forEach(creditCardStatus.items, function (item) {
            switch (item.code) {
                case PaymentStatusCodes.CREDITCARD_INVALID_CARD_NUMBER:
                    var formCardNumber = form.cardNumber;
                    formCardNumber.valid = false;
                    formCardNumber.error =
                        Resource.msg('error.message.creditnumber.invalid', 'forms', null);
                    error = true;
                    break;

                case PaymentStatusCodes.CREDITCARD_INVALID_EXPIRATION_DATE:
                    var expirationMonth = form.expirationMonth;
                    var expirationYear = form.expirationYear;
                    expirationMonth.valid = false;
                    expirationMonth.error =
                        Resource.msg('error.message.creditexpiration.expired', 'forms', null);
                    expirationYear.valid = false;
                    error = true;
                    break;
                default:
                    error = true;
            }
        });
    }
    return error;
}

/**
 * Creates an object from form values
 * @param {Object} paymentForm - form object
 * @param {string} UUID - UUID of the payment instrument
 * @returns {Object} a plain object of payment instrument
 */
function getDetailsObject(paymentForm, UUID) {
    return {
        name: paymentForm.cardOwner.value,
        cardNumber: UUID ? null : paymentForm.cardNumber.value,
        cardType: paymentForm.cardType.value,
        expirationMonth: paymentForm.expirationMonth.value,
        expirationYear: paymentForm.expirationYear.value,
        paymentForm: paymentForm,
        UUID: UUID
    };
}

/**
 * Creates a list of expiration years from the current year
 * @returns {List} a plain list of expiration years from current year
 */
function getExpirationYears() {
    var currentYear = new Date().getFullYear();
    var creditCardExpirationYears = [];
    for (var i = 0; i < 10; i++) {
        creditCardExpirationYears.push((currentYear + i).toString());
    }
    return creditCardExpirationYears;
}

server.get('List', function (req, res, next) {
    if (!req.currentCustomer.profile) {
        res.redirect(URLUtils.url('Login-Show'));
    } else {
        res.render('account/payment/payment', {
            paymentInstruments: getList(req.currentCustomer.wallet.paymentInstruments),
            actionUrl: URLUtils.url('PaymentInstruments-DeletePayment').toString(),
            breadcrumbs: [
                {
                    htmlValue: Resource.msg('global.home', 'common', null),
                    url: URLUtils.home().toString()
                },
                {
                    htmlValue: Resource.msg('page.title.myaccount', 'account', null),
                    url: URLUtils.url('Account-Show').toString()
                }
            ]
        });
    }
    next();
});

server.get('AddPayment', function (req, res, next) {
    var creditCardExpirationYears = getExpirationYears();
    var paymentForm = server.forms.getForm('creditcard');
    paymentForm.clear();
    var months = paymentForm.expirationMonth.options;
    for (var j = 0, k = months.length; j < k; j++) {
        months[j].selected = false;
    }
    res.render('account/payment/editaddpayment', {
        paymentForm: paymentForm,
        expirationYears: creditCardExpirationYears,
        breadcrumbs: [
            {
                htmlValue: Resource.msg('global.home', 'common', null),
                url: URLUtils.home().toString()
            },
            {
                htmlValue: Resource.msg('page.title.myaccount', 'account', null),
                url: URLUtils.url('Account-Show').toString()
            },
            {
                htmlValue: Resource.msg('page.heading.payments', 'payment', null),
                url: URLUtils.url('PaymentInstruments-List').toString()
            }
        ]
    });
    next();
});

server.get('EditPayment', function (req, res, next) {
    var creditCardExpirationYears = getExpirationYears();
    var paymentForm = server.forms.getForm('creditcard');
    paymentForm.clear();
    var UUID = req.querystring.UUID;
    var paymentInstruments = req.currentCustomer.wallet.paymentInstruments;
    var paymentToEdit = helper.find(paymentInstruments, function (paymentInstrument) {
        return UUID === paymentInstrument.UUID;
    });

    paymentForm.cardOwner.value = paymentToEdit.creditCardHolder;
    paymentForm.cardType.value = paymentToEdit.creditCardType;
    paymentForm.expirationYear.value = paymentToEdit.creditCardExpirationYear;
    paymentForm.editNumber.value = paymentToEdit.maskedCreditCardNumber;

    var months = paymentForm.expirationMonth.options;
    for (var j = 1, k = months.length; j < k; j++) {
        months[j].selected = false;
        if (months[j].value === paymentToEdit.creditCardExpirationMonth) {
            months[j].selected = true;
        }
    }
    res.render('account/payment/editaddpayment', {
        paymentForm: paymentForm,
        UUID: UUID,
        expirationYears: creditCardExpirationYears,
        breadcrumbs: [
            {
                htmlValue: Resource.msg('global.home', 'common', null),
                url: URLUtils.home().toString()
            },
            {
                htmlValue: Resource.msg('page.title.myaccount', 'account', null),
                url: URLUtils.url('Account-Show').toString()
            },
            {
                htmlValue: Resource.msg('page.heading.payments', 'payment', null),
                url: URLUtils.url('PaymentInstruments-List').toString()
            }
        ]
    });
    next();
});

server.post('SavePayment', function (req, res, next) {
    var formErrors = require('~/cartridge/scripts/formErrors');

    var UUID = req.querystring.UUID ? req.querystring.UUID : null;
    var paymentForm = server.forms.getForm('creditcard');
    var result = getDetailsObject(paymentForm, UUID);
    var paymentInstruments = req.currentCustomer.wallet.paymentInstruments;

    if (helper.find(paymentInstruments, function (instrument) {
        return instrument.creditCardNumber === result.cardNumber;
    })) {
        paymentForm.valid = false;
        paymentForm.cardNumber.valid = false;
        paymentForm.cardNumber.error =
            Resource.msg('error.message.creditnumber.exists', 'forms', null);
    }

    if (paymentForm.valid && !verifyCard(result, paymentForm, paymentInstruments, UUID)) {
        res.setViewData(result);
        this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
            var formInfo = res.getViewData();
            if (!UUID) {
                var customer = CustomerMgr.getCustomerByCustomerNumber(
                    req.currentCustomer.profile.customerNo
                );
                var wallet = customer.getProfile().getWallet();
                Transaction.wrap(function () {
                    var paymentInstrument = wallet.createPaymentInstrument('CREDIT_CARD');
                    paymentInstrument.setCreditCardHolder(formInfo.name);
                    paymentInstrument.setCreditCardNumber(formInfo.cardNumber);
                    paymentInstrument.setCreditCardType(formInfo.cardType);
                    paymentInstrument.setCreditCardExpirationMonth(formInfo.expirationMonth);
                    paymentInstrument.setCreditCardExpirationYear(formInfo.expirationYear);
                });
            } else {
                var paymentToEdit = helper.find(paymentInstruments, function (paymentInstrument) {
                    return formInfo.UUID === paymentInstrument.UUID;
                });
                Transaction.wrap(function () {
                    paymentToEdit.setCreditCardHolder(formInfo.name);
                    paymentToEdit.setCreditCardType(formInfo.cardType);
                    paymentToEdit.setCreditCardExpirationMonth(formInfo.expirationMonth);
                    paymentToEdit.setCreditCardExpirationYear(formInfo.expirationYear);
                });
            }
            res.json({
                success: true,
                redirectUrl: URLUtils.url('PaymentInstruments-List').toString()
            });
        });
    } else {
        res.json({
            success: false,
            fields: formErrors(paymentForm)
        });
    }
    next();
});

server.get('DeletePayment', function (req, res, next) {
    var UUID = req.querystring.UUID;
    var paymentInstruments = req.currentCustomer.wallet.paymentInstruments;
    var paymentToDelete = helper.find(paymentInstruments, function (paymentInstrument) {
        return UUID === paymentInstrument.UUID;
    });
    this.on('route:BeforeComplete', function () { // eslint-disable-line no-shadow
        var customer = CustomerMgr.getCustomerByCustomerNumber(
            req.currentCustomer.profile.customerNo
        );
        var wallet = customer.getProfile().getWallet();
        Transaction.wrap(function () {
            wallet.removePaymentInstrument(paymentToDelete);
        });
        if (wallet.getPaymentInstruments().length === 0) {
            res.json({
                UUID: UUID,
                message: Resource.msg('msg.no.saved.payments', 'payment', null)
            });
        } else {
            res.json({ UUID: UUID });
        }
    });
    next();
});

server.get('Header', server.middleware.include, function (req, res, next) {
    res.render('account/header', { name:
        req.currentCustomer.profile ? req.currentCustomer.profile.firstName : null
    });
    next();
});

server.get('Menu', server.middleware.include, function (req, res, next) {
    res.render('account/menu', { name:
        req.currentCustomer.profile ? req.currentCustomer.profile.firstName : null
    });
    next();
});

module.exports = server.exports();
