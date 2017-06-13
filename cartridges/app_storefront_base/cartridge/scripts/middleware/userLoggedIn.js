'use strict';

var URLUtils = require('dw/web/URLUtils');

/**
 * Middleware validating if user logged in
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next call in the middleware chain
 * @returns {void}
 */
function validateLoggedIn(req, res, next) {
    if (!req.currentCustomer.profile) {
        res.redirect(URLUtils.url('Login-Show'));
    }
    next();
}

/**
 * Middleware validating if user logged in from ajax request
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next call in the middleware chain
 * @returns {void}
 */
function validateLoggedInAjax(req, res, next) {
    if (!req.currentCustomer.profile) {
        res.setStatusCode(500);
        res.setViewData({
            loggedin: false,
            redirectUrl: URLUtils.url('Login-Show').toString()
        });
    } else {
        res.setViewData({
            loggedin: true
        });
    }
    next();
}

module.exports = {
    validateLoggedIn: validateLoggedIn,
    validateLoggedInAjax: validateLoggedInAjax
};
