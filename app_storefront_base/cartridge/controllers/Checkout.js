'use strict';

var server = require('server');
var locale = require('~/cartridge/scripts/middleware/locale');

var BasketMgr = require('dw/order/BasketMgr');
var HookMgr = require('dw/system/HookMgr');
var PaymentInstrument = require('dw/order/PaymentInstrument');
var PaymentMgr = require('dw/order/PaymentMgr');
var ShippingMgr = require('dw/order/ShippingMgr');
var Transaction = require('dw/system/Transaction');

var AddressModel = require('~/cartridge/models/address');
var BillingModel = require('~/cartridge/models/billing');
var Cart = require('~/cartridge/models/cart');
var OrderModel = require('~/cartridge/models/order');
var Payment = require('~/cartridge/models/payment');
var ProductLineItemModel = require('~/cartridge/models/productLineItems');
var ShippingModel = require('~/cartridge/models/shipping');
var TotalsModel = require('~/cartridge/models/totals');

/**
 * Main entry point for Checkout
 */
server.get('Start', locale, function (req, res, next) {
    var applicablePaymentCards;
    var applicablePaymentMethods;
    var countryCode = req.geolocation.countryCode;
    var currentBasket = BasketMgr.getCurrentBasket();
    var currentCustomer = req.currentCustomer.raw;
    var billingAddress = currentBasket.billingAddress;
    var paymentAmount = currentBasket.totalGrossPrice;
    var paymentInstruments;
    var shipment = currentBasket.defaultShipment;
    var shippingAddress = shipment.shippingAddress;
    var shipmentShippingModel;

    // models
    var billingAddressModel;
    var billingModel;
    var orderModel;
    var orderTotals;
    var paymentModel;
    var productLineItemModel;
    var shippingAddressModel;
    var shippingModel;

    shipmentShippingModel = ShippingMgr.getShipmentShippingModel(
        currentBasket.defaultShipment
    );
    shippingAddressModel = new AddressModel(shippingAddress);
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
    billingModel = new BillingModel(billingAddressModel, paymentModel);

    productLineItemModel = new ProductLineItemModel(currentBasket);
    orderTotals = new TotalsModel(currentBasket);

    var shippingForm = server.forms.getForm('singleShipping');
    var billingForm = server.forms.getForm('payment');

    orderModel = new OrderModel(
        currentBasket,
        shippingModel,
        billingModel,
        orderTotals,
        productLineItemModel
    );

    var forms = {
        shippingForm: shippingForm,
        billingForm: billingForm
    };

    res.render('checkout/checkout', { order: orderModel, forms: forms });
    next();
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
        if (form[key] instanceof Object) {
            if (form[key].valid === false) {
                result[key] = form[key].valid;
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
        'postal',
        'country',
        'states'
    ];

    return validateFields(form, formKeys);
}

/**
 * Validate credit card form fields
 * @param {Object} form - the form object with pre-validated form fields
 * @returns {Object} the names of the invalid form fields
 */
function validateCreditCard(form) {
    var formKeys = [
        'cardNumber',
        'expirationYear',
        'expirationMonth',
        'securityCode',
        'email',
        'phone'
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
        'postal',
        'country',
        'states'
    ];

    return validateFields(form, formKeys);
}

/**
 * Handle Ajax shipping form submit
 */
server.post('SubmitShipping', function (req, res, next) {
    this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
        var form = server.forms.getForm('singleShipping');
        var shippingFormErrors;
        var result;

        // verify shipping form data
        shippingFormErrors = validateShippingForm(form);

        if (Object.keys(shippingFormErrors).length === 0) {
            var currentBasket = BasketMgr.getCurrentOrNewBasket();
            var billingAddress = currentBasket.billingAddress;
            var orderTotals;
            var shipment = currentBasket.defaultShipment;
            var shippingAddress = shipment.shippingAddress;
            var shippingAddressModel;
            var shippingModel;
            var shipmentShippingModel;
            var shippingMethodID = form.shippingAddress.shippingMethodID.value.toString();

            Transaction.wrap(function () {
                if (shippingAddress === null) {
                    shippingAddress = shipment.createShippingAddress();
                }

                shippingAddress.setFirstName(form.shippingAddress.addressFields.firstName.value);
                shippingAddress.setLastName(form.shippingAddress.addressFields.lastName.value);
                shippingAddress.setAddress1(form.shippingAddress.addressFields.address1.value);
                shippingAddress.setAddress2(form.shippingAddress.addressFields.address2.value);
                shippingAddress.setCity(form.shippingAddress.addressFields.city.value);
                shippingAddress.setPostalCode(form.shippingAddress.addressFields.postal.value);
                // Not getting selected state value
                shippingAddress.setStateCode(form.shippingAddress.addressFields.states.state.value);
                shippingAddress.setCountryCode(form.shippingAddress.addressFields.country.value);
                shippingAddress.setPhone(form.shippingAddress.addressFields.phone.value);


                if (form.shippingAddress.shippingAddressUseAsBillingAddress.value === true) {
                    if (!billingAddress) {
                        billingAddress = currentBasket.createBillingAddress();
                    }

                    billingAddress.setFirstName(form.shippingAddress.addressFields.firstName.value);
                    billingAddress.setLastName(form.shippingAddress.addressFields.lastName.value);
                    billingAddress.setAddress1(form.shippingAddress.addressFields.address1.value);
                    billingAddress.setAddress2(form.shippingAddress.addressFields.address2.value);
                    billingAddress.setCity(form.shippingAddress.addressFields.city.value);
                    billingAddress.setPostalCode(form.shippingAddress.addressFields.postal.value);
                    // Not getting selected state value
                    billingAddress.setStateCode(
                        form.shippingAddress.addressFields.states.state.value);
                    billingAddress.setCountryCode(form.shippingAddress.addressFields.country.value);
                    billingAddress.setPhone(form.shippingAddress.addressFields.phone.value);
                }
            });

            if (shippingMethodID !== shipment.shippingMethod.ID) {
                Transaction.wrap(function () {
                    ShippingModel.selectShippingMethod(shipment, shippingMethodID);
                    HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
                });
            }

            shippingAddressModel = new AddressModel(shippingAddress);
            shipmentShippingModel = ShippingMgr.getShipmentShippingModel(shipment);
            shippingModel = new ShippingModel(shipment, shipmentShippingModel,
                shippingAddressModel);

            orderTotals = new TotalsModel(currentBasket);

            result = {
                totals: orderTotals,
                shippingData: shippingModel,
                form: server.forms.getForm('singleShipping')
            };
        } else {
            result = {
                form: server.forms.getForm('singleShipping'),
                shippingFormErrors: shippingFormErrors
            };
        }

        res.json(result);
    });

    next();
});

/**
 *  Handle Ajax payment (and billing) form submit
 */

server.post('SubmitPayment', function (req, res, next) {
    this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
        var form = server.forms.getForm('payment');
        var billingFormErrors = {};
        var creditCardErrors;

        // verify billing form data
        // TODO: read from form object above (seems like boolean bug for checkbox)
        if (!req.form.billingSameAsShipping && req.form.billingSameAsShipping !== 'on') {
            billingFormErrors = validateBillingForm(form);
        }

        // verify credit card form data
        creditCardErrors = validateCreditCard(form);

        //
        // respond with form data and errors
        //
        res.json({
            form: server.forms.getForm('payment'),
            billingFormErrors: billingFormErrors,
            creditCardErrors: creditCardErrors
        });
    });
    next();
});

server.get('UpdateShippingMethodsList', function (req, res, next) {
    var address = {
        postalCode: req.querystring.postal,
        stateCode: req.querystring.state
    };
    var applicableShippingMethods;
    var currentBasket = BasketMgr.getCurrentBasket();
    var orderTotals;
    var shipment = currentBasket.defaultShipment;
    var shipmentShippingModel;
    var shippingAddressModel;
    var shippingModel;

    shipmentShippingModel = ShippingMgr.getShipmentShippingModel(shipment);
    applicableShippingMethods = shipmentShippingModel.getApplicableShippingMethods(address);

    Transaction.wrap(function () {
        ShippingModel.selectShippingMethod(shipment, null, applicableShippingMethods, address);
        HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
    });

    orderTotals = new TotalsModel(currentBasket);

    shippingAddressModel = new AddressModel(address);
    shippingModel = new ShippingModel(shipment, shipmentShippingModel, shippingAddressModel);

    res.json({
        totals: orderTotals,
        shipping: shippingModel,
        shippingForm: server.forms.getForm('singleShipping')
    });
    next();
});

module.exports = server.exports();
