'use strict';

var server = require('server');

var StoreHelpers = require('*/cartridge/scripts/helpers/storeHelpers');
var cache = require('*/cartridge/scripts/middleware/cache');

server.get('Find', server.middleware.https, cache.applyDefaultCache, function (req, res, next) {
    res.render('storeLocator/storeLocator', StoreHelpers.getModel(req));
    next();
});

// The req parameter in the unnamed callback function is a local instance of the request object.
// The req parameter has a property called querystring. In this use case the querystring could
// have the following:
// lat - The latitude of the users position.
// long - The longitude of the users position.
// radius - The radius that the user selected to refine the search
// or
// postalCode - The postal code that the user used to search.
// radius - The radius that the user selected to refine the search
server.get('FindStores', function (req, res, next) {
    res.json(StoreHelpers.getModel(req));
    next();
});

module.exports = server.exports();
