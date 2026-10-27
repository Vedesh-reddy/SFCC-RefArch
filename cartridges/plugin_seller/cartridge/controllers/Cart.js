'use strict';

var server = require('server');

server.extend(module.superModule);

// Editing swaps the product or options of a line; an offer line is tied to one seller's
// offer for one product, so the shopper removes it and adds the other item instead.
server.prepend('EditProductLineItem', function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var basket = BasketMgr.getCurrentBasket();
    var uuid = String(req.form.uuid || '');
    var line = basket ? basket.productLineItems.toArray().filter(function (pli) { return pli.UUID === uuid; })[0] : null;
    if (line && line.custom.mktOfferId) {
        res.setStatusCode(500);
        res.json({ error: true, errorMessage: require('dw/web/Resource').msg('error.offer.edit', 'seller', null) });
        this.done(req, res);
        return null;
    }
    return next();
});

module.exports = server.exports();
