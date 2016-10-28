'use strict';

var server = require('server');
var locale = require('~/cartridge/scripts/middleware/locale');

var BasketMgr = require('dw/order/BasketMgr');
var ShippingMgr = require('dw/order/ShippingMgr');
var Transaction = require('dw/system/Transaction');

var AddressModel = require('~/cartridge/models/address');
var BillingModel = require('~/cartridge/models/billing');
var Cart = require('~/cartridge/models/cart');
var OrderModel = require('~/cartridge/models/order');
var Payment = require('~/cartridge/models/payment');
var PaymentInstrument = require('dw/order/PaymentInstrument');
var PaymentMgr = require('dw/order/PaymentMgr');
var ProductLineItemModel = require('~/cartridge/models/productLineItems');
var ShippingModel = require('~/cartridge/models/shipping');
var TotalsModel = require('~/cartridge/models/totals');

/**
 * Main entry point for Checkout
 */
server.get('Start', locale, function (req, res, next) {
    var applicablePaymentCards;
    var applicablePaymentMethods;
    var countryCode = 'US'; // req.geolocation.countryCode;
    var currentBasket = BasketMgr.getCurrentBasket();
    var currentCustomer = customer; // eslint-disable-line
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

    var shippingForm = server.forms.getForm('shippingaddress');
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
 * Handle Ajax shipping form submit
 */
server.post('SubmitShipping', function (req, res, next) {
    this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
        var form = server.forms.getForm('shippingaddress');

        var currentBasket = BasketMgr.getCurrentOrNewBasket();
        var shipment = currentBasket.defaultShipment;
        var shippingAddress = shipment.shippingAddress;
        var shippingAddressModel;
        var shippingModel;
        var shipmentShippingModel;

        Transaction.wrap(function () {
            if (shippingAddress === null) {
                shippingAddress = shipment.createShippingAddress();
            }

            shippingAddress.setFirstName(form.firstName.value);
            shippingAddress.setLastName(form.lastName.value);
            shippingAddress.setAddress1(form.address1.value);
            shippingAddress.setAddress2(form.address2.value);
            shippingAddress.setCity(form.city.value);
            shippingAddress.setPostalCode(form.postal.value);
            shippingAddress.setStateCode(form.states.value); // Not getting selected state value
            shippingAddress.setCountryCode(form.country.value);
            shippingAddress.setPhone(form.phone.value);
        });

        shipmentShippingModel = ShippingMgr.getShipmentShippingModel(
            currentBasket.defaultShipment
        );
        shippingAddressModel = new AddressModel(shipment.shippingAddress);
        shippingModel = new ShippingModel(
            currentBasket.defaultShipment,
            shipmentShippingModel,
            shippingAddressModel
        );

        if (!form.valid) {
            //res.setStatusCode(500);
        }

        res.json({
            shippingData: shippingModel,
            form: server.forms.getForm('shippingaddress')
        });
    });

    next();
});

/**
 *  Handle Ajax payment (and billing) form submit
 */

server.post('SubmitPayment', function (req, res, next) {
    this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
        var form = server.forms.getForm('payment');
        //if (!form.valid) {
        //    res.setStatusCode(500);
        //}
        res.json({ form: server.forms.getForm('payment'), req: req });
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
        Cart.calculateCart(currentBasket);
    });

    orderTotals = new TotalsModel(currentBasket);

    shippingAddressModel = new AddressModel(address);
    shippingModel = new ShippingModel(shipment, shipmentShippingModel, shippingAddressModel);

    res.json({ shipping: shippingModel, totals: orderTotals });
    next();
});

module.exports = server.exports();
