'use strict';

var server = require('server');

server.extend(module.superModule);

// Runs after the base route's route:BeforeComplete listener, so only accepted payment steps count.
server.append('SubmitPayment', function (req, res, next) {
    this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
        if (!res.getViewData().error) require('*/cartridge/scripts/helpers/analyticsHelpers').paymentAccepted(require('dw/order/BasketMgr').getCurrentBasket());
    });
    next();
});

// Ties a placed order to its checkout attempt. Purchase figures are read from the order by
// the reconciliation job, never from this request.
server.append('PlaceOrder', function (req, res, next) {
    var viewData = res.getViewData();
    if (!viewData.error && viewData.orderID) {
        var order = require('dw/order/OrderMgr').getOrder(viewData.orderID, viewData.orderToken);
        if (order) require('*/cartridge/scripts/helpers/analyticsHelpers').linkOrder(order);
    }
    next();
});

module.exports = server.exports();
