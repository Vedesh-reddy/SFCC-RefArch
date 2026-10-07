'use strict';

/**
 * Journals the widget's saved-payment and place-order steps on the inherited
 * SFRA routes. The security code is never read or stored here.
 * @module controllers/CheckoutServices
 */

var server = require('server');
var journey = require('*/cartridge/scripts/helpers/journey');

server.extend(module.superModule);

server.prepend('SubmitPayment', journey.observe('saved_payment_selected', function (req) {
    return { entityID: req.form.storedPaymentUUID, context: 'step=payment' };
}));
server.prepend('PlaceOrder', journey.observe('order_placed', function (req, data) {
    return { entityID: data.orderID || '', context: 'step=place-order' };
}, function (req, data) {
    journey.recordOrder(req, data.orderID);
}));

module.exports = server.exports();
