'use strict';

/**
 * Password-less sign in and registration with a code sent to the shopper's email.
 * Proven email ownership signs into the account registered with that email, or
 * creates one when the shopper registers.
 * @module controllers/EmailOtp
 */

var server = require('server');
var URLUtils = require('dw/web/URLUtils');
var Resource = require('dw/web/Resource');
var CustomerMgr = require('dw/customer/CustomerMgr');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var emailHelpers = require('*/cartridge/scripts/helpers/emailHelpers');
var otp = require('*/cartridge/scripts/otp');
var smartMail = require('*/cartridge/scripts/smartMail');

var customLogger = Logger.getLogger('smart-commerce', 'email-otp-login');

// Must match the ID used when the external profile was created; never change it after go-live.
var PROVIDER = 'SmartEmailOtp';
var PURPOSE = 'login';

/**
 * @param {string} email - Email address
 * @returns {string} Address with the local part masked
 */
function mask(email) {
    var at = email.indexOf('@');
    return email.charAt(0) + '***' + email.substring(at);
}

/**
 * @param {*} value - Form value
 * @returns {string} Trimmed value, at most 50 characters (profile field limit)
 */
function clean(value) {
    return String(value || '').trim().substring(0, 50);
}

/**
 * Accounts registered with a password get the email OTP profile linked on first use.
 * @param {string} email - Verified, lower-case email
 * @returns {dw.customer.Profile|null} Existing profile
 */
function findProfile(email) {
    var profile = CustomerMgr.getExternallyAuthenticatedCustomerProfile(PROVIDER, email);
    if (profile) {
        return profile;
    }
    var customer = CustomerMgr.getCustomerByLogin(email);
    if (!customer) {
        return null;
    }
    Transaction.wrap(function () {
        customer.createExternalProfile(PROVIDER, email);
    });
    return customer.profile;
}

/**
 * @param {Object} data - Verified subject: email, firstName, lastName
 * @returns {dw.customer.Profile} New profile
 */
function createProfile(data) {
    var profile;
    Transaction.wrap(function () {
        profile = CustomerMgr.createExternallyAuthenticatedCustomer(PROVIDER, data.email).profile;
        profile.setFirstName(data.firstName);
        profile.setLastName(data.lastName);
        profile.setEmail(data.email);
    });
    return profile;
}

/**
 * @param {Object} res - Response
 * @param {string} mode - login or register
 * @param {Object} extra - Additional pdict values
 */
function renderRequest(res, mode, extra) {
    res.render('smart/otp/request', Object.assign({
        mode: mode,
        actionUrl: URLUtils.https('EmailOtp-Request')
    }, extra));
}

/**
 * @param {Object} res - Response
 * @param {string} subject - Pending challenge subject
 * @param {string} error - Error message
 */
function renderVerify(res, subject, error) {
    var data = JSON.parse(subject);
    res.render('smart/otp/verify', {
        title: Resource.msg('otp.title.login', 'smartcommerce', null),
        actionUrl: URLUtils.https('EmailOtp-Verify'),
        destination: mask(data.email),
        backUrl: URLUtils.https('EmailOtp-Show', 'mode', data.firstName ? 'register' : 'login'),
        error: error
    });
}

server.get('Show', server.middleware.https, csrfProtection.generateToken, function (req, res, next) {
    if (req.currentCustomer.profile) {
        res.redirect(URLUtils.https('Account-Show'));
        return next();
    }
    renderRequest(res, req.querystring.mode === 'register' ? 'register' : 'login', {});
    return next();
});

server.post('Request', server.middleware.https, csrfProtection.validateRequest, csrfProtection.generateToken, function (req, res, next) {
    if (res.redirectUrl) {
        return next();
    }
    var mode = req.form.mode === 'register' ? 'register' : 'login';
    var email = String(req.form.email || '').trim().toLowerCase();
    var data = {
        email: email,
        firstName: mode === 'register' ? clean(req.form.firstName) : '',
        lastName: mode === 'register' ? clean(req.form.lastName) : ''
    };
    if (!emailHelpers.validateEmail(email) || (mode === 'register' && (!data.firstName || !data.lastName))) {
        renderRequest(res, mode, { email: email, firstName: data.firstName, lastName: data.lastName, error: Resource.msg('error.otp.input', 'smartcommerce', null) });
        return next();
    }

    var subject = JSON.stringify(data);
    var code = otp.issue(req.session.raw.privacy, PURPOSE, subject);
    if (code) {
        try {
            smartMail.sendCode(email, code, 'email.code.reason.login');
        } catch (e) {
            customLogger.error('Sign-in code email failed: {0}', e.message);
        }
    }
    renderVerify(res, subject, null);
    return next();
});

server.post('Verify', server.middleware.https, csrfProtection.validateRequest, csrfProtection.generateToken, function (req, res, next) {
    if (res.redirectUrl) {
        return next();
    }
    var privacy = req.session.raw.privacy;
    var pending = otp.pendingSubject(privacy, PURPOSE);
    var subject = otp.verify(privacy, PURPOSE, req.form.code);
    if (!subject) {
        if (otp.pendingSubject(privacy, PURPOSE)) {
            renderVerify(res, pending, Resource.msg('error.otp.invalid', 'smartcommerce', null));
        } else {
            renderRequest(res, 'login', { error: Resource.msg('error.otp.expired', 'smartcommerce', null) });
        }
        return next();
    }

    var data = JSON.parse(subject);
    var profile = findProfile(data.email);
    if (!profile && !data.firstName) {
        renderRequest(res, 'register', { email: data.email, error: Resource.msg('error.otp.noaccount', 'smartcommerce', null) });
        return next();
    }
    profile = profile || createProfile(data);

    var customer = null;
    if (profile.credentials.isEnabled()) {
        customer = Transaction.wrap(function () {
            return CustomerMgr.loginExternallyAuthenticatedCustomer(PROVIDER, data.email, false);
        });
    }
    if (!customer) {
        customLogger.warn('Email code sign-in refused for customer {0}', profile.customerNo);
        renderRequest(res, 'login', { error: Resource.msg('error.otp.disabled', 'smartcommerce', null) });
        return next();
    }
    res.redirect(URLUtils.https('Account-Show'));
    return next();
});

module.exports = server.exports();
