'use strict';

var server = require('server');
var security = require('*/cartridge/scripts/middleware/socialGifting');
var csrf = require('*/cartridge/scripts/middleware/csrf');
var gifts = require('*/cartridge/scripts/helpers/groupGiftHelper');
var URLUtils = require('dw/web/URLUtils');
server.get('View', server.middleware.https, csrf.generateToken, security.page(function (req, res) {
    var gift = gifts.get(req.querystring.key);
    res.render('groupGift/groupGift', { gift: new (require('*/cartridge/models/groupGift'))(gift, security.actor(req, gift.custom.registryKey)) });
}));
server.post('Create', server.middleware.https, security.post('group', function (req, res, actor) { return { giftKey: gifts.create(actor, req.form) }; }));
server.post('Cancel', server.middleware.https, security.post('group', function (req, res, actor) { gifts.stop(actor, req.form); }));
server.post('Contribute', server.middleware.https, security.post('contribute', function (req, res, actor) {
    require('*/cartridge/scripts/helpers/contributionCheckoutHelper').add(actor, req.form);
    return { redirectUrl: URLUtils.https('Checkout-Begin').toString() };
}));
module.exports = server.exports();
