'use strict';

var server = require('server');
var security = require('*/cartridge/scripts/middleware/socialGifting');
var helper = require('*/cartridge/scripts/helpers/registryCommentHelper');
server.post('Add', server.middleware.https, security.post('add', function (req, res, actor) { return helper.add(actor, req.form); }));
server.post('Delete', server.middleware.https, security.post('remove', function (req, res, actor) { return helper.remove(actor, req.form); }));
module.exports = server.exports();
