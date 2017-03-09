'use strict';

var Order = require('dw/order/Order');
var OrderMgr = require('dw/order/OrderMgr');
var Status = require('dw/system/Status');
var Transaction = require('dw/system/Transaction');

var AddressModel = require('~/cartridge/models/address');
var ShippingModel = require('~/cartridge/models/shipping');
var BillingModel = require('~/cartridge/models/billing');
var OrderModel = require('~/cartridge/models/order');
var PaymentModel = require('~/cartridge/models/payment');
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
    // models
    var modelConfig = config;

    var shippingModels = ShippingModel.getShippingModels(order);

    var paymentModel = new PaymentModel(order, order.customer, order.currencyCode);

    var billingAddressModel = new AddressModel(order.billingAddress);
    var billingModel = new BillingModel(billingAddressModel, paymentModel);

    var productLineItemsModel = new ProductLineItemsModel(order);
    var totalsModel = new TotalsModel(order);

    if (!modelConfig) {
        modelConfig = {
            numberOfLineItems: '*'
        };
    }
    var modelsObject = {
        billingModel: billingModel,
        shippingModels: shippingModels,
        totalsModel: totalsModel,
        productLineItemsModel: productLineItemsModel
    };

    return new OrderModel(order, modelsObject, modelConfig);
}

module.exports = {
    placeOrder: placeOrder,
    buildOrderModel: buildOrderModel
};
