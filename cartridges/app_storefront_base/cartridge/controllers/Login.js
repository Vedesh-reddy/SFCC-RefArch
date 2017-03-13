'use strict';

var server = require('server');
var CustomerMgr = require('dw/customer/CustomerMgr');
var URLUtils = require('dw/web/URLUtils');
var Resource = require('dw/web/Resource');

server.get('Show', server.middleware.https, function (req, res, next) {
    var rememberMe = false;
    var userName = '';
    var actionUrl = URLUtils.url('Account-Login');
    var navTabValue = req.querystring.action;
    if (req.currentCustomer.credentials) {
        rememberMe = true;
        userName = req.currentCustomer.credentials.username;
    }
    var breadcrumbs = [
        {
            htmlValue: Resource.msg('global.home', 'common', null),
            url: URLUtils.home().toString()
        }
    ];
    var profileForm = server.forms.getForm('profile');
    profileForm.clear();
    res.render('/account/login', {
        navTabValue: navTabValue || 'login',
        rememberMe: rememberMe,
        userName: userName,
        actionUrl: actionUrl,
        profileForm: profileForm,
        breadcrumbs: breadcrumbs
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
