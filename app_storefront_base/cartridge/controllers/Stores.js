'use strict';

var server = require('server');

/**
 * Searches for stores and creates a plain object of the stores returned by the search
 * @param {Object} req - local instance of request object
 * @returns {Object} a plain object containing the results of the search
 */
function getModel(req) {
    var StoresModel = require('~/cartridge/models/stores');
    var StoreMgr = require('dw/catalog/StoreMgr');
    var URLUtils = require('dw/web/URLUtils');
    var Site = require('dw/system/Site');

    var countryCode = req.geolocation.countryCode;
    var distanceUnit = countryCode === 'US' ? 'mi' : 'km';
    var radius = req.querystring.radius ? parseInt(req.querystring.radius, 10) : 100;

    var lat;
    var long;
    var searchKey;
    var storesMgrResult;

    if (req.querystring.postalCode) {
        // find by postal code
        searchKey = req.querystring.postalCode;
        storesMgrResult = StoreMgr.searchStoresByPostalCode(
            countryCode,
            searchKey,
            distanceUnit,
            radius
        );
        searchKey = { postalCode: searchKey };
    } else if (req.querystring.lat && req.querystring.long) {
        // find by coordinates (detect location)
        lat = parseFloat(req.querystring.lat);
        long = parseFloat(req.querystring.long);

        storesMgrResult = StoreMgr.searchStoresByCoordinates(lat, long, distanceUnit, radius);
        searchKey = { lat: lat, long: long };
    } else {
        // initial load dw geolocation
        lat = req.geolocation.latitude;
        long = req.geolocation.longitude;

        storesMgrResult = StoreMgr.searchStoresByCoordinates(lat, long, distanceUnit, radius);
        searchKey = { lat: lat, long: long };
    }

    var actionUrl = URLUtils.url('Stores-FindStores').toString();
    var apiKey = Site.getCurrent().getCustomPreferenceValue('mapAPI');

    return new StoresModel(storesMgrResult.keySet(), searchKey, radius, actionUrl, apiKey);
}

server.get('Find', server.middleware.https, function (req, res, next) {
    res.render('storelocator/storelocator', getModel(req));
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
    res.json(getModel(req));
    next();
});

module.exports = server.exports();
