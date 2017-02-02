'use strict';

var server = require('server');
var CustomerMgr = require('dw/customer/CustomerMgr');
var URLUtils = require('dw/web/URLUtils');

server.get('Show', server.middleware.https, function (req, res, next) {
    var rememberMe = false;
    var userName = '';
    var url = URLUtils.url('Account-Login');
    if (req.currentCustomer.credentials) {
        rememberMe = true;
        userName = req.currentCustomer.credentials.username;
    }
    res.render('/account/login', {
        navTabValue: 'login',
        rememberMe: rememberMe,
        userName: userName,
        url: url
    });
    next();
});

server.get('Logout', function (req, res, next) {
    // TODO clear form elements?
    CustomerMgr.logoutCustomer(false);
    res.redirect(URLUtils.url('Home-Show'));
    next();
});

module.exports = server.exports();
