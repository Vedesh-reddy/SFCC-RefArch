'use strict';

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
    createStoresResultsHtml: createStoresResultsHtml
};
