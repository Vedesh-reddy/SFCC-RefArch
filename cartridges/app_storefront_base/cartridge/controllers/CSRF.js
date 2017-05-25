'use strict';

var server = require('server');

var CSRFProtection = require('~/cartridge/scripts/middleware/csrf');

server.get('Fail', function (req, res, next) {
    res.render('/csrfFail');
    next();
});

server.post('Generate', CSRFProtection.generateToken, function (req, res, next) {
    res.json();
    next();
});

module.exports = server.exports();
