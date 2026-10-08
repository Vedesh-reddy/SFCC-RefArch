'use strict';

/**
 * Click & collect from the product page: stores near a postal code that have the
 * selected SKU in stock, and reserving it for pickup at one of them.
 * @module controllers/StorePickup
 */

var server = require('server');
var ProductMgr = require('dw/catalog/ProductMgr');
var StoreMgr = require('dw/catalog/StoreMgr');
var BasketMgr = require('dw/order/BasketMgr');
var Transaction = require('dw/system/Transaction');
var URLUtils = require('dw/web/URLUtils');
var Resource = require('dw/web/Resource');
var Logger = require('dw/system/Logger');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var storeHelpers = require('*/cartridge/scripts/helpers/storeHelpers');
var basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
var storePickup = require('*/cartridge/scripts/storePickup');

var customLogger = Logger.getLogger('smart-commerce', 'store-pickup');
var SEARCH_RADIUS = 50;
var MAX_QUANTITY = 10;

/**
 * Postal codes need the platform's geolocation data for the shopper's country. Without a
 * postal code, the browser's coordinates are used, else the base helper's IP location.
 */
server.get('Stores', csrfProtection.generateToken, function (req, res, next) {
    var pid = String(req.querystring.pid || '');
    var postalCode = String(req.querystring.postalCode || '').trim().substring(0, 10);
    var lat = parseFloat(req.querystring.lat);
    var long = parseFloat(req.querystring.long);
    var hasCoordinates = Math.abs(lat) <= 90 && Math.abs(long) <= 180;
    var stores = [];
    if (ProductMgr.getProduct(pid)) {
        var found = storeHelpers.getStores(SEARCH_RADIUS, postalCode || null,
            hasCoordinates ? String(lat) : null, hasCoordinates ? String(long) : null, req.geolocation, false);
        stores = storePickup.withStock(found.stores || [], pid);
    }
    res.render('smart/product/stores', { pid: pid, stores: stores, searched: true });
    next();
});

server.post('Reserve', server.middleware.https, csrfProtection.validateAjaxRequest, function (req, res, next) {
    if (res.redirectUrl) {
        return next(); // CSRF failure already redirected and logged out
    }
    var quantity = parseInt(req.form.quantity, 10) || 1;
    var product = ProductMgr.getProduct(String(req.form.pid || ''));
    var store = StoreMgr.getStore(String(req.form.storeId || ''));
    var error = quantity < 1 || quantity > MAX_QUANTITY ? 'error.pickup.quantity' : null;
    try {
        var basket = error ? null : BasketMgr.getCurrentOrNewBasket();
        error = error || storePickup.reserve(basket, product, store, quantity);
        if (!error) {
            Transaction.wrap(function () {
                basketCalculationHelpers.calculateTotals(basket);
            });
        }
    } catch (e) {
        customLogger.error('Pickup reservation failed for product {0}: {1}', req.form.pid, e.message);
        error = 'error.pickup.unavailable';
    }
    res.json(error
        ? { success: false, message: Resource.msg(error, 'smartcommerce', null) }
        : { success: true, redirectUrl: URLUtils.url('Cart-Show').toString() });
    return next();
});

module.exports = server.exports();
