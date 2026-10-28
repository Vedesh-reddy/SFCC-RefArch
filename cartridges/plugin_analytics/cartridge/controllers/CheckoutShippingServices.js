'use strict';

var server = require('server');

server.extend(module.superModule);

// The base route saves the shipping step in its own route:BeforeComplete listener, which runs
// before this one, so only steps the server accepted are recorded.
server.append('SubmitShipping', function (req, res, next) {
    this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
        if (!res.getViewData().error) require('*/cartridge/scripts/helpers/analyticsHelpers').shippingAccepted(require('dw/order/BasketMgr').getCurrentBasket());
    });
    next();
});

module.exports = server.exports();
