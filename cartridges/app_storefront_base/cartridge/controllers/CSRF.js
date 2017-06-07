'use strict';

var server = require('server');

var csrfProtection = require('*/cartridge/scripts/middleware/csrf');

server.get('Fail', function (req, res, next) {
    res.render('/csrfFail');
    next();
});

server.post('Generate', csrfProtection.generateToken, function (req, res, next) {
    res.json();
    next();
});

module.exports = server.exports();
