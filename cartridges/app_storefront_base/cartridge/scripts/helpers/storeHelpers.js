
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
 * Returns an array of storeModel objects which have inventory for one or more PLIs
 * @param {Object} storesModel - a StoresModel instance to filter from
 * @param {Array<Object>} pliQtys - an array of objects with productID and quantityValue pairs
 * @returns {Array} - an array of StoreModel instances
 */
function getFilteredStores(storesModel, pliQtys) {
    var ProductInventoryMgr = require('dw/catalog/ProductInventoryMgr');

    var availableStores = [];
    var store;
    var inventoryList;
    var inventoryListId;
    var inventoryRecord;
    var pli;
    var productID;
    var quantity;
    var hasAvailableInventory;

    // Loop through available stores and make sure there is availability for all SKUs
    for (var i = 0, ii = storesModel.stores.length; i < ii; i++) {
        store = storesModel.stores[i];
        inventoryListId = store.inventoryListId;
        hasAvailableInventory = false;
        if (inventoryListId) {
            inventoryList = ProductInventoryMgr.getInventoryList(inventoryListId);
            for (var j = 0, jj = pliQtys.length; j < jj; j++) {
                pli = pliQtys[j];
                productID = pli.productID;
                quantity = pli.quantityValue;
                inventoryRecord = inventoryList.getRecord(productID);
                if (inventoryRecord && inventoryRecord.ATS.value >= quantity) {
                    hasAvailableInventory = true;
                } else {
                    hasAvailableInventory = false;
                    break;
                }
            }
            if (hasAvailableInventory) {
                availableStores.push(store);
            }
        }
    }
    return availableStores;
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

    var template = new Template('storelocator/storelocatorresults');
    return template.render(context).text;
}

module.exports = exports = {
    getModel: getModel,
    getFilteredStores: getFilteredStores,
    createStoresResultsHtml: createStoresResultsHtml
};
