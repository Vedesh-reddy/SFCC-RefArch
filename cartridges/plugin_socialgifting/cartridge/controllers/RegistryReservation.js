'use strict';

var server = require('server');
var security = require('*/cartridge/scripts/middleware/socialGifting');
var helper = require('*/cartridge/scripts/helpers/reservationHelper');
server.post('Create', server.middleware.https, security.post('create', function (req, res, actor) { return helper.create(actor, req.form); }));
server.post('Cancel', server.middleware.https, security.post('cancel', function (req, res, actor) { return helper.cancel(actor, req.form); }));
module.exports = server.exports();
