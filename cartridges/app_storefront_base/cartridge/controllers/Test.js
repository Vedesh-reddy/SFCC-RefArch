'use strict';

var server = require('server');

server.get('Test', function (req, res, next) {
    res.render('test.isml', { CurrentPageMetaData: { title: 'Hello World!' } });
    next();
});

server.get('Form', function (req, res, next) {
    var form = server.forms.getForm('address');
    res.render('form.isml', { form: form });
    next();
});

server.post('Submit', function (req, res, next) {
    this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
        var form = server.forms.getForm('address');
        if (!form.valid) {
            res.setStatusCode(500);
        }
        res.json({ form: server.forms.getForm('address') });
    });
    next();
});

module.exports = server.exports();
