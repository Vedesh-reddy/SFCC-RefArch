'use strict';

/**
 * Product page panel (price history, alerts, pickup, price lock, compare), alert
 * subscriptions and a public JSON price-history API.
 * @module controllers/SmartProduct
 */

var server = require('server');
var ProductMgr = require('dw/catalog/ProductMgr');
var Resource = require('dw/web/Resource');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var emailHelpers = require('*/cartridge/scripts/helpers/emailHelpers');
var priceHistory = require('*/cartridge/scripts/priceHistory');
var productAlerts = require('*/cartridge/scripts/productAlerts');
var priceLock = require('*/cartridge/scripts/priceLock');
var storePickup = require('*/cartridge/scripts/storePickup');

/**
 * @param {Object} req - Request
 * @param {string} name - Parameter name
 * @returns {dw.catalog.Product|null} Online product from the request
 */
function requestedProduct(req, name) {
    var params = req.httpMethod === 'POST' ? req.form : req.querystring;
    var product = params[name] ? ProductMgr.getProduct(String(params[name])) : null;
    return product && product.online ? product : null;
}

/**
 * Loaded by the product page script for the selected variant; carries a CSRF
 * token and the shopper's email, so it is never cached.
 */
server.get('Panel', csrfProtection.generateToken, function (req, res, next) {
    var product = requestedProduct(req, 'pid');
    if (!product) {
        res.print('');
        return next();
    }
    var sellable = !product.master && !product.variationGroup && !product.productSet;
    var priced = !!priceHistory.currentPrice(product);
    res.render('smart/product/panel', {
        pid: product.ID,
        name: product.name,
        sellable: sellable,
        priced: priced,
        inStock: sellable && product.availabilityModel.isOrderable(),
        history: priceHistory.summary(product, Date.now()),
        email: req.currentCustomer.profile ? req.currentCustomer.profile.email : '',
        pickup: sellable && priced && !!storePickup.pickupMethod(),
        lock: priced ? priceLock.viewFor(req.currentCustomer.raw, product) : null
    });
    return next();
});

server.post('Subscribe', server.middleware.https, csrfProtection.validateAjaxRequest, function (req, res, next) {
    if (res.redirectUrl) {
        return next(); // CSRF failure already redirected and logged out
    }
    var email = String(req.form.email || '').trim().toLowerCase();
    var type = String(req.form.type || '');
    if (!emailHelpers.validateEmail(email) || email.length > 100) {
        res.json({ success: false, message: Resource.msg('error.alert.email', 'smartcommerce', null) });
        return next();
    }
    var result = productAlerts.subscribe(type, requestedProduct(req, 'pid'), email);
    var key = result.error || (result.already ? 'alert.already' : 'alert.subscribed.' + type);
    res.json({ success: !result.error, message: Resource.msg(key, 'smartcommerce', null) });
    return next();
});

/**
 * Public price history for a variant or simple product:
 * { productID, currencyCode, current, lowest30, history: [{ date, price }] }, newest first.
 */
server.get('PriceHistory', function (req, res, next) {
    var summary = priceHistory.summary(requestedProduct(req, 'pid'), Date.now());
    if (!summary) {
        res.setStatusCode(404);
        res.json({ error: 'not-found' });
        return next();
    }
    res.json({
        productID: summary.productID,
        currencyCode: summary.currencyCode,
        current: summary.current,
        lowest30: summary.lowest30,
        history: summary.history.map(function (point) {
            return { date: point.date.toISOString(), price: point.price };
        })
    });
    return next();
});

module.exports = server.exports();
