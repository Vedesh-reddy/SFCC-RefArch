'use strict';

var server = require('server');
var locale = require('~/cartridge/scripts/middleware/locale');

server.get('Test', locale, function (req, res, next) {
    res.render('test.isml', { CurrentPageMetaData: { title: 'Hello World!' } });
    next();
});

server.get('Form', locale, function (req, res, next) {
    var form = server.forms.getForm('shippingaddress');
    res.render('form.isml', { form: form });
    next();
});

server.post('Submit', function (req, res, next) {
    this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
        var form = server.forms.getForm('shippingaddress');
        if (!form.valid) {
            res.setStatusCode(500);
        }
        res.json({ form: server.forms.getForm('shippingaddress') });
    });
    next();
});

module.exports = server.exports();
