'use strict';

/**
 * Wishlist page, PDP button fragment, add/remove posts and the post-login price alert.
 * Fragments carrying CSRF tokens or personal data are uncached remote includes.
 * @module controllers/CustomWishlist
 */

var server = require('server');
var URLUtils = require('dw/web/URLUtils');
var Logger = require('dw/system/Logger');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var wishlist = require('*/cartridge/scripts/customWishlist');

var customLogger = Logger.getLogger('custom-wishlist', 'wishlist-storefront');

/**
 * Personal content must never enter shared caches.
 * @param {Object} res - Response
 */
function noCache(res) {
    res.cachePeriod = 0; // eslint-disable-line no-param-reassign
    res.base.setExpires(new Date(0));
}

/**
 * @param {Object} req - Request
 * @returns {dw.customer.Customer|null} Authenticated customer, never identified by the browser
 */
function authenticatedCustomer(req) {
    var customer = req.currentCustomer.raw;
    return customer && customer.authenticated && customer.registered ? customer : null;
}

server.get('Show', server.middleware.https, csrfProtection.generateToken, function (req, res, next) {
    noCache(res);
    var customer = authenticatedCustomer(req);
    if (!customer) {
        // login returns to My Account, not the wishlist | upgrade path: register an oAuthReentry endpoint if shoppers ask to land back here
        res.redirect(URLUtils.https('Login-Show'));
        return next();
    }
    res.render('wishlist/page', { items: wishlist.getItems(customer) });
    return next();
});

server.get('Button', server.middleware.include, csrfProtection.generateToken, function (req, res, next) {
    noCache(res);
    res.render('wishlist/button', {
        pid: req.querystring.pid,
        loggedIn: !!authenticatedCustomer(req)
    });
    return next();
});

server.post('Add', server.middleware.https, csrfProtection.validateRequest, function (req, res, next) {
    if (res.redirectUrl) {
        return next(); // CSRF failure already redirected and logged out
    }
    var customer = authenticatedCustomer(req);
    var product = wishlist.getProduct(req.form.pid);
    if (customer && product) {
        try {
            wishlist.addProduct(customer, product);
        } catch (e) {
            customLogger.error('Wishlist add failed for product {0}: {1}', product.ID, e.message);
        }
    }
    res.redirect(customer ? URLUtils.https('CustomWishlist-Show') : URLUtils.https('Login-Show'));
    return next();
});

server.post('Remove', server.middleware.https, csrfProtection.validateRequest, function (req, res, next) {
    if (res.redirectUrl) {
        return next(); // CSRF failure already redirected and logged out
    }
    var customer = authenticatedCustomer(req);
    if (customer) {
        try {
            wishlist.removeItem(customer, req.form.itemId);
        } catch (e) {
            customLogger.error('Wishlist remove failed for item {0}: {1}', req.form.itemId, e.message);
        }
    }
    res.redirect(customer ? URLUtils.https('CustomWishlist-Show') : URLUtils.https('Login-Show'));
    return next();
});

/**
 * Remote include on every page. Checks once per authenticated session; logout
 * clears the privacy cache, so the next login checks again.
 */
server.get('Alert', server.middleware.include, function (req, res, next) {
    noCache(res);
    var customer = authenticatedCustomer(req);
    var alerts = [];
    if (customer && !req.session.privacyCache.get('wishlistAlertChecked')) {
        req.session.privacyCache.set('wishlistAlertChecked', true);
        try {
            alerts = wishlist.takePendingAlerts(customer);
        } catch (e) {
            customLogger.error('Wishlist price alert lookup failed: {0}', e.message);
        }
    }
    if (alerts.length) {
        res.render('wishlist/priceAlert', { alerts: alerts, wishlistUrl: URLUtils.https('CustomWishlist-Show').toString() });
    } else {
        res.print('');
    }
    return next();
});

module.exports = server.exports();
