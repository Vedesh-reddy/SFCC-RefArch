/* eslint-disable */
'use strict';

// TODO Remove this file
// REMOVE THIS FILE AFTER CHECKOUT IS COMPLETE.
// THIS IS ONLY A TEST FILE THAT ONLY ADDS THE COMPONENTS TO THE CART NEEDED TO PLACE AN ORDER

var Address = require('~/cartridge/models/address');
var BasketMgr = require('dw/order/BasketMgr');
var Billing = require('~/cartridge/models/billing');
var HookMgr = require('dw/system/HookMgr');
var Order = require('~/cartridge/models/order');
var OrderMgr = require('dw/order/OrderMgr');
var Payment = require('~/cartridge/models/payment');
var PaymentInstrument = require('dw/order/PaymentInstrument');
var PaymentMgr = require('dw/order/PaymentMgr');
var ProductLineItemModel = require('~/cartridge/models/productLineItem');
var ShippingModel = require('~/cartridge/models/shipping');
var ShippingMgr = require('dw/order/ShippingMgr');
var Totals = require('~/cartridge/models/totals');
var Transaction = require('dw/system/Transaction');

function orderTest(req) {
    var currentBasket = BasketMgr.getCurrentOrNewBasket();
    var currentCustomer = customer;
    var billing;
    var billingAddress = currentBasket.billingAddress;
    var billingAddressModel;
    var dwOrder;
    var orderTotals;
    var paymentModel;
    var productLineItemModel;
    var shippingModel;
    var shipmentShippingModel;
    var shipment = currentBasket.defaultShipment;
    var shippingAddress = shipment.shippingAddress;
    var shippingAddressModel;

    var paymentAmount = currentBasket.totalGrossPrice;
    var countryCode = req.geolocation.countryCode;
    var paymentInstrument;

    var applicablePaymentMethods = PaymentMgr.getApplicablePaymentMethods(
        currentCustomer,
        countryCode,
        paymentAmount.value
    );

    var applicablePaymentCards = PaymentMgr.getPaymentMethod(PaymentInstrument.METHOD_CREDIT_CARD)
        .getApplicablePaymentCards(currentCustomer, countryCode, paymentAmount.value);

    Transaction.wrap(function () {
        var productLineItem = currentBasket.createProductLineItem(
            '701642890133',
            currentBasket.defaultShipment
        );

        productLineItem.setQuantityValue(1);

        productLineItem = currentBasket.createProductLineItem(
            '750518703299',
            currentBasket.defaultShipment
        );

        productLineItem.setQuantityValue(2);

        if (shippingAddress === null) {
            shippingAddress = shipment.createShippingAddress();
            shippingAddress.setFirstName('The Muffin');
            shippingAddress.setLastName('Man');
            shippingAddress.setAddress1('1 Drury Lane');
            shippingAddress.setAddress2(null);
            shippingAddress.setCity('Far Far Away');
            shippingAddress.setPostalCode('04330');
            shippingAddress.setStateCode('ME');
            shippingAddress.setCountryCode('US');
            shippingAddress.setPhone('333-333-3333');
        }

        if (billingAddress === null) {
            billingAddress = currentBasket.createBillingAddress();
        }
        billingAddress.setFirstName('Shrek');
        billingAddress.setLastName('The Ogre');
        billingAddress.setAddress1('The swamp');
        billingAddress.setAddress2(null);
        billingAddress.setCity('Far Far Away');
        billingAddress.setPostalCode('04330');
        billingAddress.setStateCode('ME');
        billingAddress.setCountryCode('US');
        billingAddress.setPhone('123-456-7890');

        var iter = currentBasket.getPaymentInstruments(PaymentInstrument.METHOD_CREDIT_CARD)
            .iterator();

        while (iter.hasNext()) {
            currentBasket.removePaymentInstrument(iter.next());
        }

        paymentInstrument = currentBasket.createPaymentInstrument(
            PaymentInstrument.METHOD_CREDIT_CARD,
            currentBasket.totalGrossPrice
        );

        paymentInstrument.creditCardHolder = 'The Muffin Man';
        paymentInstrument.creditCardNumber = '4111111111111111';
        paymentInstrument.creditCardType = 'Visa';
        paymentInstrument.creditCardExpirationMonth = 1;
        paymentInstrument.creditCardExpirationYear = 2018;

        if (currentBasket && !currentBasket.defaultShipment.shippingMethod) {
            ShippingModel.selectShippingMethod(currentBasket.defaultShipment);
        }
        currentBasket.setCustomerEmail('testUser1@Salesforce.com');

        if (currentBasket) {
            HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
        }
    });

    dwOrder = Transaction.wrap(function () {
        return OrderMgr.createOrder(currentBasket);
    });

    if (dwOrder) {
        shipmentShippingModel = ShippingMgr.getShipmentShippingModel(
            dwOrder.defaultShipment
        );
        shippingAddressModel = new Address(shippingAddress);
        shippingModel = new ShippingModel(
            dwOrder.defaultShipment,
            shipmentShippingModel,
            shippingAddressModel
        );
    }

    var paymentInstruments = dwOrder.paymentInstruments;

    paymentModel = new Payment(applicablePaymentMethods,
        applicablePaymentCards,
        paymentInstruments
    );

    productLineItemModel = new ProductLineItemModel(dwOrder);
    orderTotals = new Totals(dwOrder);
    billingAddressModel = new Address(billingAddress);
    billing = new Billing(billingAddressModel, paymentModel);
    Transaction.wrap(function () {
        OrderMgr.placeOrder(dwOrder);
    });

    return new Order(dwOrder, shippingModel, billing, orderTotals, productLineItemModel);
}

function getOrderTest(req) {
    var dwOrder = OrderMgr.getOrder('00005302'); // replace this with your own order number!!!
    var currentCustomer = customer;
    var billing;
    var billingAddress = dwOrder.billingAddress;
    var billingAddressModel;
    var orderTotals;
    var paymentModel;
    var productLineItemModel;
    var shippingModel;
    var shipmentShippingModel;
    var shipment = dwOrder.defaultShipment;
    var shippingAddress = shipment.shippingAddress;
    var shippingAddressModel;

    var paymentAmount = dwOrder.totalGrossPrice;
    var countryCode = req.geolocation.countryCode;

    var applicablePaymentMethods = PaymentMgr.getApplicablePaymentMethods(
        currentCustomer,
        countryCode,
        paymentAmount.value
    );

    var applicablePaymentCards = PaymentMgr.getPaymentMethod(PaymentInstrument.METHOD_CREDIT_CARD)
        .getApplicablePaymentCards(currentCustomer, countryCode, paymentAmount.value);

    if (dwOrder) {
        shipmentShippingModel = ShippingMgr.getShipmentShippingModel(
            dwOrder.defaultShipment
        );
        shippingAddressModel = new Address(shippingAddress);
        shippingModel = new ShippingModel(
            dwOrder.defaultShipment,
            shipmentShippingModel,
            shippingAddressModel
        );
    }

    var paymentInstruments = dwOrder.paymentInstruments;

    paymentModel = new Payment(applicablePaymentMethods,
        applicablePaymentCards,
        paymentInstruments
    );

    productLineItemModel = new ProductLineItemModel(dwOrder);
    orderTotals = new Totals(dwOrder);
    billingAddressModel = new Address(billingAddress);
    billing = new Billing(billingAddressModel, paymentModel);

    return new Order(dwOrder, shippingModel, billing, orderTotals, productLineItemModel);
}

module.exports = {
    orderTest: orderTest,
    getOrderTest: getOrderTest
};
