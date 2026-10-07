'use strict';

/**
 * Observes the storefront order-confirmation page so the assistant can offer
 * the review flow for orders placed through regular checkout.
 * @module controllers/Order
 */

var server = require('server');
var journey = require('*/cartridge/scripts/helpers/journey');

server.extend(module.superModule);

server.append('Confirm', function (req, res, next) {
    var order = res.getViewData().order;
    if (order && order.orderNumber && journey.journeyKey(req, false)) {
        journey.recordOrder(req, order.orderNumber);
        journey.track(req, 'order_confirmation_observed', { entityID: order.orderNumber, context: 'source=confirmation-page', result: 'success' });
    }
    next();
});

module.exports = server.exports();
