'use strict';

var server = require('server');
var URLUtils = require('dw/web/URLUtils');
var cache = require('*/cartridge/scripts/middleware/cache');

server.get('Start', cache.applyDefaultCache, function (req, res, next) {
    res.redirect(URLUtils.url('Home-Show'));
    next();
});

module.exports = server.exports();
