'use strict';

var server = require('server');
var base = module.superModule;
server.extend(base);
var names = ["AddProduct", "UpdateQuantity", "RemoveProductLineItem", "EditProductLineItem", "AddCoupon", "RemoveCouponLineItem"];
names.forEach(function (name) {
    if (!base.__routes[name]) return;
    server.prepend(name, function (req, res, next) {
        var basket = require('dw/order/BasketMgr').getCurrentBasket();
        if (basket && (basket.custom.sgRegistryKey || basket.custom.sgContributionKey)) {
            var security = require('*/cartridge/scripts/middleware/socialGifting');
            security.noCache(res);
            res.setStatusCode(409);
            res.json({ error: true, success: false, errorMessage: 'Use the registry checkout to change this gift.' });
            this.done(req, res);
            return;
        }
        next();
    });
});
module.exports = server.exports();
