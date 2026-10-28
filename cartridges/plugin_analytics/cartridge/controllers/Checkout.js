'use strict';

var server = require('server');

server.extend(module.superModule);

// Records the start of a checkout attempt; redirects back to the cart do not count.
server.append('Begin', function (req, res, next) {
    if (!res.redirectUrl) {
        require('*/cartridge/scripts/helpers/analyticsHelpers').beginCheckout(require('dw/order/BasketMgr').getCurrentBasket(), !!req.currentCustomer.raw.registered);
    }
    next();
});

module.exports = server.exports();
