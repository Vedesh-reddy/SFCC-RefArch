'use strict';

var server = require('server');

var helper = require('~/cartridge/scripts/dwHelpers');

var BasketMgr = require('dw/order/BasketMgr');
var HashMap = require('dw/util/HashMap');
var HookMgr = require('dw/system/HookMgr');
var Mail = require('dw/net/Mail');
var OrderMgr = require('dw/order/OrderMgr');
var PaymentInstrument = require('dw/order/PaymentInstrument');
var PaymentMgr = require('dw/order/PaymentMgr');
var ProductInventoryMgr = require('dw/catalog/ProductInventoryMgr');
var Resource = require('dw/web/Resource');
var ShippingMgr = require('dw/order/ShippingMgr');
var Site = require('dw/system/Site');
var StoreMgr = require('dw/catalog/StoreMgr');
var Template = require('dw/util/Template');
var Transaction = require('dw/system/Transaction');

var AddressModel = require('~/cartridge/models/address');
var BillingModel = require('~/cartridge/models/billing');
var OrderModel = require('~/cartridge/models/order');
var Payment = require('~/cartridge/models/payment');
var ProductLineItemsModel = require('~/cartridge/models/productLineItems');
var ShippingModel = require('~/cartridge/models/shipping');
var TotalsModel = require('~/cartridge/models/totals');
var URLUtils = require('dw/web/URLUtils');

var orderHelpers = require('~/cartridge/scripts/placeOrderHelpers');

/**
 * Main entry point for Checkout
 */

server.get('Login', server.middleware.https, function (req, res, next) {
    if (req.currentCustomer.profile) {
        res.redirect(URLUtils.url('Checkout-Start'));
    } else {
        var rememberMe = false;
        var userName = '';
        var actionUrl = URLUtils.url('Account-Login', 'checkoutLogin', true);
        var currentBasket = BasketMgr.getCurrentBasket();
        var totalsModel = new TotalsModel(currentBasket);
        var details = {
            subTotal: totalsModel.subTotal,
            totalQuantity: ProductLineItemsModel.getTotalQuantity(currentBasket.allProductLineItems)
        };

        if (req.currentCustomer.credentials) {
            rememberMe = true;
            userName = req.currentCustomer.credentials.username;
        }
        res.render('/checkout/checkoutLogin', {
            rememberMe: rememberMe,
            userName: userName,
            actionUrl: actionUrl,
            details: details
        });
    }
    next();
});

server.get('Start', server.middleware.https, function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();

    if (!currentBasket) {
        res.redirect(URLUtils.url('Cart-Show'));
        return next();
    }
    var applicablePaymentCards;
    var applicablePaymentMethods;
    var countryCode = req.geolocation.countryCode;
    var currentCustomer = req.currentCustomer.raw;
    var currentStage = req.querystring.stage ? req.querystring.stage : 'shipping';
    var billingAddress = currentBasket.billingAddress;
    var hasEquivalentAddress = true;
    var paymentAmount = currentBasket.totalGrossPrice;
    var paymentInstruments;
    var shipment = currentBasket.defaultShipment;
    var shippingAddress = shipment.shippingAddress;
    var shipmentShippingModel;
    var shippingForm = server.forms.getForm('singleShipping');
    var billingForm = server.forms.getForm('billing');

    // models
    var billingAddressModel;
    var billingModel;
    var orderModel;
    var totalsModel;
    var paymentModel;
    var productLineItemsModel;
    var shippingAddressModel;
    var shippingModel;

    shippingForm.clear();
    billingForm.clear();

    if (billingAddress && shippingAddress) {
        hasEquivalentAddress = billingAddress.isEquivalentAddress(shippingAddress);
    }

    // Calculate the basket
    Transaction.wrap(function () {
        HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
    });

    shipmentShippingModel = ShippingMgr.getShipmentShippingModel(
        currentBasket.defaultShipment
    );
    shippingAddressModel = new AddressModel(shippingAddress);

    if (shippingAddress && shippingAddressModel.address) {
        shippingForm.copyFrom(shippingAddressModel.address);
    }

    shippingModel = new ShippingModel(
        currentBasket.defaultShipment,
        shipmentShippingModel,
        shippingAddressModel
    );

    applicablePaymentMethods = PaymentMgr.getApplicablePaymentMethods(
        currentCustomer,
        countryCode,
        paymentAmount.value
    );

    applicablePaymentCards = PaymentMgr.getPaymentMethod(PaymentInstrument.METHOD_CREDIT_CARD)
        .getApplicablePaymentCards(currentCustomer, countryCode, paymentAmount.value);

    paymentInstruments = currentBasket.paymentInstruments;

    paymentModel = new Payment(applicablePaymentMethods,
        applicablePaymentCards,
        paymentInstruments
    );

    billingAddressModel = new AddressModel(billingAddress);

    if (!hasEquivalentAddress && billingAddress && billingAddressModel.address) {
        billingForm.copyFrom(billingAddressModel.address);
    }

    if (paymentModel.selectedPaymentInstruments) {
        paymentModel.selectedPaymentInstruments.forEach(function (item) {
            billingForm.copyFrom(item);
        });
    }

    if (billingAddressModel.address) {
        billingForm.creditCardFields.phone.value = billingAddressModel.address.phone;
    }

    if (currentBasket.customerEmail) {
        billingForm.creditCardFields.email.value = currentBasket.customerEmail;
    }

    billingModel = new BillingModel(billingAddressModel, paymentModel);

    productLineItemsModel = new ProductLineItemsModel(currentBasket);
    totalsModel = new TotalsModel(currentBasket);
    var config = {
        numberOfLineItems: '*'
    };

    var modelsObject = {
        billingModel: billingModel,
        shippingModel: shippingModel,
        totalsModel: totalsModel,
        productLineItemsModel: productLineItemsModel
    };

    orderModel = new OrderModel(currentBasket, modelsObject, config);

    var currentYear = new Date().getFullYear();
    var creditCardExpirationYears = [];

    for (var i = 0; i < 10; i++) {
        creditCardExpirationYears.push(currentYear + i);
    }

    var forms = {
        shippingForm: shippingForm,
        billingForm: billingForm
    };

    res.render('checkout/checkout', {
        order: orderModel,
        forms: forms,
        expirationYears: creditCardExpirationYears,
        currentStage: currentStage,
        isEquivalentAddress: hasEquivalentAddress
    });
    return next();
});

/**
 * Validate billing form
 * @param {Object} form - the form object with pre-validated form fields
 * @param {Array} formKeys - the name of the form fields to validate in form
 * @returns {Object} the names of the invalid form fields
 */
function validateFields(form, formKeys) {
    var result = {};

    //
    // Look for invalid form fields
    //
    formKeys.forEach(function (key) {
        var item;
        if (key.indexOf('.')) {
            // nested property
            item = form;
            var properties = key.split('.');
            properties.forEach(function (property) {
                item = item[property];
            });
        } else {
            item = form[key];
        }
        if (item instanceof Object) {
            if (item.valid === false) {
                result[item.htmlName] = Resource.msg(item.error, 'address', null);
            }
        }
    });

    return result;
}

/**
 * Validate billing form fields
 * @param {Object} form - the form object with pre-validated form fields
 * @param {Array} fields - the fields to validate
 * @returns {Object} the names of the invalid form fields
 */
function validateBillingForm(form) {
    var formKeys = [
        'firstName',
        'lastName',
        'address1',
        'address2',
        'city',
        'postalCode',
        'country',
        'states.stateCode'
    ];

    return validateFields(form, formKeys);
}

/**
 * Validate credit card form fields
 * @param {Object} form - the form object with pre-validated form fields
 * @returns {Object} the names of the invalid form fields
 */
function validateCreditCard(form) {
    var result = {};
    var currentBasket = BasketMgr.getCurrentBasket();

    if (!form.paymentMethod.value) {
        if (currentBasket.totalGrossPrice.value > 0) {
            result[form.paymentMethod.htmlName] =
                Resource.msg('error.no.selected.payment.method', 'creditCard', null);
        }

        return result;
    }

    var formKeys = [
        'creditCardFields.cardNumber',
        'creditCardFields.expirationYear',
        'creditCardFields.expirationMonth',
        'creditCardFields.securityCode',
        'creditCardFields.email',
        'creditCardFields.phone'
    ];

    return validateFields(form, formKeys);
}

/**
 * Validate billing form fields
 * @param {Object} form - the form object with pre-validated form fields
 * @param {Array} fields - the fields to validate
 * @returns {Object} the names of the invalid form fields
 */
function validateShippingForm(form) {
    var formKeys = [
        'firstName',
        'lastName',
        'address1',
        'address2',
        'city',
        'postalCode',
        'country',
        'phone',
        'states.stateCode'
    ];

    return validateFields(form, formKeys);
}

/**
 * Handle Ajax shipping form submit
 */
server.post('SubmitShipping', server.middleware.https, function (req, res, next) {
    var form = server.forms.getForm('singleShipping');
    var shippingFormErrors;
    var result = {};

    // verify shipping form data
    shippingFormErrors = validateShippingForm(form.shippingAddress.addressFields);

    if (Object.keys(shippingFormErrors).length > 0) {
        res.json({
            form: form,
            fieldErrors: [shippingFormErrors],
            serverErrors: [],
            error: true
        });
    } else {
        result.address = {
            firstName: form.shippingAddress.addressFields.firstName.value,
            lastName: form.shippingAddress.addressFields.lastName.value,
            address1: form.shippingAddress.addressFields.address1.value,
            address2: form.shippingAddress.addressFields.address2.value,
            city: form.shippingAddress.addressFields.city.value,
            stateCode: form.shippingAddress.addressFields.states.stateCode.value,
            postalCode: form.shippingAddress.addressFields.postalCode.value,
            countryCode: form.shippingAddress.addressFields.country.value,
            phone: form.shippingAddress.addressFields.phone.value
        };

        result.shippingBillingSame = form.shippingAddress.shippingAddressUseAsBillingAddress.value;
        result.shippingMethod = form.shippingAddress.shippingMethodID.value.toString();

        res.setViewData(result);

        this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
            var shippingData = res.getViewData();

            var currentBasket = BasketMgr.getCurrentBasket();

            if (!currentBasket) {
                res.json({
                    error: true,
                    cartError: true,
                    fieldErrors: [],
                    serverErrors: [],
                    redirectUrl: URLUtils.url('Cart-Show').toString()
                });
                return;
            }

            var billingAddress = currentBasket.billingAddress;
            var totalsModel;
            var shipment = currentBasket.defaultShipment;
            var shippingAddress = shipment.shippingAddress;
            var shippingAddressModel;
            var shippingModel;
            var shipmentShippingModel;

            Transaction.wrap(function () {
                if (shippingAddress === null) {
                    shippingAddress = shipment.createShippingAddress();
                }

                shippingAddress.setFirstName(shippingData.address.firstName);
                shippingAddress.setLastName(shippingData.address.lastName);
                shippingAddress.setAddress1(shippingData.address.address1);
                shippingAddress.setAddress2(shippingData.address.address2);
                shippingAddress.setCity(shippingData.address.city);
                shippingAddress.setPostalCode(shippingData.address.postalCode);
                shippingAddress.setStateCode(shippingData.address.stateCode);
                shippingAddress.setCountryCode(shippingData.address.countryCode);
                shippingAddress.setPhone(shippingData.address.phone);

                if (shippingData.shippingBillingSame === true) {
                    if (!billingAddress) {
                        billingAddress = currentBasket.createBillingAddress();
                    }

                    billingAddress.setFirstName(shippingData.address.firstName);
                    billingAddress.setLastName(shippingData.address.lastName);
                    billingAddress.setAddress1(shippingData.address.address1);
                    billingAddress.setAddress2(shippingData.address.address2);
                    billingAddress.setCity(shippingData.address.city);
                    billingAddress.setPostalCode(shippingData.address.postalCode);
                    billingAddress.setStateCode(shippingData.address.stateCode);
                    billingAddress.setCountryCode(shippingData.address.countryCode);
                    if (!billingAddress.phone) {
                        billingAddress.setPhone(shippingData.address.phone);
                    }
                }
            });

            // Calculate the basket
            Transaction.wrap(function () {
                HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
            });

            shippingAddressModel = new AddressModel(shippingAddress);
            shipmentShippingModel = ShippingMgr.getShipmentShippingModel(shipment);
            shippingModel = new ShippingModel(
                shipment,
                shipmentShippingModel,
                shippingAddressModel
            );

            totalsModel = new TotalsModel(currentBasket);

            res.json({
                totals: totalsModel,
                shippingData: shippingModel,
                form: server.forms.getForm('singleShipping')
            });
        });
    }

    next();
});

/**
 * Sets the payment transaction amount
 * @param {dw.order.Basket} currentBasket - The current basket
 * @returns {Object} an error object
 */
function calculatePaymentTransaction(currentBasket) {
    var result = { error: false };

    try {
        Transaction.wrap(function () {
            // TODO: This function will need to account for gift certificates at a later date
            var orderTotal = currentBasket.totalGrossPrice;
            var paymentInstrument = currentBasket.paymentInstrument;
            paymentInstrument.paymentTransaction.setAmount(orderTotal);
        });
    } catch (e) {
        result.error = true;
    }

    return result;
}

/**
 *  Handle Ajax payment (and billing) form submit
 */
server.post('SubmitPayment', server.middleware.https, function (req, res, next) {
    var paymentForm = server.forms.getForm('billing');
    var billingFormErrors = {};
    var creditCardErrors;
    var viewData = {};

    // verify billing form data
    if (!paymentForm.shippingAddressUseAsBillingAddress.value) {
        billingFormErrors = validateBillingForm(paymentForm.addressFields);
    }

    // verify credit card form data
    creditCardErrors = validateCreditCard(paymentForm);

    if (Object.keys(creditCardErrors).length || Object.keys(billingFormErrors).length) {
        // respond with form data and errors
        res.json({
            form: paymentForm,
            fieldErrors: [billingFormErrors, creditCardErrors],
            serverErrors: [],
            error: true
        });
    } else {
        viewData.address = {
            firstName: { value: paymentForm.addressFields.firstName.value },
            lastName: { value: paymentForm.addressFields.lastName.value },
            address1: { value: paymentForm.addressFields.address1.value },
            address2: { value: paymentForm.addressFields.address2.value },
            city: { value: paymentForm.addressFields.city.value },
            stateCode: { value: paymentForm.addressFields.states.stateCode.value },
            postalCode: { value: paymentForm.addressFields.postalCode.value },
            countryCode: { value: paymentForm.addressFields.country.value }
        };

        viewData.shippingAddressUseAsBillingAddress = {
            value: paymentForm.shippingAddressUseAsBillingAddress.value
        };

        viewData.paymentMethod = {
            value: paymentForm.paymentMethod.value,
            htmlName: paymentForm.paymentMethod.value
        };

        viewData.paymentInformation = {
            cardType: {
                value: paymentForm.creditCardFields.cardType.value,
                htmlName: paymentForm.creditCardFields.cardType.htmlName
            },
            cardNumber: {
                value: paymentForm.creditCardFields.cardNumber.value,
                htmlName: paymentForm.creditCardFields.cardNumber.htmlName
            },
            securityCode: {
                value: paymentForm.creditCardFields.securityCode.value,
                htmlName: paymentForm.creditCardFields.securityCode.htmlName
            },
            expirationMonth: {
                value: paymentForm.creditCardFields.expirationMonth.selectedOption,
                htmlName: paymentForm.creditCardFields.expirationMonth.htmlName
            },
            expirationYear: {
                value: paymentForm.creditCardFields.expirationYear.value,
                htmlName: paymentForm.creditCardFields.expirationYear.htmlName
            }
        };

        viewData.email = {
            value: paymentForm.creditCardFields.email.value
        };

        viewData.phone = { value: paymentForm.creditCardFields.phone.value };

        res.setViewData(viewData);

        this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
            var currentBasket = BasketMgr.getCurrentBasket();

            if (!currentBasket) {
                res.json({
                    error: true,
                    cartError: true,
                    fieldErrors: [],
                    serverErrors: [],
                    redirectUrl: URLUtils.url('Cart-Show').toString()
                });
                return;
            }

            var billingAddress = currentBasket.billingAddress;
            var billingData = res.getViewData();
            var paymentInstruments;
            var paymentMethodID = billingData.paymentMethod.value;
            var result;
            var shippingAddress;

            var billingAddressModel;
            var billingModel;
            var paymentModel;

            Transaction.wrap(function () {
                // If checkbox isn't checked set billing address from form
                if (billingData.shippingAddressUseAsBillingAddress.value !== true) {
                    if (!billingAddress) {
                        billingAddress = currentBasket.createBillingAddress();
                    }

                    billingAddress.setFirstName(billingData.address.firstName.value);
                    billingAddress.setLastName(billingData.address.lastName.value);
                    billingAddress.setAddress1(billingData.address.address1.value);
                    billingAddress.setAddress2(billingData.address.address2.value);
                    billingAddress.setCity(billingData.address.city.value);
                    billingAddress.setPostalCode(billingData.address.postalCode.value);
                    billingAddress.setStateCode(billingData.address.stateCode.value);
                    billingAddress.setCountryCode(billingData.address.countryCode.value);
                }

                // if checkbox is not checked on shipping but checked on billing
                if (billingData.shippingAddressUseAsBillingAddress.value === true &&
                    (!billingAddress || !billingAddress.isEquivalentAddress(
                        currentBasket.defaultShipment.shippingAddress
                    ))) {
                    shippingAddress = currentBasket.defaultShipment.shippingAddress;
                    billingAddress = currentBasket.createBillingAddress();

                    billingAddress.setFirstName(shippingAddress.firstName);
                    billingAddress.setLastName(shippingAddress.lastName);
                    billingAddress.setAddress1(shippingAddress.address1);
                    billingAddress.setAddress2(shippingAddress.address2);
                    billingAddress.setCity(shippingAddress.city);
                    billingAddress.setPostalCode(shippingAddress.postalCode);
                    billingAddress.setStateCode(shippingAddress.stateCode);
                    billingAddress.setCountryCode(shippingAddress.countryCode);
                }

                billingAddress.setPhone(billingData.phone.value);
                currentBasket.setCustomerEmail(billingData.email.value);
            });

            // if there is no selected payment option and balance is greater than zero
            if (!paymentMethodID && currentBasket.totalGrossPrice.value > 0) {
                var noPaymentMethod = {};
                noPaymentMethod[billingData.paymentMethod.htmlName] =
                    Resource.msg('error.no.selected.payment.method', 'creditCard', null);

                res.json({
                    form: server.forms.getForm('billing'),
                    fieldErrors: [noPaymentMethod],
                    serverErrors: [],
                    error: true
                });
                return;
            }

            // check to make sure there is a payment processor
            if (!PaymentMgr.getPaymentMethod(paymentMethodID).paymentProcessor) {
                throw new Error(Resource.msg('error.payment.processor.missing', 'checkout', null));
            }

            var processor = PaymentMgr.getPaymentMethod(paymentMethodID).getPaymentProcessor();

            if (HookMgr.hasHook('app.payment.processor.' + processor.ID.toLowerCase())) {
                result = HookMgr.callHook('app.payment.processor.' + processor.ID.toLowerCase(),
                    'Handle',
                    currentBasket,
                    billingData.paymentInformation
                );
            } else {
                result = HookMgr.callHook('app.payment.processor.default', 'Handle');
            }

            // need to invalidate credit card fields
            if (result.error) {
                res.json({
                    form: server.forms.getForm('billing'),
                    fieldErrors: result.fieldErrors,
                    serverErrors: result.serverErrors,
                    error: true
                });
                return;
            }

            // Calculate the basket
            Transaction.wrap(function () {
                HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
            });

            // Re-calculate the payments.
            var calculatedPaymentTransactionTotal = calculatePaymentTransaction(currentBasket);
            if (calculatedPaymentTransactionTotal.error) {
                res.json({
                    form: paymentForm,
                    fieldErrors: [],
                    serverErrors: [Resource.msg('error.technical', 'checkout', null)],
                    error: true
                });
                return;
            }

            var totalsModel = new TotalsModel(currentBasket);

            paymentInstruments = currentBasket.paymentInstruments;
            paymentModel = new Payment(null, null, paymentInstruments);

            billingAddressModel = new AddressModel(billingAddress);
            billingModel = new BillingModel(billingAddressModel, paymentModel);

            var resource = {
                cardType: Resource.msg('msg.payment.type.credit', 'confirmation', null),
                cardEnding: Resource.msg('msg.card.type.ending', 'confirmation', null)
            };

            res.json({
                billingData: billingModel,
                orderEmail: currentBasket.customerEmail,
                totals: totalsModel,
                form: server.forms.getForm('billing'),
                resource: resource,
                error: false
            });
        });
    }
    next();
});

server.get('UpdateShippingMethodsList', server.middleware.https, function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();

    if (!currentBasket) {
        res.json({
            error: true,
            cartError: true,
            fieldErrors: [],
            serverErrors: [],
            redirectUrl: URLUtils.url('Cart-Show').toString()
        });
        return next();
    }

    var address = {
        postalCode: req.querystring.postal,
        stateCode: req.querystring.state
    };
    var applicableShippingMethods;
    var totalsModel;
    var shipment = currentBasket.defaultShipment;
    var shipmentShippingModel;
    var shippingAddressModel;
    var shippingModel;
    var shippingMethodID;

    if (shipment.shippingMethod) {
        shippingMethodID = shipment.shippingMethod.ID;
    }

    shipmentShippingModel = ShippingMgr.getShipmentShippingModel(shipment);
    applicableShippingMethods = shipmentShippingModel.getApplicableShippingMethods(address);

    Transaction.wrap(function () {
        ShippingModel.selectShippingMethod(
            shipment,
            shippingMethodID,
            applicableShippingMethods,
            address
        );
        HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
    });

    totalsModel = new TotalsModel(currentBasket);

    shippingAddressModel = new AddressModel(address);
    shippingModel = new ShippingModel(shipment, shipmentShippingModel, shippingAddressModel);

    res.json({
        totals: totalsModel,
        shipping: shippingModel,
        shippingForm: server.forms.getForm('singleShipping')
    });

    return next();
});

/**
 * Validates payment
 * @param {Object} req - The local instance of the request object
 * @param {dw.order.Basket} currentBasket - The current basket
 * @returns {Object} an object that has error information
 */
function validatePayment(req, currentBasket) {
    var applicablePaymentCards;
    var applicablePaymentMethods;
    var creditCardPaymentMethod = PaymentMgr.getPaymentMethod(PaymentInstrument.METHOD_CREDIT_CARD);
    var paymentAmount = currentBasket.totalGrossPrice.value;
    var countryCode = req.geolocation.countryCode;
    var currentCustomer = req.currentCustomer.raw;
    var paymentInstruments = currentBasket.paymentInstruments;
    var result = {};

    applicablePaymentMethods = PaymentMgr.getApplicablePaymentMethods(
        currentCustomer,
        countryCode,
        paymentAmount
    );
    applicablePaymentCards = creditCardPaymentMethod.getApplicablePaymentCards(
        currentCustomer,
        countryCode,
        paymentAmount
    );

    var invalid = true;

    for (var i = 0; i < paymentInstruments.length; i++) {
        var paymentInstrument = paymentInstruments[i];

        if (PaymentInstrument.METHOD_GIFT_CERTIFICATE.equals(paymentInstrument.paymentMethod)) {
            invalid = false;
        }

        var paymentMethod = PaymentMgr.getPaymentMethod(paymentInstrument.getPaymentMethod());

        if (paymentMethod && applicablePaymentMethods.contains(paymentMethod)) {
            if (PaymentInstrument.METHOD_CREDIT_CARD.equals(paymentInstrument.paymentMethod)) {
                var card = PaymentMgr.getPaymentCard(paymentInstrument.creditCardType);

                // Checks whether payment card is still applicable.
                if (card && applicablePaymentCards.contains(card)) {
                    invalid = false;
                }
            } else {
                invalid = false;
            }
        }

        if (invalid) {
            break; // there is an invalid payment instrument
        }
    }

    result.error = invalid;
    return result;
}

/**
 * Attempts to create an order from the current basket
 * @param {dw.order.Basket} currentBasket - The current basket
 * @returns {dw.order.Order} The order object created from the current basket
 */
function createOrder(currentBasket) {
    var order;

    try {
        order = Transaction.wrap(function () {
            return OrderMgr.createOrder(currentBasket);
        });
    } catch (error) {
        return null;
    }
    return order;
}

/**
 * handles the payment authorization for each payment instrument
 * @param {dw.order.Order} order - the order object
 * @param {string} orderNumber - The order number for the order
 * @returns {Object} an error object
 */
function handlePayments(order, orderNumber) {
    var result = {};

    if (order.totalNetPrice !== 0.00) {
        var paymentInstruments = order.paymentInstruments;

        if (paymentInstruments.length === 0) {
            Transaction.wrap(function () { OrderMgr.failOrder(order); });
            result.error = true;
        }

        if (!result.error) {
            for (var i = 0; i < paymentInstruments.length; i++) {
                var paymentInstrument = paymentInstruments[i];
                var paymentProcessor = PaymentMgr
                    .getPaymentMethod(paymentInstrument.paymentMethod)
                    .paymentProcessor;
                var authorizationResult;
                if (paymentProcessor === null) {
                    Transaction.begin();
                    paymentInstrument.paymentTransaction.setTransactionID(orderNumber);
                    Transaction.commit();
                } else {
                    if (HookMgr.hasHook('app.payment.processor.' +
                            paymentProcessor.ID.toLowerCase())) {
                        authorizationResult = HookMgr.callHook(
                            'app.payment.processor.' + paymentProcessor.ID.toLowerCase(),
                            'Authorize',
                            orderNumber,
                            paymentInstrument,
                            paymentProcessor
                        );
                    } else {
                        authorizationResult = HookMgr.callHook(
                            'app.payment.processor.default',
                            'Authorize'
                        );
                    }

                    if (authorizationResult.error) {
                        Transaction.wrap(function () { OrderMgr.failOrder(order); });
                        result.error = true;
                        break;
                    }
                }
            }
        }
    }

    return result;
}

/**
 * validates that the product line items are exist, are online, and have available inventory.
 * @param {dw.order.Basket} basket - The current user's basket
 * @returns {Object} an error object
 */
function validateProducts(basket) {
    var result = {
        error: false,
        hasInventory: true
    };
    var productLineItems = basket.productLineItems;

    helper.forEach(productLineItems, function (item) {
        if (item.product === null || !item.product.online) {
            result.error = true;
            return;
        }

        if (Object.hasOwnProperty.call(item.custom, 'fromStoreId')
            && item.custom.fromStoreId.length) {
            var store = StoreMgr.getStore(item.custom.fromStoreId);
            var storeInventory = ProductInventoryMgr.getInventoryList(store.custom.inventoryListId);

            result.hasInventory = result.hasInventory
                && (!storeInventory.getRecord(item.productID).length
                && storeInventory.getRecord(item.productID).ATS.value >= item.quantityValue);
        } else {
            var availabilityLevels = item.product.availabilityModel
                .getAvailabilityLevels(item.quantityValue);
            result.hasInventory = result.hasInventory
                && (availabilityLevels.notAvailable.value === 0);
        }
    });

    return result;
}

/**
 * validates the current users basket
 * @param {dw.order.Basket} basket - The current user's basket
 * @returns {Object} an error object
 */
function validateBasket(basket) {
    var result = { error: false };

    var productExistence = validateProducts(basket);
    if (productExistence.error || !productExistence.hasInventory) {
        result.error = true;
    } else if (!basket.productLineItems.length) {
        result.error = true;
    } else if (!basket.merchandizeTotalPrice.available) {
        result.error = true;
    }

    return result;
}

/**
 * Sends a confirmation to the current user
 * @param {dw.order.Order} order - The current user's order
 * @returns {void}
 */
function sendConfirmationEmail(order) {
    var confirmationEmail = new Mail();
    var context = new HashMap();
    var config = {
        numberOfLineItems: '*'
    };
    var orderModel = orderHelpers.buildOrderModel(order, config);

    var orderObject = { order: orderModel };

    confirmationEmail.addTo(order.customerEmail);
    confirmationEmail.setSubject(Resource.msg('subject.order.confirmation.email', 'order', null));
    confirmationEmail.setFrom(Site.current.getCustomPreferenceValue('customerServiceEmail')
        || 'no-reply@salesforce.com');

    Object.keys(orderObject).forEach(function (key) {
        context.put(key, orderObject[key]);
    });

    var template = new Template('checkout/confirmation/confirmationEmail');
    var content = template.render(context).text;
    confirmationEmail.setContent(content, 'text/html', 'UTF-8');
    confirmationEmail.send();
}

server.post('PlaceOrder', server.middleware.https, function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();

    if (!currentBasket) {
        res.json({
            error: true,
            cartError: true,
            fieldErrors: [],
            serverErrors: [],
            redirectUrl: URLUtils.url('Cart-Show').toString()
        });
        return next();
    }

    var order;
    var validPayment;
    var orderNumber;

    var isValidBasket = validateBasket(currentBasket);
    if (isValidBasket.error) {
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        return next();
    }

    // Check to make sure there is a shipping address
    if (currentBasket.defaultShipment.shippingAddress === null) {
        res.json({
            error: true,
            errorStage: {
                stage: 'shipping',
                step: 'address'
            },
            errorMessage: Resource.msg('error.no.shipping.address', 'checkout', null)
        });
        return next();
    }

    // Check to make sure billing address exists
    if (!currentBasket.billingAddress) {
        res.json({
            error: true,
            errorStage: {
                stage: 'payment',
                step: 'billingAddress'
            },
            errorMessage: Resource.msg('error.no.billing.address', 'checkout', null)
        });
        return next();
    }

    // Calculate the basket
    Transaction.wrap(function () {
        HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
    });

    // Re-validates existing payment instruments
    validPayment = validatePayment(req, currentBasket);
    if (validPayment.error) {
        res.json({
            error: true,
            errorStage: {
                stage: 'payment',
                step: 'paymentInstrument'
            },
            errorMessage: Resource.msg('error.payment.not.valid', 'checkout', null)
        });
        return next();
    }

    // Re-calculate the payments.
    var calculatedPaymentTransactionTotal = calculatePaymentTransaction(currentBasket);
    if (calculatedPaymentTransactionTotal.error) {
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        return next();
    }

    // Creates a new order.
    order = createOrder(currentBasket);
    if (!order) {
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        return next();
    }

    orderNumber = order.orderNo;

    // Handles payment authorization
    var handlePaymentResult = handlePayments(order, orderNumber);
    if (handlePaymentResult.error) {
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        return next();
    }

    // Places the order
    var placeOrderResult = orderHelpers.placeOrder(order);
    if (placeOrderResult.error) {
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        return next();
    }

    sendConfirmationEmail(order);

    var confirmationUrl = URLUtils.url('Order-Confirm').toString();

    res.json({ error: false, orderID: orderNumber, continueUrl: confirmationUrl });

    return next();
});

module.exports = server.exports();
