'use strict';

var server = require('server');
var security = require('*/cartridge/scripts/middleware/socialGifting');
var helper = require('*/cartridge/scripts/helpers/pollHelper');
server.post('Create', server.middleware.https, security.post('create', function (req, res, actor) { return helper.create(actor, req.form); }));
server.post('Vote', server.middleware.https, security.post('vote', function (req, res, actor) { return helper.vote(actor, req.form); }));
server.post('Close', server.middleware.https, security.post('close', function (req, res, actor) { return helper.close(actor, req.form); }));
module.exports = server.exports();
