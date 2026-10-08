'use strict';

var server = require('server');
var security = require('*/cartridge/scripts/middleware/socialGifting');
var URLUtils = require('dw/web/URLUtils');
server.post('Add', server.middleware.https, security.post('purchase', function (req, res, actor) {
    require('*/cartridge/scripts/helpers/registryCheckoutHelper').add(actor, req.form);
    return { redirectUrl: URLUtils.https('Checkout-Begin', 'stage', 'payment').toString() };
}));
server.post('Cancel', server.middleware.https, security.post('cancel', function (req, res, actor) {
    require('*/cartridge/scripts/helpers/registryCheckoutHelper').cancel(actor);
    return { redirectUrl: URLUtils.https('Cart-Show').toString() };
}));
module.exports = server.exports();
