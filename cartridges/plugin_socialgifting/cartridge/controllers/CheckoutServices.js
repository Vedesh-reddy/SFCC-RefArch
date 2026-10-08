'use strict';

var server = require('server');
var base = module.superModule;
server.extend(base);
['PlaceOrder', 'SubmitPayment'].forEach(function (name) {
    server.prepend(name, function (req, res, next) {
        var basket = require('dw/order/BasketMgr').getCurrentBasket();
        if (basket && (basket.custom.sgRegistryKey || basket.custom.sgContributionKey)) {
            require('*/cartridge/scripts/middleware/socialGifting').noCache(res);
            if (!require('dw/web/CSRFProtection').validateRequest()) {
                res.setStatusCode(403);
                res.json({ error: true, errorMessage: 'Your session expired. Refresh and try again.' });
                this.done(req, res);
                return;
            }
        }
        next();
    });
});
module.exports = server.exports();
