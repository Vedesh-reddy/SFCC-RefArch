'use strict';

var server = require('server');
var reviews = require('*/cartridge/scripts/productReviews');
var Resource = require('dw/web/Resource');
var URLUtils = require('dw/web/URLUtils');
var CSRFProtection = require('dw/web/CSRFProtection');
var Logger = require('dw/system/Logger');

/**
 * Personal forms and tokens must never enter shared caches.
 * @param {Object} res - Response
 */
function noCache(res) {
    res.cachePeriod = 0; // eslint-disable-line no-param-reassign
    // SFCC owns Cache-Control and Pragma; setting them directly throws.
    res.base.setExpires(new Date(0));
}

/** @returns {Object} A fresh CSRF token */
function token() {
    return { name: CSRFProtection.getTokenName(), value: CSRFProtection.generateToken() };
}

/**
 * @param {Object} req - Request
 * @returns {string|null} Authenticated customer number, never supplied by the browser
 */
function customerNo(req) {
    var customer = req.currentCustomer.raw;
    return customer && customer.authenticated && customer.profile ? customer.profile.customerNo : null;
}

/**
 * @param {Object} req - Request
 * @param {dw.catalog.Product} product - Canonical product
 * @returns {Object} View model
 */
function viewModel(req, product) {
    var list = reviews.getReviews(product.ID, req.querystring.page);
    var identity = customerNo(req);
    var own = reviews.getOwnReview(product.ID, identity);
    var status = own ? String(own.custom.status.value || own.custom.status) : null;
    return {
        reviewProduct: { id: product.ID, name: product.name },
        reviews: list,
        settings: reviews.getSettings(),
        loggedIn: !!identity,
        ownStatus: status,
        values: own ? {
            rating: own.custom.rating,
            displayName: own.custom.displayName,
            title: own.custom.title,
            body: own.custom.body
        } : {},
        fieldErrors: {},
        csrf: token(),
        summary: list.total ? Resource.msgf('summary.rating', 'reviews', null, list.average, list.total)
            : Resource.msg('summary.empty', 'reviews', null),
        loginUrl: URLUtils.https('Reviews-Login', 'pid', product.ID).toString(),
        previousUrl: list.page > 1 ? URLUtils.https('Reviews-Show', 'pid', product.ID, 'page', list.page - 1).toString() : null,
        nextUrl: list.page < list.pages ? URLUtils.https('Reviews-Show', 'pid', product.ID, 'page', list.page + 1).toString() : null,
        previousDataUrl: list.page > 1 ? URLUtils.https('Reviews-List', 'pid', product.ID, 'page', list.page - 1).toString() : null,
        nextDataUrl: list.page < list.pages ? URLUtils.https('Reviews-List', 'pid', product.ID, 'page', list.page + 1).toString() : null
    };
}

/**
 * @param {string} template - Full page or fragment
 * @returns {Function} Read handler
 */
function renderReviews(template) {
    return function (req, res, next) {
        noCache(res);
        try {
            var product = reviews.getProduct(req.querystring.pid);
            if (!reviews.getSettings().enabled || !product) {
                res.setStatusCode(404);
                res.render(template, { unavailable: true });
            } else {
                var model = viewModel(req, product);
                var savedValue = req.session.privacyCache.get('productReviewSaved');
                var savedStatus = savedValue ? JSON.parse(savedValue) : null;
                if (savedStatus && savedStatus.pid === product.ID) {
                    model.notice = Resource.msg('success.' + savedStatus.status, 'reviews', null);
                    req.session.privacyCache.set('productReviewSaved', null);
                }
                res.render(template, model);
            }
        } catch (e) {
            Logger.error('Product reviews could not be loaded: {0}', e.message);
            res.setStatusCode(503);
            res.render(template, { unavailable: true });
        }
        return next();
    };
}

server.get('Show', server.middleware.https, renderReviews('reviews/page'));
server.get('List', server.middleware.https, renderReviews('reviews/content'));

server.get('Login', server.middleware.https, function (req, res, next) {
    noCache(res);
    var product = reviews.getProduct(req.querystring.pid);
    if (!product || !reviews.getSettings().enabled) {
        res.setStatusCode(404);
        res.render('reviews/page', { unavailable: true });
    } else {
        req.session.privacyCache.set('productReviewsReturnPID', product.ID);
        res.redirect(URLUtils.https(customerNo(req) ? 'Reviews-Return' : 'Login-Show', 'rurl', 3).toString());
    }
    return next();
});

server.get('Return', server.middleware.https, function (req, res, next) {
    noCache(res);
    var pid = req.session.privacyCache.get('productReviewsReturnPID');
    req.session.privacyCache.set('productReviewsReturnPID', null);
    var product = reviews.getProduct(pid);
    res.redirect(product ? URLUtils.https('Product-Show', 'pid', product.ID).toString() + '#product-reviews'
        : URLUtils.https('Account-Show').toString());
    return next();
});

server.post('Submit', server.middleware.https, function (req, res, next) {
    noCache(res);
    var ajax = req.httpHeaders['x-requested-with'] === 'XMLHttpRequest';
    var product;
    var validation = reviews.validate(req.form);

    /**
     * Send a controlled failure; a normal HTML submission retains its values.
     * @param {number} status - HTTP status
     * @param {string} key - Resource key
     * @returns {void}
     */
    function fail(status, key) {
        res.setStatusCode(status);
        var message = Resource.msg(key, 'reviews', null);
        var fieldErrors = {};
        Object.keys(validation.errors).forEach(function (field) {
            fieldErrors[field] = Resource.msg(validation.errors[field], 'reviews', null);
        });
        if (ajax) {
            res.json({ success: false, message: message, fieldErrors: fieldErrors, csrf: token(), retryAfter: status === 429 ? 60 : null });
        } else if (product && status !== 503) {
            var model = viewModel(req, product);
            model.values = validation.values;
            model.fieldErrors = fieldErrors;
            model.error = message;
            res.render('reviews/page', model);
        } else {
            res.render('reviews/page', { unavailable: true, error: message });
        }
    }

    // Each failure returns before save; redirect-only middleware is insufficient here.
    if (!CSRFProtection.validateRequest()) {
        fail(403, 'error.csrf');
        return next();
    }
    var identity = customerNo(req);
    if (!identity) {
        fail(401, 'error.login');
        return next();
    }
    try {
        var settings = reviews.getSettings();
        product = reviews.getProduct(req.form.pid);
        if (!settings.enabled || !product) {
            fail(404, 'error.product');
        } else if (!validation.valid) {
            fail(400, 'error.validation');
        } else {
            var saved = reviews.save(product.ID, identity, validation.values, settings.moderation);
            if (saved.error === 'rate') {
                fail(429, 'error.rate');
            } else if (ajax) {
                res.json({ success: true, message: Resource.msg('success.' + saved.status, 'reviews', null) });
            } else {
                req.session.privacyCache.set('productReviewSaved', JSON.stringify({ pid: product.ID, status: saved.status }));
                res.redirect(URLUtils.https('Reviews-Show', 'pid', product.ID).toString());
            }
        }
    } catch (e) {
        Logger.error('Product review could not be saved: {0}', e.message);
        fail(503, 'error.unavailable');
    }
    return next();
});

module.exports = server.exports();
