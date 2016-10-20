'use strict';

var server = require('server');
var locale = require('~/cartridge/scripts/middleware/locale');
var OrderMgr = require('dw/order/OrderMgr');
var Order = require('dw/order/Order');
var ShippingMgr = require('dw/order/ShippingMgr');
var AccountModel = require('~/cartridge/models/account');
var AddressModel = require('~/cartridge/models/address');
var OrderModel = require('~/cartridge/models/order');
var ShippingModel = require('~/cartridge/models/shipping');
var Totals = require('~/cartridge/models/totals');

/**
 * Creates an account model for the current customer
 * @param {Object} req - local instance of request object
 * @returns {Object} a plain object of the current customer's account
 */
function getModel(req) {
    var orderModel;
    var preferredAddressModel;

    var customerNo = req.currentCustomer.profile.customerNo;
    var customerOrders = OrderMgr.searchOrders(
        'customerNo={0} AND status!={1}',
        'creationDate desc',
        customerNo,
        Order.ORDER_STATUS_REPLACED
		);

    var order = customerOrders.first();

    var defaultShipment = order.defaultShipment;
    var ordershippingAdress = defaultShipment.shippingAddress;
    var shippingAddressModel = new AddressModel(ordershippingAdress);
    var shipmentShippingModel = ShippingMgr.getShipmentShippingModel(defaultShipment);
    var shippingModel = new ShippingModel(
        defaultShipment,
        shipmentShippingModel,
        shippingAddressModel
        );

    if (order) {
        var orderTotals = new Totals(order);
        orderModel = new OrderModel(order, shippingModel, null, orderTotals, null);
    } else {
        orderModel = null;
    }

    if (req.currentCustomer.addressBook) {
        preferredAddressModel = new AddressModel(req.currentCustomer.addressBook.preferredAddress);
    } else {
        preferredAddressModel = null;
    }

    return new AccountModel(req.currentCustomer, preferredAddressModel, orderModel);
}

server.get('Show', locale, function (req, res, next) {
    res.render('account/accountdashboard', getModel(req));
    next();
});

module.exports = server.exports();
