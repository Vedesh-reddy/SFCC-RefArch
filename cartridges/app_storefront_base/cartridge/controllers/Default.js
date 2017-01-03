'use strict';

var server = require('server');
var URLUtils = require('dw/web/URLUtils');

server.get('Start', function (req, res, next) {
    res.redirect(URLUtils.url('Home-Show'));
    next();
});

module.exports = server.exports();
