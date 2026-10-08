'use strict';

var server = require('server');
server.extend(module.superModule);
server.append('Begin', function (req, res, next) {
    var basket = require('dw/order/BasketMgr').getCurrentBasket();
    if (basket && (basket.custom.sgRegistryKey || basket.custom.sgContributionKey)) {
        res.setViewData({ sgGiftCheckout: true, reportingURLs: [] });
    }
    if (basket && basket.custom.sgRegistryKey) {
        require('*/cartridge/scripts/middleware/socialGifting').noCache(res);
        res.setViewData({ currentStage: 'payment', reportingURLs: [], sgPrivateDelivery: true });
    }
    return next();
});
module.exports = server.exports();
