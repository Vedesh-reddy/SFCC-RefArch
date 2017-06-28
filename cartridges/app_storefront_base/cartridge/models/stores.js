'use strict';

var HashMap = require('dw/util/HashMap');
var Template = require('dw/util/Template');

/**
 * Creates an array of objects containing store information
 * @param {dw.util.Set} storesObject - a set of <dw.catalog.Store> objects
 * @returns {Array} an array of objects that contains store information
 */
function createStoresObject(storesObject) {
    return Object.keys(storesObject).map(function (key) {
        var store = storesObject[key];
        var storeObj = {
            ID: store.ID,
            name: store.name,
            address1: store.address1,
            address2: store.address2,
            city: store.city,
            postalCode: store.postalCode,
            latitude: store.latitude,
            longitude: store.longitude
        };

        if (store.phone) {
            storeObj.phone = store.phone;
        }

        if (store.stateCode) {
            storeObj.stateCode = store.stateCode;
        }

        if (store.countryCode) {
            storeObj.countryCode = store.countryCode.value;
        }

        if (store.stateCode) {
            storeObj.stateCode = store.stateCode;
        }

        if (store.storeHours) {
            storeObj.storeHours = store.storeHours.markup;
        }

        if (store.inventoryListID || (store.custom && store.custom.inventoryListId)) {
            storeObj.inventoryListId = store.inventoryListID || store.custom.inventoryListId;
        }

        return storeObj;
    });
}

/**
 * Creates an array of objects containing the coordinates of the store's returned by the search
 * @param {dw.util.Set} storesObject - a set of <dw.catalog.Store> objects
 * @returns {Array} an array of coordinates  objects
 */
function createGeoLocationObject(storesObject) {
    return Object.keys(storesObject).map(function (key) {
        var store = storesObject[key];

        return {
            name: store.name,
            latitude: store.latitude,
            longitude: store.longitude
        };
    });
}

/**
 * If there is an api key creates the url to include the google maps api else returns null
 * @param {string} apiKey - the api key or null
 * @returns {string|Null} return the api
 */
function getGoogleMapsApi(apiKey) {
    var googleMapsApi;
    if (apiKey) {
        googleMapsApi = 'https://maps.googleapis.com/maps/api/js?key=' + apiKey;
    } else {
        googleMapsApi = null;
    }

    return googleMapsApi;
}

/**
 * create the stores results html
 * @param {Array} storesInfo - an array of objects that contains store information
 * @returns {string} The rendered HTML
 */
function createStoresResultsHtml(storesInfo) {
    var context = new HashMap();
    var object = { stores: storesInfo };
    Object.keys(object).forEach(function (key) {
        context.put(key, object[key]);
    });

    var template = new Template('storelocator/storelocatorresults');
    return template.render(context).text;
}

/**
 * @constructor
 * @classdesc The stores model
 * @param {dw.util.Set} storesResultsObject - a set of <dw.catalog.Store> objects
 * @param {Object} searchKey - what the user searched by (location or postal code)
 * @param {number} searchRadius - the radius used in the search
 * @param {dw.web.URL} actionUrl - a relative url
 * @param {string} apiKey - the google maps api key that is set in site preferences
 */
function stores(storesResultsObject, searchKey, searchRadius, actionUrl, apiKey) {
    this.stores = createStoresObject(storesResultsObject);
    this.locations = JSON.stringify(createGeoLocationObject(storesResultsObject));
    this.searchKey = searchKey;
    this.radius = searchRadius;
    this.actionUrl = actionUrl;
    this.googleMapsApi = getGoogleMapsApi(apiKey);
    this.radiusOptions = [15, 30, 50, 100, 300];
    this.storesResultsHtml = this.stores ? createStoresResultsHtml(this.stores) : null;
}

module.exports = stores;
