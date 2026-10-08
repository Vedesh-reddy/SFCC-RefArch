'use strict';

/**
 * Guest order tracking: order number plus order email or billing phone, then a
 * one-time code sent to the order email. Responses never reveal whether an order matched.
 * @module controllers/OrderLookup
 */

var server = require('server');
var URLUtils = require('dw/web/URLUtils');
var Resource = require('dw/web/Resource');
var Locale = require('dw/util/Locale');
var Logger = require('dw/system/Logger');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var OrderModel = require('*/cartridge/models/order');
var otp = require('*/cartridge/scripts/otp');
var smartMail = require('*/cartridge/scripts/smartMail');
var orderSelfService = require('*/cartridge/scripts/orderSelfService');

var customLogger = Logger.getLogger('smart-commerce', 'order-lookup');
var PURPOSE = 'order-track';

/**
 * @param {Object} res - Response
 * @param {string} error - Error message
 */
function renderVerify(res, error) {
    res.render('smart/otp/verify', {
        title: Resource.msg('otp.title.order', 'smartcommerce', null),
        actionUrl: URLUtils.https('OrderLookup-Verify'),
        destination: Resource.msg('otp.destination.order', 'smartcommerce', null),
        backUrl: URLUtils.https('OrderLookup-Show'),
        error: error
    });
}

server.get('Show', server.middleware.https, csrfProtection.generateToken, function (req, res, next) {
    res.render('smart/order/lookup', {});
    next();
});

server.post('Request', server.middleware.https, csrfProtection.validateRequest, csrfProtection.generateToken, function (req, res, next) {
    if (res.redirectUrl) {
        return next();
    }
    if (!req.form.orderNo || !req.form.contact) {
        res.render('smart/order/lookup', { error: Resource.msg('error.lookup.input', 'smartcommerce', null) });
        return next();
    }
    var order = orderSelfService.findForLookup(req.form.orderNo, req.form.contact);
    var code = order && otp.issue(req.session.raw.privacy, PURPOSE, JSON.stringify({ orderNo: order.orderNo, orderToken: order.orderToken }));
    if (code) {
        try {
            // ponytail: phone matches still receive the code by email | upgrade path: SMS service when the brand has an SMS provider
            smartMail.sendCode(order.customerEmail, code, 'email.code.reason.order');
        } catch (e) {
            customLogger.error('Order tracking code email failed for order {0}: {1}', order.orderNo, e.message);
        }
    }
    renderVerify(res, null);
    return next();
});

server.post('Verify', server.middleware.https, csrfProtection.validateRequest, csrfProtection.generateToken, function (req, res, next) {
    if (res.redirectUrl) {
        return next();
    }
    var privacy = req.session.raw.privacy;
    var subject = otp.verify(privacy, PURPOSE, req.form.code);
    if (subject) {
        orderSelfService.rememberTracked(privacy, JSON.parse(subject));
        res.redirect(URLUtils.https('OrderLookup-Details'));
    } else if (otp.pendingSubject(privacy, PURPOSE)) {
        renderVerify(res, Resource.msg('error.otp.invalid', 'smartcommerce', null));
    } else {
        res.render('smart/order/lookup', { error: Resource.msg('error.otp.expired', 'smartcommerce', null) });
    }
    return next();
});

server.get('Details', server.middleware.https, function (req, res, next) {
    var order = orderSelfService.trackedOrder(req);
    if (!order) {
        res.redirect(URLUtils.https('OrderLookup-Show'));
        return next();
    }
    res.render('account/orderDetails', {
        order: new OrderModel(order, {
            config: { numberOfLineItems: '*' },
            countryCode: Locale.getLocale(req.locale.id).country,
            containerView: 'order'
        }),
        exitLinkText: Resource.msg('link.continue.shop', 'order', null),
        exitLinkUrl: URLUtils.url('Home-Show')
    });
    return next();
});

module.exports = server.exports();
