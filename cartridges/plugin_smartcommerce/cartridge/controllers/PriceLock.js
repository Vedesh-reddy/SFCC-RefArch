'use strict';

/**
 * Locks today's price of the selected SKU for the signed-in shopper.
 * @module controllers/PriceLock
 */

var server = require('server');
var ProductMgr = require('dw/catalog/ProductMgr');
var BasketMgr = require('dw/order/BasketMgr');
var Transaction = require('dw/system/Transaction');
var URLUtils = require('dw/web/URLUtils');
var Resource = require('dw/web/Resource');
var Logger = require('dw/system/Logger');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
var priceLock = require('*/cartridge/scripts/priceLock');

var customLogger = Logger.getLogger('smart-commerce', 'price-lock');

server.post('Create', server.middleware.https, csrfProtection.validateAjaxRequest, function (req, res, next) {
    if (res.redirectUrl) {
        return next(); // CSRF failure already redirected and logged out
    }
    var customer = req.currentCustomer.raw;
    if (!customer.authenticated || !customer.registered) {
        res.json({ success: false, redirectUrl: URLUtils.https('Login-Show').toString() });
        return next();
    }
    var product = ProductMgr.getProduct(String(req.form.pid || ''));
    var error;
    try {
        Transaction.wrap(function () {
            error = product ? priceLock.create(customer, product) : 'error.lock.product';
            var basket = BasketMgr.getCurrentBasket();
            if (!error && basket) {
                basketCalculationHelpers.calculateTotals(basket);
            }
        });
    } catch (e) {
        customLogger.error('Price lock failed for product {0}: {1}', req.form.pid, e.message);
        error = 'error.lock.failed';
    }
    if (error) {
        res.json({ success: false, message: Resource.msg(error, 'smartcommerce', null) });
    } else {
        var view = priceLock.viewFor(customer, product);
        res.json(view.lock && view.lock.status === 'pending'
            ? { success: true, redirectUrl: URLUtils.url('Cart-Show').toString() }
            : { success: true, reload: true, message: Resource.msg('lock.created', 'smartcommerce', null) });
    }
    return next();
});

module.exports = server.exports();
