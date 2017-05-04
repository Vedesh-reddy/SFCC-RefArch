'use strict';

var server = require('server');

var Collections = require('~/cartridge/scripts/util/collections');
var Objects = require('~/cartridge/scripts/util/objects');

var BasketMgr = require('dw/order/BasketMgr');
var HashMap = require('dw/util/HashMap');
var HookMgr = require('dw/system/HookMgr');
var Mail = require('dw/net/Mail');
var OrderMgr = require('dw/order/OrderMgr');
var PaymentInstrument = require('dw/order/PaymentInstrument');
var PaymentMgr = require('dw/order/PaymentMgr');
var Order = require('dw/order/Order');
var Status = require('dw/system/Status');
var Resource = require('dw/web/Resource');
var Site = require('dw/system/Site');
var Template = require('dw/util/Template');
var Transaction = require('dw/system/Transaction');

var AddressModel = require('~/cartridge/models/address');
var OrderModel = require('~/cartridge/models/order');

var ShippingHelper = require('~/cartridge/scripts/checkout/shippingHelpers');


// static functions needed for Checkout Controller logic

var SHIPPING_FORM_MAP = {
    firstName: 'firstName',
    lastName: 'lastName',
    address1: 'address1',
    address2: 'address2',
    city: 'city',
    postalCode: 'postalCode',
    countryCode: 'country',
    phone: 'phone',
    stateCode: 'states.stateCode'
};

/**
 * Returns array of shipping form keys
 * @returns {string[]} the names of the invalid form fields
 */
function getShippingFormKeys() {
    return Objects.values(SHIPPING_FORM_MAP);
}

/**
 * Prepares the Shipping form
 * @returns {Object} processed Shipping form object
 */
function prepareShippingForm() {
    var shippingForm = server.forms.getForm('shipping');

    shippingForm.clear();

    return shippingForm;
}

/**
 * Prepares the Billing form
 * @returns {Object} processed Billing form object
 */
function prepareBillingForm() {
    var billingForm = server.forms.getForm('billing');
    billingForm.clear();

    return billingForm;
}

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
 * Validate shipping form fields
 * @param {Object} form - the form object with pre-validated form fields
 * @param {Array} fields - the fields to validate
 * @returns {Object} the names of the invalid form fields
 */
function validateShippingForm(form) {
    return validateFields(form, getShippingFormKeys());
}

/**
 * Checks to see if the shipping address is initialized
 * @param {dw.order.Shipment} [shipment] - Script API Shipment object
 * @returns {boolean} returns true if defaulShipment.shippingAddress is not null
 */
function isShippingAddressInitialized(shipment) {
    var currentBasket = BasketMgr.getCurrentBasket();
    var initialized = false;

    if (currentBasket) {
        if (shipment) {
            initialized = !!shipment.shippingAddress;
        } else {
            initialized = !!currentBasket.defaultShipment.shippingAddress;
        }
    }

    return initialized;
}

/**
 * Copies a CustomerAddress to a Shipment as its Shipping Address
 * @param {dw.customer.CustomerAddress} address - The customer address
 * @param {dw.order.Shipment} [shipmentOrNull] - The target shipment
 */
function copyCustomerAddressToShipment(address, shipmentOrNull) {
    var currentBasket = BasketMgr.getCurrentBasket();
    var shipment = shipmentOrNull || currentBasket.defaultShipment;
    var shippingAddress = shipment.shippingAddress;

    Transaction.wrap(function () {
        if (shippingAddress === null) {
            shippingAddress = shipment.createShippingAddress();
        }

        shippingAddress.setFirstName(address.firstName);
        shippingAddress.setLastName(address.lastName);
        shippingAddress.setAddress1(address.address1);
        shippingAddress.setAddress2(address.address2);
        shippingAddress.setCity(address.city);
        shippingAddress.setPostalCode(address.postalCode);
        shippingAddress.setStateCode(address.stateCode);
        var countryCode = address.countryCode;
        shippingAddress.setCountryCode(countryCode.value);
        shippingAddress.setPhone(address.phone);
    });
}

/**
 * Copies a CustomerAddress to a Basket as its Billing Address
 * @param {dw.customer.CustomerAddress} address - The customer address
 */
function copyCustomerAddressToBilling(address) {
    var currentBasket = BasketMgr.getCurrentBasket();
    var billingAddress = currentBasket.billingAddress;

    Transaction.wrap(function () {
        if (!billingAddress) {
            billingAddress = currentBasket.createBillingAddress();
        }

        billingAddress.setFirstName(address.firstName);
        billingAddress.setLastName(address.lastName);
        billingAddress.setAddress1(address.address1);
        billingAddress.setAddress2(address.address2);
        billingAddress.setCity(address.city);
        billingAddress.setPostalCode(address.postalCode);
        billingAddress.setStateCode(address.stateCode);
        var countryCode = address.countryCode;
        billingAddress.setCountryCode(countryCode.value);
        if (!billingAddress.phone) {
            billingAddress.setPhone(address.phone);
        }
    });
}

/**
 * Copies information from the shipping form to the associated shipping address
 * @param {Object} shippingData - the shipping data
 * @param {dw.order.Shipment} [shipmentOrNull] - the target Shipment
 */
function copyShippingAddressToShipment(shippingData, shipmentOrNull) {
    var currentBasket = BasketMgr.getCurrentBasket();
    var shipment = shipmentOrNull || currentBasket.defaultShipment;

    var shippingAddress = shipment.shippingAddress;

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

        ShippingHelper.selectShippingMethod(shipment, shippingData.shippingMethod);
    });
}

/**
 * Copies a raw address object to the baasket billing address
 * @param {Object} address - an address-similar Object (firstName, ...)
 */
function copyBillingAddressToBasket(address) {
    var currentBasket = BasketMgr.getCurrentBasket();
    var billingAddress = currentBasket.billingAddress;

    Transaction.wrap(function () {
        if (!billingAddress) {
            billingAddress = currentBasket.createBillingAddress();
        }

        billingAddress.setFirstName(address.firstName);
        billingAddress.setLastName(address.lastName);
        billingAddress.setAddress1(address.address1);
        billingAddress.setAddress2(address.address2);
        billingAddress.setCity(address.city);
        billingAddress.setPostalCode(address.postalCode);
        billingAddress.setStateCode(address.stateCode);
        billingAddress.setCountryCode(address.countryCode.value);
        if (!billingAddress.phone) {
            billingAddress.setPhone(address.phone);
        }
    });
}

/**
 * Returns the first non-default shipment with more than one product line item
 * @param {dw.order.Basket} currentBasket - The current Basket
 * @returns {dw.order.Shipment} - the shipment
 */
function getFirstNonDefaultShipmentWithProductLineItems(currentBasket) {
    var shipment;
    var match;

    for (var i = 0, ii = currentBasket.shipments.length; i < ii; i++) {
        shipment = currentBasket.shipments[i];
        if (!shipment.default && shipment.productLineItems.length > 0) {
            match = shipment;
            break;
        }
    }

    return match;
}

/**
 * Copies a raw address object to the baasket billing address
 * @param {Object} address - an address-similar Object (firstName, ...)
 */
function ensureNoEmptyShipments() {
    Transaction.wrap(function () {
        var currentBasket = BasketMgr.getCurrentBasket();

        var iter = currentBasket.shipments.iterator();
        var shipment;
        var shipmentsToDelete = [];

        while (iter.hasNext()) {
            shipment = iter.next();
            if (shipment.productLineItems.length < 1 && shipmentsToDelete.indexOf(shipment) < 0) {
                if (shipment.default) {
                    // Cant delete the defaultShipment
                    // Copy all line items from 2nd to first
                    var altShipment = getFirstNonDefaultShipmentWithProductLineItems(currentBasket);
                    if (!altShipment) return;

                    Collections.forEach(altShipment.productLineItems,
                        function (lineItem) {
                            lineItem.setShipment(currentBasket.defaultShipment);
                        });

                    if (altShipment.shippingAddress) {
                        // Copy from other address
                        var addressModel = new AddressModel(altShipment.shippingAddress);
                        copyShippingAddressToShipment(addressModel, currentBasket.defaultShipment);
                    } else {
                        // Or clear it out
                        currentBasket.defaultShipment.createShippingAddress();
                    }

                    currentBasket.defaultShipment.setShippingMethod(altShipment.shippingMethod);
                    // then delete 2nd one
                    shipmentsToDelete.push(altShipment);
                } else {
                    shipmentsToDelete.push(shipment);
                }
            }
        }

        for (var j = 0, jj = shipmentsToDelete.length; j < jj; j++) {
            currentBasket.removeShipment(shipmentsToDelete[j]);
        }
    });
}

/**
 * Recalculates the currentBasket
 * @param {dw.order.Basket} currentBasket - the target Basket
 */
function recalculateBasket(currentBasket) {
    // Calculate the basket
    Transaction.wrap(function () {
        HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
    });
}


/**
 * Finds and returns a ProductLineItem by UUID
 * @param {dw.order.Basket} currentBasket - the basket to search
 * @param {string} pliUUID - the target UUID
 * @returns {dw.order.ProductLineItem} the associated ProductLineItem
 */
function getProductLineItem(currentBasket, pliUUID) {
    var productLineItem;
    var pli;
    for (var i = 0, ii = currentBasket.productLineItems.length; i < ii; i++) {
        pli = currentBasket.productLineItems[i];
        if (pli.UUID === pliUUID) {
            productLineItem = pli;
            break;
        }
    }
    return productLineItem;
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
 * Sends a confirmation to the current user
 * @param {dw.order.Order} order - The current user's order
 * @returns {void}
 */
function sendConfirmationEmail(order) {
    var confirmationEmail = new Mail();
    var context = new HashMap();

    var orderModel = new OrderModel(order);

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

/**
 * Attempts to place the order
 * @param {dw.order.Order} order - The order object to be placed
 * @returns {Object} an error object
 */
function placeOrder(order) {
    var result = { error: false };

    try {
        Transaction.begin();
        var placeOrderStatus = OrderMgr.placeOrder(order);
        if (placeOrderStatus === Status.ERROR) {
            throw new Error();
        }
        order.setConfirmationStatus(Order.CONFIRMATION_STATUS_CONFIRMED);
        order.setExportStatus(Order.EXPORT_STATUS_READY);
        Transaction.commit();
    } catch (e) {
        Transaction.wrap(function () { OrderMgr.failOrder(order); });
        result.error = true;
    }

    return result;
}

module.exports = {
    ensureNoEmptyShipments: ensureNoEmptyShipments,
    getShippingFormKeys: getShippingFormKeys,
    getProductLineItem: getProductLineItem,
    isShippingAddressInitialized: isShippingAddressInitialized,
    prepareShippingForm: prepareShippingForm,
    prepareBillingForm: prepareBillingForm,
    copyCustomerAddressToShipment: copyCustomerAddressToShipment,
    copyCustomerAddressToBilling: copyCustomerAddressToBilling,
    copyShippingAddressToShipment: copyShippingAddressToShipment,
    copyBillingAddressToBasket: copyBillingAddressToBasket,
    validateFields: validateFields,
    validateShippingForm: validateShippingForm,
    validateBillingForm: validateBillingForm,
    validatePayment: validatePayment,
    validateCreditCard: validateCreditCard,
    calculatePaymentTransaction: calculatePaymentTransaction,
    recalculateBasket: recalculateBasket,
    handlePayments: handlePayments,
    createOrder: createOrder,
    placeOrder: placeOrder,
    sendConfirmationEmail: sendConfirmationEmail
};
