'use strict';

var server = require('server');

var BasketMgr = require('dw/order/BasketMgr');
var HookMgr = require('dw/system/HookMgr');
var Resource = require('dw/web/Resource');
var PaymentMgr = require('dw/order/PaymentMgr');
var Transaction = require('dw/system/Transaction');

var AddressModel = require('~/cartridge/models/address');
var BillingModel = require('~/cartridge/models/billing');
var OrderModel = require('~/cartridge/models/order');
var PaymentModel = require('~/cartridge/models/payment');
var ShippingModel = require('~/cartridge/models/shipping');
var ProductLineItemsModel = require('~/cartridge/models/productLineItems');
var TotalsModel = require('~/cartridge/models/totals');

var URLUtils = require('dw/web/URLUtils');
var UUIDUtils = require('dw/util/UUIDUtils');

var ShippingHelper = require('~/cartridge/scripts/checkout/shippingHelpers');

var COHelpers = require('~/cartridge/scripts/checkout/checkoutHelpers');

var Collections = require('~/cartridge/scripts/util/collections');

/**
 * Main entry point for Checkout
 */

server.get('Login', server.middleware.https, function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();
    if (!currentBasket) {
        res.redirect(URLUtils.url('Cart-Show'));
        return next();
    }

    if (req.currentCustomer.profile) {
        res.redirect(URLUtils.url('Checkout-Start'));
    } else {
        var rememberMe = false;
        var userName = '';
        var actionUrl = URLUtils.url('Account-Login', 'checkoutLogin', true);
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
    return next();
});


server.get('Get', server.middleware.https, function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();
    var basketModel = new OrderModel(currentBasket);

    res.json(basketModel);

    next();
});


server.post('ToggleMultiShip', server.middleware.https, function (req, res, next) {
    /** vvv Extract to server.middleware for all Checkout / Ajax functions **/
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
    /** ^^^ Extract to middleware for all Checkout / Ajax functinos **/

    var shipments = currentBasket.shipments;
    var defaultShipment = currentBasket.defaultShipment;
    var usingMultiShipping = !req.session.privacyCache.get('usingMultiShipping');

    req.session.privacyCache.set('usingMultiShipping', usingMultiShipping);

    if (!usingMultiShipping && shipments.length > 1) {
        // Make sure we move all product line items back to the default shipment
        Transaction.wrap(function () {
            Collections.forEach(shipments, function (shipment, index) {
                if (index > 0) {
                    Collections.forEach(shipment.productLineItems, function (pli) {
                        pli.setShipment(defaultShipment);
                    });
                    currentBasket.removeShipment(shipment);
                }
            });

            HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
        });
    }

    var basketModel = new OrderModel(currentBasket, {
        usingMultiShipping: usingMultiShipping
    });

    res.json({
        order: basketModel
    });

    next();
});

server.post('SelectShippingMethod', server.middleware.https, function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();

    if (!currentBasket) {
        res.json({
            error: true,
            redirectUrl: URLUtils.url('Cart-Show').toString()
        });
        return next();
    }

    var shipmentUUID = req.querystring.shipmentUUID || req.form.shipmentUUID;
    var shippingMethodID = req.querystring.methodID || req.form.methodID;
    var shipment;
    if (shipmentUUID) {
        shipment = ShippingHelper.getShipmentByUUID(currentBasket, shipmentUUID);
    } else {
        shipment = currentBasket.defaultShipment;
    }

    var address = {
        firstName: req.querystring.firstName || req.form.firstName,
        lastName: req.querystring.lastName || req.form.lastName,
        address1: req.querystring.address1 || req.form.address1,
        address2: req.querystring.address2 || req.form.address2,
        city: req.querystring.city || req.form.city,
        stateCode: req.querystring.stateCode || req.form.stateCode,
        postalCode: req.querystring.postalCode || req.form.postalCode,
        countryCode: req.querystring.countryCode || req.form.stateCode,
        phone: req.querystring.phone || req.form.phone
    };

    var error = false;

    Transaction.wrap(function () {
        try {
            var shippingAddress = shipment.shippingAddress;

            if (!shippingAddress) {
                shippingAddress = shipment.createShippingAddress();
            }

            Object.keys(address).forEach(function (key) {
                var value = address[key];
                if (value) {
                    shippingAddress[key] = value;
                } else {
                    shippingAddress[key] = null;
                }
            });

            ShippingHelper.selectShippingMethod(shipment, shippingMethodID);

            HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
        } catch (err) {
            error = err;
        }
    });

    if (!error) {
        var usingMultiShipping = req.session.privacyCache.get('usingMultiShipping');
        var basketModel = new OrderModel(currentBasket, {
            usingMultiShipping: usingMultiShipping
        });

        res.json({
            order: basketModel
        });
    } else {
        res.setStatusCode(500);
        res.json({
            errorMessage: Resource.msg('error.cannot.select.shipping.method', 'cart', null)
        });
    }
    return next();
});


server.post('UpdateShippingMethodsList', server.middleware.https, function (req, res, next) {
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

    var shipmentUUID = req.querystring.shipmentUUID || req.form.shipmentUUID;
    var shipment;
    if (shipmentUUID) {
        shipment = ShippingHelper.getShipmentByUUID(currentBasket, shipmentUUID);
    } else {
        shipment = currentBasket.defaultShipment;
    }

    var address = {
        firstName: req.querystring.firstName || req.form.firstName,
        lastName: req.querystring.lastName || req.form.lastName,
        address1: req.querystring.address1 || req.form.address1,
        address2: req.querystring.address2 || req.form.address2,
        city: req.querystring.city || req.form.city,
        stateCode: req.querystring.stateCode || req.form.stateCode,
        postalCode: req.querystring.postalCode || req.form.postalCode,
        countryCode: req.querystring.countryCode || req.form.countryCode,
        phone: req.querystring.phone || req.form.phone
    };

    var shippingMethodID;

    if (shipment.shippingMethod) {
        shippingMethodID = shipment.shippingMethod.ID;
    }

    Transaction.wrap(function () {
        var shippingAddress = shipment.shippingAddress;

        if (!shippingAddress) {
            shippingAddress = shipment.createShippingAddress();
        }

        Object.keys(address).forEach(function (key) {
            var value = address[key];
            if (value) {
                shippingAddress[key] = value;
            } else {
                shippingAddress[key] = null;
            }
        });

        ShippingHelper.selectShippingMethod(shipment, shippingMethodID);

        HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
    });

    var usingMultiShipping = req.session.privacyCache.get('usingMultiShipping');
    var basketModel = new OrderModel(currentBasket, {
        usingMultiShipping: usingMultiShipping
    });

    res.json({
        order: basketModel,
        shippingForm: server.forms.getForm('shipping')
    });

    return next();
});


server.post('CreateNewAddress', server.middleware.https, function (req, res, next) {
    var basket = BasketMgr.getCurrentBasket();
    if (!basket) {
        res.json({
            redirectUrl: URLUtils.url('Cart-Show').toString(),
            error: true
        });
        return next();
    }

    var pliUUID = req.form.productLineItemUUID || req.querystring.productLineItemUUID;
    var productLineItem = COHelpers.getProductLineItem(basket, pliUUID);
    var uuid = UUIDUtils.createUUID();
    var shipment;
    var result = {};
    var form = server.forms.getForm('shipping');

    try {
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
        result.shippingMethod = form.shippingAddress.shippingMethodID.value ?
            '' + form.shippingAddress.shippingMethodID.value : null;

        Transaction.wrap(function () {
            shipment = basket.createShipment(uuid);

            // No need to do form validation for shipment creation yet
            // Validate on nextStage() trigger or save()
            COHelpers.copyShippingAddressToShipment(result, shipment);
            productLineItem.setShipment(shipment);
            ShippingHelper.ensureShipmentHasMethod(shipment);
        });
    } catch (err) {
        res.json({
            redirectUrl: URLUtils.url('Checkout-Start').toString(),
            error: true
        });
        return next();
    }

    res.json({
        uuid: uuid,
        order: new OrderModel(basket)
    });
    return next();
});


server.post('AddNewAddress', server.middleware.https, function (req, res, next) {
    var pliUUID = req.form.productLineItemUUID;
    var shipmentUUID = req.form.shipmentSelector || req.form.shipmentUUID;
    var origUUID = req.form.originalShipmentUUID;

    var form = server.forms.getForm('shipping');
    var shippingFormErrors = COHelpers.validateShippingForm(form.shippingAddress.addressFields);
    var basket = BasketMgr.getCurrentBasket();
    var result = {};

    var usingMultiShipping = req.session.privacyCache.get('usingMultiShipping');

    if (Object.keys(shippingFormErrors).length > 0) {
        res.json({
            form: form,
            fieldErrors: shippingFormErrors,
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
        result.shippingMethod = form.shippingAddress.shippingMethodID.value ?
            '' + form.shippingAddress.shippingMethodID.value : null;

        if (!COHelpers.isShippingAddressInitialized()) {
            // First use always applies to defaultShipment
            COHelpers.copyShippingAddressToShipment(result, basket.defaultShipment);
        } else {
            try {
                Transaction.wrap(function () {
                    var shipment;
                    var removeOriginal = false;

                    if (origUUID === shipmentUUID) {
                        // An edit to the address or shipping method
                        shipment = ShippingHelper.getShipmentByUUID(basket, shipmentUUID);
                        COHelpers.copyShippingAddressToShipment(result, shipment);
                    } else {
                        var productLineItem = COHelpers.getProductLineItem(basket, pliUUID);
                        if (shipmentUUID === 'new') {
                            // Choosing a new address for this pli
                            if (origUUID === basket.defaultShipment.UUID
                                    && basket.defaultShipment.productLineItems.length === 1) {
                                // just replace the built-in one
                                shipment = basket.defaultShipment;
                            } else {
                                // or create a new shipment and associate the current pli (later)
                                shipment = basket.createShipment(UUIDUtils.createUUID());
                                removeOriginal = productLineItem.shipment;
                            }
                        } else {
                            // Choose an existing shipment for this PLI
                            shipment = ShippingHelper.getShipmentByUUID(basket, shipmentUUID);
                            removeOriginal = productLineItem.shipment;
                        }
                        COHelpers.copyShippingAddressToShipment(result, shipment);
                        productLineItem.setShipment(shipment);

                        // remove any
                        if (removeOriginal && removeOriginal.productLineItems.length === 0) {
                            basket.removeShipment(removeOriginal);
                        }
                    }
                });
            } catch (e) {
                result.error = e;
            }
        }

        COHelpers.recalculateBasket(basket);
        var basketModel = new OrderModel(basket, {
            usingMultiShipping: usingMultiShipping
        });

        res.json({
            form: form,
            data: result,
            order: basketModel,

            fieldErrors: [],
            serverErrors: [],
            error: false
        });
    }
    next();
});


// Main entry point for Checkout
server.get('Start', server.middleware.https, function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();
    if (!currentBasket) {
        res.redirect(URLUtils.url('Cart-Show'));
        return next();
    }

    var currentStage = req.querystring.stage ? req.querystring.stage : 'shipping';

    var billingAddress = currentBasket.billingAddress;
    var shippingAddress = currentBasket.defaultShipment.shippingAddress;
    var hasEquivalentAddress = true;

    var currentCustomer = req.currentCustomer.raw;
    var usingMultiShipping = req.session.privacyCache.get('usingMultiShipping');

    if (billingAddress && shippingAddress) {
        hasEquivalentAddress = billingAddress.isEquivalentAddress(shippingAddress);
    }

    // Calculate the basket
    COHelpers.recalculateBasket(currentBasket);

    var shippingForm = COHelpers.prepareShippingForm(currentBasket);
    var billingForm = COHelpers.prepareBillingForm(currentBasket);

    var orderModel = new OrderModel(currentBasket, {
        customer: currentCustomer,
        currencyCode: req.geolocation.countryCode,
        usingMultiShipping: usingMultiShipping
    });

    // Get rid of this from top-level ... should be part of OrderModel???
    var currentYear = new Date().getFullYear();
    var creditCardExpirationYears = [];

    for (var i = 0; i < 10; i++) {
        creditCardExpirationYears.push(currentYear + i);
    }

    res.render('checkout/checkout', {
        order: orderModel,
        forms: {
            shippingForm: shippingForm,
            billingForm: billingForm
        },
        expirationYears: creditCardExpirationYears,
        currentStage: currentStage,
        isEquivalentAddress: hasEquivalentAddress
    });
    return next();
});


/**
 * Handle Ajax shipping form submit
 */
server.post('SubmitShipping', server.middleware.https, function (req, res, next) {
    var form = server.forms.getForm('shipping');
    var shippingFormErrors;
    var result = {};

    // verify shipping form data
    shippingFormErrors = COHelpers.validateShippingForm(form.shippingAddress.addressFields);

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

            COHelpers.copyShippingAddressToShipment(shippingData, currentBasket.defaultShipment);
            COHelpers.recalculateBasket(currentBasket);

            var shippingModel = new ShippingModel(currentBasket.defaultShipment);

            var totalsModel = new TotalsModel(currentBasket);

            res.json({
                totals: totalsModel,
                shippingData: shippingModel,
                form: server.forms.getForm('shipping')
            });
        });
    }

    next();
});


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
        billingFormErrors = COHelpers.validateBillingForm(paymentForm.addressFields);
    }

    // verify credit card form data
    creditCardErrors = COHelpers.validateCreditCard(paymentForm);

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

            var paymentMethodID = billingData.paymentMethod.value;
            var result;
            var shippingAddress;

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
            var calculatedPaymentTransaction = COHelpers.calculatePaymentTransaction(currentBasket);

            if (calculatedPaymentTransaction.error) {
                res.json({
                    form: paymentForm,
                    fieldErrors: [],
                    serverErrors: [Resource.msg('error.technical', 'checkout', null)],
                    error: true
                });
                return;
            }

            var totalsModel = new TotalsModel(currentBasket);

            var countryCode = req.geolocation.countryCode;
            var currentCustomer = req.currentCustomer.raw;
            var paymentModel = new PaymentModel(currentBasket, currentCustomer, countryCode);

            var billingAddressModel = new AddressModel(billingAddress);
            var billingModel = new BillingModel(billingAddressModel, paymentModel);

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

    var isValidBasket = COHelpers.validateBasket(currentBasket);
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
    var validPayment = COHelpers.validatePayment(req, currentBasket);
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
    var calculatedPaymentTransactionTotal = COHelpers.calculatePaymentTransaction(currentBasket);
    if (calculatedPaymentTransactionTotal.error) {
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        return next();
    }

    // Creates a new order.
    var order = COHelpers.createOrder(currentBasket);
    if (!order) {
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        return next();
    }

    // Handles payment authorization
    var handlePaymentResult = COHelpers.handlePayments(order, order.orderNo);
    if (handlePaymentResult.error) {
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        return next();
    }

    // Places the order
    var placeOrderResult = COHelpers.placeOrder(order);
    if (placeOrderResult.error) {
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        return next();
    }

    COHelpers.sendConfirmationEmail(order);

    res.json({
        error: false,
        orderID: order.orderNo,
        continueUrl: URLUtils.url('Order-Confirm').toString()
    });

    return next();
});


module.exports = server.exports();
