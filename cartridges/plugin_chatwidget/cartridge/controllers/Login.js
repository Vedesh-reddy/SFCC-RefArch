'use strict';

/**
 * Closes the assistant journey when the shopper signs out from the storefront.
 * @module controllers/Login
 */

var server = require('server');
var journey = require('*/cartridge/scripts/helpers/journey');

server.extend(module.superModule);

server.prepend('Logout', function (req, res, next) {
    if (journey.journeyKey(req, false)) {
        journey.track(req, 'logout', { context: 'source=storefront', result: 'success' });
        journey.endJourney(req);
    }
    next();
});

module.exports = server.exports();
