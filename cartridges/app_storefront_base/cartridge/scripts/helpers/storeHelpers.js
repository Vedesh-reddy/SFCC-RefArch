
/**
 * Searches for stores and creates a plain object of the stores returned by the search
 * @param {Object} req - local instance of request object
 * @param {dw.web.URL} url - a relative url
 * @returns {Object} a plain object containing the results of the search
 */
function getModel(req, url) {
    var StoresModel = require('*/cartridge/models/stores');
    var StoreMgr = require('dw/catalog/StoreMgr');
    var Site = require('dw/system/Site');
    var URLUtils = require('dw/web/URLUtils');

    var countryCode = req.geolocation.countryCode;
    var distanceUnit = countryCode === 'US' ? 'mi' : 'km';
    var radius = req.querystring.radius ? parseInt(req.querystring.radius, 10) : 15;

    var lat;
    var long;
    var searchKey;
    var storesMgrResult;

    if (req.querystring.postalCode && req.querystring.postalCode !== '') {
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

    var actionUrl = url || URLUtils.url('Stores-FindStores').toString();
    var apiKey = Site.getCurrent().getCustomPreferenceValue('mapAPI');

    return new StoresModel(storesMgrResult.keySet(), searchKey, radius, actionUrl, apiKey);
}

/**
 * create the stores results html
 * @param {Array} storesInfo - an array of objects that contains store information
 * @returns {string} The rendered HTML
 */
function createStoresResultsHtml(storesInfo) {
    var HashMap = require('dw/util/HashMap');
    var Template = require('dw/util/Template');

    var context = new HashMap();
    var object = { stores: storesInfo };

    Object.keys(object).forEach(function (key) {
        context.put(key, object[key]);
    });

    var template = new Template('storeLocator/storeLocatorResults');
    return template.render(context).text;
}

module.exports = exports = {
    getModel: getModel,
    createStoresResultsHtml: createStoresResultsHtml
};
