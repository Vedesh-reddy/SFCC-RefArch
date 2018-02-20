'use strict';

var server = require('server');
var cache = require('*/cartridge/scripts/middleware/cache');
var consentTracking = require('*/cartridge/scripts/middleware/consentTracking');

server.get('Show', consentTracking.consent, cache.applyDefaultCache, function (req, res, next) {
    res.render('/home/homePage');
    next();
});

server.get('ErrorNotFound', function (req, res, next) {
    res.setStatusCode(404);
    res.render('error/notFound');
    next();
});

module.exports = server.exports();
