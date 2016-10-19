'use strict';

var server = require('server');
var locale = require('~/cartridge/scripts/middleware/locale');

var BasketMgr = require('dw/order/BasketMgr');
var ShippingMgr = require('dw/order/ShippingMgr');

var AddressModel = require('~/cartridge/models/address');
var BillingModel = require('~/cartridge/models/billing');
var OrderModel = require('~/cartridge/models/order');
var Payment = require('~/cartridge/models/payment');
var PaymentInstrument = require('dw/order/PaymentInstrument');
var PaymentMgr = require('dw/order/PaymentMgr');
var ProductLineItemModel = require('~/cartridge/models/productLineItems');
var ShippingModel = require('~/cartridge/models/shipping');
var TotalsModel = require('~/cartridge/models/totals');


server.get('Start', locale, function (req, res, next) {
    var applicablePaymentCards;
    var applicablePaymentMethods;
    var countryCode = req.geolocation.countryCode;
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

    orderModel = new OrderModel(
        currentBasket,
        shippingModel,
        billingModel,
        orderTotals,
        productLineItemModel
    );

    res.render('checkout/checkout', orderModel);
    next();
});

module.exports = server.exports();
