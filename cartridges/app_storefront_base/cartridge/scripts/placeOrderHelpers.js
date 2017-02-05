'use strict';

var Order = require('dw/order/Order');
var OrderMgr = require('dw/order/OrderMgr');
var Status = require('dw/system/Status');
var Transaction = require('dw/system/Transaction');
var ShippingMgr = require('dw/order/ShippingMgr');

var AddressModel = require('~/cartridge/models/address');
var ShippingModel = require('~/cartridge/models/shipping');
var BillingModel = require('~/cartridge/models/billing');
var OrderModel = require('~/cartridge/models/order');
var Payment = require('~/cartridge/models/payment');
var ProductLineItemsModel = require('~/cartridge/models/productLineItems');
var TotalsModel = require('~/cartridge/models/totals');

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

/**
 * Create order model based on order id
 * @param  {dw.order.Order} order - The order object
 * @param {Object} config -Objec tmodel configurations
 * @return {Object} order model
 */
function buildOrderModel(order, config) {
    var billingAddress = order.billingAddress;
    var paymentInstruments;
    var shipment = order.defaultShipment;
    var shippingAddress = shipment.shippingAddress;
    var shipmentShippingModel = ShippingMgr.getShipmentShippingModel(order.defaultShipment);

    // models
    var billingAddressModel;
    var billingModel;
    var orderModel;
    var totalsModel;
    var paymentModel;
    var productLineItemsModel;
    var shippingAddressModel = new AddressModel(shippingAddress);
    var shippingModel;

    var modelConfig = config;

    shippingModel = new ShippingModel(
        order.defaultShipment,
        shipmentShippingModel,
        shippingAddressModel
    );

    paymentInstruments = order.paymentInstruments;

    paymentModel = new Payment(null, null, paymentInstruments);

    billingAddressModel = new AddressModel(billingAddress);
    billingModel = new BillingModel(billingAddressModel, paymentModel);

    productLineItemsModel = new ProductLineItemsModel(order);
    totalsModel = new TotalsModel(order);

    if (!modelConfig) {
        modelConfig = {
            numberOfLineItems: '*'
        };
    }
    var modelsObject = {
        billingModel: billingModel,
        shippingModel: shippingModel,
        totalsModel: totalsModel,
        productLineItemsModel: productLineItemsModel
    };

    orderModel = new OrderModel(order, modelsObject, modelConfig);

    return orderModel;
}

module.exports = {
    placeOrder: placeOrder,
    buildOrderModel: buildOrderModel
};
