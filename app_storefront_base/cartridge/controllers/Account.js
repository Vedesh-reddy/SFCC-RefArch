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
var Transaction = require('dw/system/Transaction');
var CustomerMgr = require('dw/customer/CustomerMgr');
var URLUtils = require('dw/web/URLUtils');

/**
 * Creates an account model for the current customer
 * @param {Object} req - local instance of request object
 * @returns {Object} a plain object of the current customer's account
 */
function getModel(req) {
    var orderModel;
    var preferredAddressModel;

    if (!req.currentCustomer.profile) {
        return null;
    }

    var customerNo = req.currentCustomer.profile.customerNo;
    var customerOrders = OrderMgr.searchOrders(
        'customerNo={0} AND status!={1}',
        'creationDate desc',
        customerNo,
        Order.ORDER_STATUS_REPLACED
	);

    var order = customerOrders.first();

    if (order) {
        var defaultShipment = order.defaultShipment;
        var ordershippingAdress = defaultShipment.shippingAddress;
        var shippingAddressModel = new AddressModel(ordershippingAdress);
        var shipmentShippingModel = ShippingMgr.getShipmentShippingModel(defaultShipment);
        var shippingModel = new ShippingModel(
            defaultShipment,
            shipmentShippingModel,
            shippingAddressModel
        );
        var allProducts = order.allProductLineItems;
        var orderTotals = new Totals(order);
        orderModel = new OrderModel(order, shippingModel, null, orderTotals, allProducts);
    } else {
        orderModel = null;
    }

    if (req.currentCustomer.addressBook.preferredAddress) {
        preferredAddressModel = new AddressModel(req.currentCustomer.addressBook.preferredAddress);
    } else {
        preferredAddressModel = null;
    }

    return new AccountModel(req.currentCustomer, preferredAddressModel, orderModel);
}

server.get('Show', locale, function (req, res, next) {
    var accountModel = getModel(req);

    if (accountModel) {
        res.render('account/accountdashboard', getModel(req));
    } else {
        res.redirect(URLUtils.url('Login-Show'));
    }
    next();
});

server.post('Login', locale, server.middleware.https, function (req, res, next) {
    var email = req.form.loginEmail;
    var password = req.form.loginPassword;
    var rememberMe = req.form.loginRememberMe
        ? req.form.loginRememberMe
        : false;

    var authenticatedCustomer;
    Transaction.wrap(function () {
        authenticatedCustomer = CustomerMgr.loginCustomer(email, password, rememberMe);
    });
    if (authenticatedCustomer && authenticatedCustomer.authenticated) {
        // TODO clear form elements?
        res.redirect(URLUtils.url('Account-Show'));
    } else {
        res.render('/account/login', {
            navTabValue: 'login',
            loginFormError: true
        });
    }
    next();
});

module.exports = server.exports();
