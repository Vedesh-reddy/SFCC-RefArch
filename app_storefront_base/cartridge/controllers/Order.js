'use strict';

var server = require('server');

var BasketMgr = require('dw/order/BasketMgr');
var HookMgr = require('dw/system/HookMgr');

var OrderMgr = require('dw/order/OrderMgr');
var PaymentMgr = require('dw/order/PaymentMgr');
var PaymentInstrument = require('dw/order/PaymentInstrument');
var ShippingMgr = require('dw/order/ShippingMgr');
var Transaction = require('dw/system/Transaction');

var AddressModel = require('~/cartridge/models/address');
var BillingModel = require('~/cartridge/models/billing');
var OrderModel = require('~/cartridge/models/order');
var Payment = require('~/cartridge/models/payment');
var ProductLineItemModel = require('~/cartridge/models/productLineItems');
var Resource = require('dw/web/Resource');
var ShippingModel = require('~/cartridge/models/shipping');
var TotalsModel = require('~/cartridge/models/totals');

var orderHelpers = require('~/cartridge/scripts/placeOrderHelpers');

server.get('Test', function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentOrNewBasket();
    var billing;
    var orderTotals;
    var productLineItemModel;
    var shippingModel;
    var shipmentShippingModel;

    Transaction.wrap(function () {
        if (currentBasket && !currentBasket.defaultShipment.shippingMethod) {
            ShippingModel.selectShippingMethod(currentBasket.defaultShipment);
        }
        if (currentBasket) {
            HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
        }
    });

    if (currentBasket) {
        shipmentShippingModel = ShippingMgr.getShipmentShippingModel(currentBasket.defaultShipment);
        shippingModel = new ShippingModel(currentBasket.defaultShipment, shipmentShippingModel);
        productLineItemModel = new ProductLineItemModel(currentBasket);
        orderTotals = new TotalsModel(currentBasket);
    }

    var orderModel =
        new OrderModel(currentBasket, shippingModel, billing, orderTotals, productLineItemModel);

    res.json(orderModel);
    next();
});

server.get('Confirm', function (req, res, next) {
    var order = OrderMgr.getOrder(req.querystring.ID);
    var orderModel = orderHelpers.buildOrderModel(order);

    res.render('checkout/confirmation/confirmation', { order: orderModel });

    next();
});

server.post('Track', server.middleware.https, function (req, res, next) {
    var applicablePaymentCards;
    var applicablePaymentMethods;

    var countryCode = req.geolocation.countryCode
        ? req.geolocation.countryCode
        : 'US';

    var currentCustomer = req.currentCustomer.raw;
    var billingAddress;
    var paymentAmount;
    var paymentInstruments;
    var shipment;
    var shippingAddress;
    var shipmentShippingModel;
    var order;
    var validForm = true;

    // models
    var billingAddressModel;
    var billingModel;
    var orderModel;
    var orderTotals;
    var paymentModel;
    var productLineItemModel;
    var shippingAddressModel;
    var shippingModel;

    if (req.form.trackOrderEmail && req.form.trackOrderPostal && req.form.trackOrderNumber) {
        order = OrderMgr.getOrder(req.form.trackOrderNumber);
    } else {
        validForm = false;
    }

    if (!order) {
        res.render('/account/login', {
            navTabValue: 'login',
            orderTrackFormError: validForm
        });
        next();
    } else {
        billingAddress = order.billingAddress;
        paymentAmount = order.totalGrossPrice;
        shipment = order.defaultShipment;
        shippingAddress = shipment.shippingAddress;

        shipmentShippingModel = ShippingMgr.getShipmentShippingModel(order.defaultShipment);

        shippingAddressModel = new AddressModel(shippingAddress);

        shippingModel = new ShippingModel(
            order.defaultShipment,
            shipmentShippingModel,
            shippingAddressModel
        );

        applicablePaymentMethods = PaymentMgr.getApplicablePaymentMethods(
            currentCustomer,
            countryCode,
            paymentAmount.value
        );

        applicablePaymentCards = PaymentMgr
            .getPaymentMethod(PaymentInstrument.METHOD_CREDIT_CARD)
            .getApplicablePaymentCards(currentCustomer, countryCode, paymentAmount.value);

        paymentInstruments = order.paymentInstruments;

        paymentModel = new Payment(applicablePaymentMethods,
            applicablePaymentCards,
            paymentInstruments
        );

        billingAddressModel = new AddressModel(billingAddress);
        billingModel = new BillingModel(billingAddressModel, paymentModel);

        productLineItemModel = new ProductLineItemModel(order);
        orderTotals = new TotalsModel(order);

        orderModel = new OrderModel(
            order,
            shippingModel,
            billingModel,
            orderTotals,
            productLineItemModel
        );

        // check the email and postal code of the form
        if (req.form.trackOrderEmail !== orderModel.orderEmail) {
            validForm = false;
        }

        if (req.form.trackOrderPostal
            !== orderModel.billing.billingAddress.address.postalCode) {
            validForm = false;
        }

        if (validForm) {
            var exitLinkText;

            exitLinkText = !req.currentCustomer.profile
                ? Resource.msg('link.continue.shop', 'order', null)
                : Resource.msg('link.orderdetails.myaccount', 'account', null);

            res.render('account/orderdetails', {
                order: orderModel,
                exitLinkText: exitLinkText
            });
        } else {
            res.render('/account/login', {
                navTabValue: 'login',
                orderTrackFormError: !validForm
            });
        }

        next();
    }
});

module.exports = server.exports();
