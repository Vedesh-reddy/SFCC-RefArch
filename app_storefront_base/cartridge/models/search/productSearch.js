'use strict';

var dwHelper = require('~/cartridge/scripts/dwHelpers');

/**
 * @constructor
 * @classdesc ProductSearch view model
 *
 * @param {dw.catalog.ProductSearchModel} productSearch - Product search object
 */
function ProductSearch(productSearch) {
    this.productIds = dwHelper.pluck(productSearch.productSearchHits.asList(), 'productID');
}

module.exports = ProductSearch;
