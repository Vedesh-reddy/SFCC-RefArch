'use strict';

var server = require('server');
var locale = require('~/cartridge/scripts/middleware/locale');
var CustomerMgr = require('dw/customer/CustomerMgr');
var URLUtils = require('dw/web/URLUtils');

server.get('Show', locale, server.middleware.https, function (req, res, next) {
    res.render('/account/login', {
        navTabValue: 'login'
    });
    next();
});

server.get('Logout', locale, function (req, res, next) {
    // TODO clear form elements?
    CustomerMgr.logoutCustomer(false);
    res.redirect(URLUtils.url('Home-Show'));
    next();
});

module.exports = server.exports();
