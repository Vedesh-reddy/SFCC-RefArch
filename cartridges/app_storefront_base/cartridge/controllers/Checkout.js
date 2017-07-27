'use strict';

var server = require('server');

var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');

/**
 * Main entry point for Checkout
 */

server.get(
    'Login',
    server.middleware.https,
    csrfProtection.generateToken,
    function (req, res, next) {
        var BasketMgr = require('dw/order/BasketMgr');
        var ProductLineItemsModel = require('*/cartridge/models/productLineItems');
        var TotalsModel = require('*/cartridge/models/totals');
        var URLUtils = require('dw/web/URLUtils');
        var reportingUrls = require('*/cartridge/scripts/reportingUrls');

        var currentBasket = BasketMgr.getCurrentBasket();
        var reportingURLs;
        if (!currentBasket) {
            res.redirect(URLUtils.url('Cart-Show'));
            return next();
        }

        if (req.currentCustomer.profile) {
            res.redirect(URLUtils.url('Checkout-Begin'));
        } else {
            var rememberMe = false;
            var userName = '';
            var actionUrl = URLUtils.url('Account-Login', 'checkoutLogin', true);
            var totalsModel = new TotalsModel(currentBasket);
            var details = {
                subTotal: totalsModel.subTotal,
                totalQuantity: ProductLineItemsModel.getTotalQuantity(
                    currentBasket.productLineItems
                )
            };

            if (req.currentCustomer.credentials) {
                rememberMe = true;
                userName = req.currentCustomer.credentials.username;
            }

            reportingURLs = reportingUrls.getCheckoutReportingURLs(
                currentBasket.UUID,
                1,
                'CheckoutMethod'
            );

            res.render('/checkout/checkoutLogin', {
                rememberMe: rememberMe,
                userName: userName,
                actionUrl: actionUrl,
                details: details,
                reportingURLs: reportingURLs
            });
        }

        return next();
    }
);


server.get('Get', server.middleware.https, function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var AccountModel = require('*/cartridge/models/account');
    var OrderModel = require('*/cartridge/models/order');

    var currentBasket = BasketMgr.getCurrentBasket();
    var usingMultiShipping = req.session.privacyCache.get('usingMultiShipping');
    if (usingMultiShipping === true && currentBasket.shipments.length < 2) {
        req.session.privacyCache.set('usingMultiShipping', false);
        usingMultiShipping = false;
    }

    var basketModel = new OrderModel(currentBasket, { usingMultiShipping: usingMultiShipping });

    res.json({
        order: basketModel,
        customer: new AccountModel(req.currentCustomer)
    });

    next();
});


server.post('ToggleMultiShip', server.middleware.https, function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var HookMgr = require('dw/system/HookMgr');
    var Transaction = require('dw/system/Transaction');
    var AccountModel = require('*/cartridge/models/account');
    var OrderModel = require('*/cartridge/models/order');
    var URLUtils = require('dw/web/URLUtils');
    var collections = require('*/cartridge/scripts/util/collections');

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

    var shipments = currentBasket.shipments;
    var defaultShipment = currentBasket.defaultShipment;
    var usingMultiShipping = req.form.usingMultiShip === 'true';

    req.session.privacyCache.set('usingMultiShipping', usingMultiShipping);

    if (!usingMultiShipping && shipments.length > 1) {
        // Make sure we move all product line items back to the default shipment
        Transaction.wrap(function () {
            collections.forEach(shipments, function (shipment) {
                if (!shipment.default) {
                    collections.forEach(shipment.productLineItems, function (pli) {
                        pli.setShipment(defaultShipment);
                    });
                    currentBasket.removeShipment(shipment);
                }
            });
            COHelpers.ensureNoEmptyShipments(req);

            HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
        });
    }

    var basketModel = new OrderModel(currentBasket, {
        usingMultiShipping: usingMultiShipping
    });

    res.json({
        customer: new AccountModel(req.currentCustomer),
        order: basketModel
    });

    next();
});

server.post('SelectShippingMethod', server.middleware.https, function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var HookMgr = require('dw/system/HookMgr');
    var Resource = require('dw/web/Resource');
    var Transaction = require('dw/system/Transaction');
    var AccountModel = require('*/cartridge/models/account');
    var OrderModel = require('*/cartridge/models/order');
    var URLUtils = require('dw/web/URLUtils');
    var ShippingHelper = require('*/cartridge/scripts/checkout/shippingHelpers');

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

    var address = ShippingHelper.getAddressFromRequest(req);

    var error;

    try {
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
    } catch (err) {
        error = err;
    }

    if (error) {
        res.setStatusCode(500);
        res.json({
            error: true,
            errorMessage: Resource.msg('error.cannot.select.shipping.method', 'cart', null)
        });
    } else {
        var usingMultiShipping = req.session.privacyCache.get('usingMultiShipping');
        var basketModel = new OrderModel(currentBasket, {
            usingMultiShipping: usingMultiShipping
        });

        res.json({
            customer: new AccountModel(req.currentCustomer),
            order: basketModel
        });
    }
    return next();
});


server.post('UpdateShippingMethodsList', server.middleware.https, function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var HookMgr = require('dw/system/HookMgr');
    var Transaction = require('dw/system/Transaction');
    var AccountModel = require('*/cartridge/models/account');
    var OrderModel = require('*/cartridge/models/order');
    var URLUtils = require('dw/web/URLUtils');
    var ShippingHelper = require('*/cartridge/scripts/checkout/shippingHelpers');

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

    var address = ShippingHelper.getAddressFromRequest(req);

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
        customer: new AccountModel(req.currentCustomer),
        order: basketModel,
        shippingForm: server.forms.getForm('shipping')
    });

    return next();
});


server.post('CreateNewAddress', server.middleware.https, function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var Transaction = require('dw/system/Transaction');
    var AccountModel = require('*/cartridge/models/account');
    var OrderModel = require('*/cartridge/models/order');
    var URLUtils = require('dw/web/URLUtils');
    var UUIDUtils = require('dw/util/UUIDUtils');
    var ShippingHelper = require('*/cartridge/scripts/checkout/shippingHelpers');

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

    try {
        Transaction.wrap(function () {
            shipment = basket.createShipment(uuid);
            productLineItem.setShipment(shipment);
            ShippingHelper.ensureShipmentHasMethod(shipment);
        });
        Transaction.wrap(function () {
            COHelpers.ensureNoEmptyShipments(req);
            COHelpers.recalculateBasket(basket);
        });
    } catch (err) {
        res.json({
            redirectUrl: URLUtils.url('Checkout-Begin').toString(),
            error: true
        });
        return next();
    }

    res.json({
        uuid: uuid,
        customer: new AccountModel(req.currentCustomer),
        order: new OrderModel(basket)
    });
    return next();
});

server.post('ResetInventoryList', server.middleware.https, function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var Transaction = require('dw/system/Transaction');

    var currentBasket = BasketMgr.getCurrentBasket();
    var pli;
    var plis = currentBasket.defaultShipment.productLineItems;

    Transaction.wrap(function () {
        currentBasket.defaultShipment.setShippingMethod(null);

        for (var i = 0, ii = plis.length; i < ii; i++) {
            pli = plis[i];
            pli.custom.fromStoreId = null;
            pli.setProductInventoryList(null);
        }
    });

    res.json({});

    next();
});


server.post(
    'AddNewAddress',
    server.middleware.https,
    csrfProtection.validateAjaxRequest,
    function (req, res, next) {
        var BasketMgr = require('dw/order/BasketMgr');
        var Transaction = require('dw/system/Transaction');
        var AccountModel = require('*/cartridge/models/account');
        var OrderModel = require('*/cartridge/models/order');
        var UUIDUtils = require('dw/util/UUIDUtils');
        var ShippingHelper = require('*/cartridge/scripts/checkout/shippingHelpers');

        var data = res.getViewData();
        if (data && data.csrfError) {
            res.json();
            return next();
        }

        var pliUUID = req.form.productLineItemUUID;
        var shipmentUUID = req.form.shipmentSelector || req.form.shipmentUUID;
        var origUUID = req.form.originalShipmentUUID;

        var form = server.forms.getForm('shipping');
        var shippingFormErrors = COHelpers.validateShippingForm(form.shippingAddress.addressFields);
        var basket = BasketMgr.getCurrentBasket();
        var result = {};

        var usingMultiShipping = req.session.privacyCache.get('usingMultiShipping');

        if (Object.keys(shippingFormErrors).length > 0) {
            if (shipmentUUID === 'new') {
                req.session.privacyCache.set(origUUID, 'invalid');
            } else {
                req.session.privacyCache.set(shipmentUUID, 'invalid');
            }
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
                postalCode: form.shippingAddress.addressFields.postalCode.value,
                countryCode: form.shippingAddress.addressFields.country.value,
                phone: form.shippingAddress.addressFields.phone.value
            };

            if (Object.prototype.hasOwnProperty
                .call(form.shippingAddress.addressFields, 'states')) {
                result.address.stateCode =
                    form.shippingAddress.addressFields.states.stateCode.value;
            }

            result.shippingBillingSame =
                form.shippingAddress.shippingAddressUseAsBillingAddress.value;

            result.shippingMethod =
                form.shippingAddress.shippingMethodID.value ?
                '' + form.shippingAddress.shippingMethodID.value : null;

            var shipment;

            if (!COHelpers.isShippingAddressInitialized()) {
                // First use always applies to defaultShipment
                COHelpers.copyShippingAddressToShipment(result, basket.defaultShipment);
            } else {
                try {
                    Transaction.wrap(function () {
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
                                    // create a new shipment and associate the current pli (later)
                                    shipment = basket.createShipment(UUIDUtils.createUUID());
                                }
                            } else if (shipmentUUID.indexOf('ab_') === 0) {
                                shipment = basket.createShipment(UUIDUtils.createUUID());
                            } else {
                                // Choose an existing shipment for this PLI
                                shipment = ShippingHelper.getShipmentByUUID(basket, shipmentUUID);
                            }
                            COHelpers.copyShippingAddressToShipment(result, shipment);
                            productLineItem.setShipment(shipment);

                            COHelpers.ensureNoEmptyShipments(req);
                        }
                    });
                } catch (e) {
                    result.error = e;
                }
            }

            if (shipment && shipment.UUID) {
                req.session.privacyCache.set(shipment.UUID, 'valid');
            }

            // Loop through all shipments and make sure all are valid
            var isValid;
            var allValid = true;
            for (var i = 0, ii = basket.shipments.length; i < ii; i++) {
                isValid = req.session.privacyCache.get(basket.shipments[i].UUID);
                if (isValid !== 'valid') {
                    allValid = false;
                    break;
                }
            }

            if (!basket.billingAddress) {
                if (req.currentCustomer.addressBook
                    && req.currentCustomer.addressBook.preferredAddress) {
                    // Copy over preferredAddress (use addressUUID for matching)
                    COHelpers.copyBillingAddressToBasket(
                        req.currentCustomer.addressBook.preferredAddress);
                } else if (!COHelpers.isPickUpInStore(basket)) {
                    // Copy over first shipping address (use shipmentUUID for matching)
                    COHelpers.copyBillingAddressToBasket(basket.defaultShipment.shippingAddress);
                }
            }

            COHelpers.recalculateBasket(basket);
            var basketModel = new OrderModel(basket, {
                usingMultiShipping: usingMultiShipping,
                shippable: allValid
            });

            var accountModel = new AccountModel(req.currentCustomer);

            res.json({
                form: form,
                data: result,
                order: basketModel,
                customer: accountModel,

                fieldErrors: [],
                serverErrors: [],
                error: false
            });
        }

        return next();
    }
);


// Main entry point for Checkout
server.get(
    'Begin',
    server.middleware.https,
    csrfProtection.generateToken,
    function (req, res, next) {
        var BasketMgr = require('dw/order/BasketMgr');
        var Transaction = require('dw/system/Transaction');
        var AccountModel = require('*/cartridge/models/account');
        var OrderModel = require('*/cartridge/models/order');
        var URLUtils = require('dw/web/URLUtils');
        var Site = require('dw/system/Site');
        var StoreHelpers = require('*/cartridge/scripts/helpers/storeHelpers');
        var reportingUrls = require('*/cartridge/scripts/reportingUrls');

        var currentBasket = BasketMgr.getCurrentBasket();
        if (!currentBasket) {
            res.redirect(URLUtils.url('Cart-Show'));
            return next();
        }

        var currentStage = req.querystring.stage ? req.querystring.stage : 'shipping';

        var billingAddress = currentBasket.billingAddress;
        var shippingAddress = currentBasket.defaultShipment.shippingAddress;

        var currentCustomer = req.currentCustomer.raw;
        var usingMultiShipping = req.session.privacyCache.get('usingMultiShipping');
        var preferredAddress;

        // only true if customer is registered
        if (req.currentCustomer.addressBook && req.currentCustomer.addressBook.preferredAddress) {
            preferredAddress = req.currentCustomer.addressBook.preferredAddress;
            if (!shippingAddress) {
                COHelpers.copyCustomerAddressToShipment(preferredAddress);
                req.session.privacyCache.set(currentBasket.defaultShipment.UUID, 'valid');
            }
            if (!billingAddress) {
                COHelpers.copyCustomerAddressToBilling(preferredAddress);
            }
        }

        // Calculate the basket
        Transaction.wrap(function () {
            COHelpers.ensureNoEmptyShipments(req);
        });
        COHelpers.recalculateBasket(currentBasket);

        var shippingForm = COHelpers.prepareShippingForm(currentBasket);
        var billingForm = COHelpers.prepareBillingForm(currentBasket);

        if (preferredAddress) {
            shippingForm.copyFrom(preferredAddress);
            billingForm.copyFrom(preferredAddress);
        }

        // Loop through all shipments and make sure all are valid
        var isValid;
        var allValid = true;
        for (var i = 0, ii = currentBasket.shipments.length; i < ii; i++) {
            isValid = req.session.privacyCache.get(currentBasket.shipments[i].UUID);
            if (isValid !== 'valid') {
                allValid = false;
                break;
            }
        }

        var orderModel = new OrderModel(currentBasket, {
            customer: currentCustomer,
            currencyCode: req.geolocation.countryCode,
            usingMultiShipping: usingMultiShipping,
            shippable: allValid
        });

        // Get rid of this from top-level ... should be part of OrderModel???
        var currentYear = new Date().getFullYear();
        var creditCardExpirationYears = [];

        for (var j = 0; j < 10; j++) {
            creditCardExpirationYears.push(currentYear + j);
        }

        var accountModel = new AccountModel(req.currentCustomer);

        var storesModel = StoreHelpers.getModel(req);
        var plis = currentBasket.productLineItems;
        storesModel.availableStores = StoreHelpers.getFilteredStores(storesModel, plis);

        var pickupEnabled = Site.getCurrent().getCustomPreferenceValue('enableStorePickUp');
        var reportingURLs;
        reportingURLs = reportingUrls.getCheckoutReportingURLs(
            currentBasket.UUID,
            2,
            'Shipping'
        );

        res.render('checkout/checkout', {
            stores: storesModel,
            order: orderModel,
            customer: accountModel,
            forms: {
                shippingForm: shippingForm,
                billingForm: billingForm
            },
            expirationYears: creditCardExpirationYears,
            currentStage: currentStage,
            pickUpInStoreEnabled: pickupEnabled,
            reportingURLs: reportingURLs
        });

        return next();
    }
);


/**
 * Handle Ajax shipping form submit
 */
server.post(
    'SubmitShipping',
    server.middleware.https,
    csrfProtection.validateAjaxRequest,
    function (req, res, next) {
        var BasketMgr = require('dw/order/BasketMgr');
        var Transaction = require('dw/system/Transaction');
        var URLUtils = require('dw/web/URLUtils');

        var data = res.getViewData();
        if (data && data.csrfError) {
            res.json();
            return next();
        }

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

        var form = server.forms.getForm('shipping');
        var result = {};

        // verify shipping form data
        var shippingFormErrors = COHelpers.validateShippingForm(form.shippingAddress.addressFields);

        if (Object.keys(shippingFormErrors).length > 0) {
            req.session.privacyCache.set(currentBasket.defaultShipment.UUID, 'invalid');

            res.json({
                form: form,
                fieldErrors: [shippingFormErrors],
                serverErrors: [],
                error: true
            });
        } else {
            req.session.privacyCache.set(currentBasket.defaultShipment.UUID, 'valid');

            result.address = {
                firstName: form.shippingAddress.addressFields.firstName.value,
                lastName: form.shippingAddress.addressFields.lastName.value,
                address1: form.shippingAddress.addressFields.address1.value,
                address2: form.shippingAddress.addressFields.address2.value,
                city: form.shippingAddress.addressFields.city.value,
                postalCode: form.shippingAddress.addressFields.postalCode.value,
                countryCode: form.shippingAddress.addressFields.country.value,
                phone: form.shippingAddress.addressFields.phone.value
            };
            if (Object.prototype.hasOwnProperty
                .call(form.shippingAddress.addressFields, 'states')) {
                result.address.stateCode =
                    form.shippingAddress.addressFields.states.stateCode.value;
            }

            result.shippingBillingSame =
                form.shippingAddress.shippingAddressUseAsBillingAddress.value;

            result.shippingMethod = form.shippingAddress.shippingMethodID.value
                ? form.shippingAddress.shippingMethodID.value.toString()
                : null;

            res.setViewData(result);

            this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
                var AccountModel = require('*/cartridge/models/account');
                var OrderModel = require('*/cartridge/models/order');
                var ProductInventoryMgr = require('dw/catalog/ProductInventoryMgr');
                var StoreMgr = require('dw/catalog/StoreMgr');

                var shippingData = res.getViewData();
                var storeID = req.form.storeID;
                var plis = currentBasket.defaultShipment.productLineItems;
                var pli;

                if (storeID) {
                    var store = StoreMgr.getStore(storeID);
                    var storeinventory = ProductInventoryMgr.getInventoryList(
                        store.custom.inventoryListId
                    );

                    Transaction.wrap(function () {
                        for (var i = 0, ii = plis.length; i < ii; i++) {
                            pli = plis[i];
                            pli.custom.fromStoreId = storeID;
                            pli.setProductInventoryList(storeinventory);
                        }
                    });
                }

                COHelpers.copyShippingAddressToShipment(
                    shippingData,
                    currentBasket.defaultShipment
                );

                if (!currentBasket.billingAddress) {
                    if (req.currentCustomer.addressBook
                        && req.currentCustomer.addressBook.preferredAddress) {
                        // Copy over preferredAddress (use addressUUID for matching)
                        COHelpers.copyBillingAddressToBasket(
                            req.currentCustomer.addressBook.preferredAddress);
                    } else if (!COHelpers.isPickUpInStore(currentBasket)) {
                        // Copy over first shipping address (use shipmentUUID for matching)
                        COHelpers.copyBillingAddressToBasket(
                            currentBasket.defaultShipment.shippingAddress);
                    }
                }
                var usingMultiShipping = req.session.privacyCache.get('usingMultiShipping');
                if (usingMultiShipping === true && currentBasket.shipments.length < 2) {
                    req.session.privacyCache.set('usingMultiShipping', false);
                    usingMultiShipping = false;
                }

                COHelpers.recalculateBasket(currentBasket);

                var basketModel = new OrderModel(currentBasket, {
                    usingMultiShipping: usingMultiShipping,
                    shippable: true
                });

                res.json({
                    customer: new AccountModel(req.currentCustomer),
                    order: basketModel,
                    form: server.forms.getForm('shipping')
                });
            });
        }

        return next();
    }
);

/**
 *  Handle Ajax payment (and billing) form submit
 */
server.post(
    'SubmitPayment',
    server.middleware.https,
    csrfProtection.validateAjaxRequest,
    function (req, res, next) {
        var data = res.getViewData();
        if (data && data.csrfError) {
            res.json();
            return next();
        }
        var paymentForm = server.forms.getForm('billing');
        var billingFormErrors = {};
        var creditCardErrors = {};
        var viewData = {};

        // verify billing form data
        billingFormErrors = COHelpers.validateBillingForm(paymentForm.addressFields);

        if (!req.form.storedPaymentUUID) {
            // verify credit card form data
            creditCardErrors = COHelpers.validateCreditCard(paymentForm);
        }


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
                postalCode: { value: paymentForm.addressFields.postalCode.value },
                countryCode: { value: paymentForm.addressFields.country.value }
            };

            if (Object.prototype.hasOwnProperty
                .call(paymentForm.addressFields, 'states')) {
                viewData.address.stateCode =
                    { value: paymentForm.addressFields.states.stateCode.value };
            }

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
                    value: parseInt(
                        paymentForm.creditCardFields.expirationMonth.selectedOption,
                        10
                    ),
                    htmlName: paymentForm.creditCardFields.expirationMonth.htmlName
                },
                expirationYear: {
                    value: parseInt(paymentForm.creditCardFields.expirationYear.value, 10),
                    htmlName: paymentForm.creditCardFields.expirationYear.htmlName
                }
            };

            if (req.form.storedPaymentUUID) {
                viewData.storedPaymentUUID = req.form.storedPaymentUUID;
            }

            viewData.email = {
                value: paymentForm.creditCardFields.email.value
            };

            viewData.phone = { value: paymentForm.creditCardFields.phone.value };

            viewData.saveCard = paymentForm.creditCardFields.saveCard.checked;

            res.setViewData(viewData);

            this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
                var BasketMgr = require('dw/order/BasketMgr');
                var CustomerMgr = require('dw/customer/CustomerMgr');
                var HookMgr = require('dw/system/HookMgr');
                var Resource = require('dw/web/Resource');
                var PaymentMgr = require('dw/order/PaymentMgr');
                var Transaction = require('dw/system/Transaction');
                var AccountModel = require('*/cartridge/models/account');
                var OrderModel = require('*/cartridge/models/order');
                var URLUtils = require('dw/web/URLUtils');
                var array = require('*/cartridge/scripts/util/array');

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

                Transaction.wrap(function () {
                    if (!billingAddress) {
                        billingAddress = currentBasket.createBillingAddress();
                    }

                    billingAddress.setFirstName(billingData.address.firstName.value);
                    billingAddress.setLastName(billingData.address.lastName.value);
                    billingAddress.setAddress1(billingData.address.address1.value);
                    billingAddress.setAddress2(billingData.address.address2.value);
                    billingAddress.setCity(billingData.address.city.value);
                    billingAddress.setPostalCode(billingData.address.postalCode.value);
                    if (Object.prototype.hasOwnProperty.call(billingData.address, 'stateCode')) {
                        billingAddress.setStateCode(billingData.address.stateCode.value);
                    }
                    billingAddress.setCountryCode(billingData.address.countryCode.value);

                    if (billingData.storedPaymentUUID) {
                        billingAddress.setPhone(req.currentCustomer.profile.phone);
                        currentBasket.setCustomerEmail(req.currentCustomer.profile.email);
                    } else {
                        billingAddress.setPhone(billingData.phone.value);
                        currentBasket.setCustomerEmail(billingData.email.value);
                    }
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
                    throw new Error(Resource.msg(
                        'error.payment.processor.missing',
                        'checkout',
                        null
                    ));
                }

                var processor = PaymentMgr.getPaymentMethod(paymentMethodID).getPaymentProcessor();

                if (billingData.storedPaymentUUID
                    && req.currentCustomer.raw.authenticated
                    && req.currentCustomer.raw.registered
                ) {
                    var paymentInstruments = req.currentCustomer.wallet.paymentInstruments;
                    var paymentInstrument = array.find(paymentInstruments, function (item) {
                        return billingData.storedPaymentUUID === item.UUID;
                    });

                    billingData.paymentInformation.cardNumber.value = paymentInstrument
                        .creditCardNumber;
                    billingData.paymentInformation.cardType.value = paymentInstrument
                        .creditCardType;
                    billingData.paymentInformation.securityCode.value = req.form.securityCode;
                    billingData.paymentInformation.expirationMonth.value = paymentInstrument
                        .creditCardExpirationMonth;
                    billingData.paymentInformation.expirationYear.value = paymentInstrument
                        .creditCardExpirationYear;
                    billingData.paymentInformation.creditCardToken = paymentInstrument
                        .raw.creditCardToken;
                }

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

                if (!billingData.storedPaymentUUID
                    && req.currentCustomer.raw.authenticated
                    && req.currentCustomer.raw.registered
                    && billingData.saveCard
                    && (paymentMethodID === 'CREDIT_CARD')
                ) {
                    var customer = CustomerMgr.getCustomerByCustomerNumber(
                        req.currentCustomer.profile.customerNo
                    );

                    var saveCardResult = COHelpers.savePaymentInstrumentToWallet(
                        billingData,
                        currentBasket,
                        customer
                    );

                    req.currentCustomer.wallet.paymentInstruments.push({
                        creditCardHolder: saveCardResult.creditCardHolder,
                        maskedCreditCardNumber: saveCardResult.maskedCreditCardNumber,
                        creditCardType: saveCardResult.creditCardType,
                        creditCardExpirationMonth: saveCardResult.creditCardExpirationMonth,
                        creditCardExpirationYear: saveCardResult.creditCardExpirationYear,
                        UUID: saveCardResult.UUID,
                        creditCardNumber: Object.hasOwnProperty.call(
                            saveCardResult,
                            'creditCardNumber'
                        )
                            ? saveCardResult.creditCardNumber
                            : null,
                        raw: saveCardResult
                    });
                }

                // Calculate the basket
                Transaction.wrap(function () {
                    HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
                });

                // Re-calculate the payments.
                var calculatedPaymentTransaction = COHelpers.calculatePaymentTransaction(
                    currentBasket
                );

                if (calculatedPaymentTransaction.error) {
                    res.json({
                        form: paymentForm,
                        fieldErrors: [],
                        serverErrors: [Resource.msg('error.technical', 'checkout', null)],
                        error: true
                    });
                    return;
                }

                var usingMultiShipping = req.session.privacyCache.get('usingMultiShipping');
                if (usingMultiShipping === true && currentBasket.shipments.length < 2) {
                    req.session.privacyCache.set('usingMultiShipping', false);
                    usingMultiShipping = false;
                }
                var basketModel = new OrderModel(currentBasket, {
                    usingMultiShipping: usingMultiShipping
                });

                var accountModel = new AccountModel(req.currentCustomer);
                var renderedStoredPaymentInstrument = COHelpers.getRenderedPaymentInstruments(
                    req,
                    accountModel
                );

                res.json({
                    renderedPaymentInstruments: renderedStoredPaymentInstrument,
                    customer: accountModel,
                    order: basketModel,
                    form: server.forms.getForm('billing'),
                    error: false
                });
            });
        }
        return next();
    }
);


server.post('PlaceOrder', server.middleware.https, function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var HookMgr = require('dw/system/HookMgr');
    var Resource = require('dw/web/Resource');
    var Transaction = require('dw/system/Transaction');
    var URLUtils = require('dw/web/URLUtils');

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

    var validationBasketStatus = HookMgr.callHook(
        'app.validate.basket',
        'validateBasket',
        currentBasket,
        false
    );
    if (validationBasketStatus.error) {
        res.json({
            error: true,
            errorMessage: validationBasketStatus.message
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

    // Reset usingMultiShip after successful Order placement
    req.session.privacyCache.set('usingMultiShipping', false);

    // TODO: Exposing a direct route to an Order, without at least encoding the orderID
    //  is a serious PII violation.  It enables looking up every customers orders, one at a
    //  time.
    res.json({
        error: false,
        orderID: order.orderNo,
        orderToken: order.orderToken,
        continueUrl: URLUtils.url('Order-Confirm').toString()
    });

    return next();
});


module.exports = server.exports();
