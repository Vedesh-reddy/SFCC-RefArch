'use strict';

/**
 * Journals the widget's delivery-address step on the inherited SFRA route.
 * @module controllers/CheckoutShippingServices
 */

var server = require('server');
var journey = require('*/cartridge/scripts/helpers/journey');

server.extend(module.superModule);

server.prepend('SubmitShipping', journey.observe('delivery_address_chosen', function (req) {
    return { entityID: req.form.dwfrm_shipping_shippingAddress_shippingMethodID, context: 'step=shipping' };
}));

module.exports = server.exports();
