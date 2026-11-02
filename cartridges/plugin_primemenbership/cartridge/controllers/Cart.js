'use strict';

var server = require('server');

server.extend(module.superModule);

// Members-only, early access and launch products: decided here because the storefront labels can be bypassed.
server.prepend('AddProduct', function (req, res, next) {
    var accessHelpers = require('*/cartridge/scripts/helpers/membershipAccessHelpers');
    var customerNo = req.currentCustomer.profile && req.currentCustomer.raw.authenticated ? req.currentCustomer.profile.customerNo : null;
    var ids = [String(req.form.pid || '')];
    if (req.form.pidsObj) {
        try {
            JSON.parse(req.form.pidsObj).forEach(function (child) { ids.push(String(child.pid || '')); });
        } catch (e) {
            ids = [];
        }
    }
    var blocked = ids.filter(Boolean).map(function (id) { return accessHelpers.checkProductIdAccess(customerNo, id); }).filter(function (access) { return !access.allowed; })[0];
    if (!blocked) return next();
    var Resource = require('dw/web/Resource');
    res.json({ error: true, message: Resource.msg('access.' + blocked.reason, 'primemembership', null) });
    this.done(req, res);
    return null;
});

module.exports = server.exports();
