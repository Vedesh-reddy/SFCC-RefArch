'use strict';

/**
 * Journals widget-originated saved-card deletion on the inherited SFRA route.
 * Only the opaque payment instrument UUID is stored.
 * @module controllers/PaymentInstruments
 */

var server = require('server');
var journey = require('*/cartridge/scripts/helpers/journey');

server.extend(module.superModule);

server.prepend('DeletePayment', journey.observe('saved_payment_deleted', function (req) {
    return { entityID: req.querystring.UUID };
}));

module.exports = server.exports();
