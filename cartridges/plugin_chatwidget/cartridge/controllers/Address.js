'use strict';

/**
 * Journals widget-originated address-book changes on the inherited SFRA
 * Address routes. Address values are never stored.
 * @module controllers/Address
 */

var server = require('server');
var journey = require('*/cartridge/scripts/helpers/journey');

server.extend(module.superModule);

server.prepend('SaveAddress', journey.observe('address_saved', function (req) {
    return { context: req.querystring.addressId ? 'mode=edit' : 'mode=add' };
}));
server.prepend('DeleteAddress', journey.observe('address_deleted'));

module.exports = server.exports();
