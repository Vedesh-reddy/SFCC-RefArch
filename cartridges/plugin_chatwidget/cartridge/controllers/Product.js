'use strict';

/**
 * Journals widget-originated variant selection on the inherited SFRA route.
 * @module controllers/Product
 */

var server = require('server');
var journey = require('*/cartridge/scripts/helpers/journey');

server.extend(module.superModule);

server.prepend('Variation', journey.observe('variant_selected', function (req, data) {
    return { entityID: data.product ? data.product.id : req.querystring.pid };
}));

module.exports = server.exports();
