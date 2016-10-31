'use strict';

var dwHelper = require('~/cartridge/scripts/dwHelpers');


/**
 * Retrieves attribute refinement value model
 *
 * @param {dw.catalog.ProductSearchRefinementDefinition} refinementDefinition - Refinement
 *     definition for which we wish to retrieve refinement values for
 * @return {Object} - Attribute refinement value model module
 */
function getAttributeRefinementValueModel(refinementDefinition) {
    if (refinementDefinition.priceRefinement) {
        return require('~/cartridge/models/search/attributeRefinementValue/price');
    } else if (refinementDefinition.attributeID === 'refinementColor') {
        return require('~/cartridge/models/search/attributeRefinementValue/color');
    } else if (refinementDefinition.attributeID === 'size') {
        return require('~/cartridge/models/search/attributeRefinementValue/size');
    }

    return require('~/cartridge/models/search/attributeRefinementValue/boolean');
}

/**
 * Retrieve refinement values based on refinement type
 *
 * @param {dw.catalog.ProductSearchModel} productSearch - Product search object
 * @param {dw.catalog.ProductSearchRefinementDefinition} refinementDefinition - Refinement
 *     definition for which we wish to retrieve refinement values for
 * @param {dw.util.Collection.<dw.catalog.ProductSearchRefinementValue>} refinementValues -
 *     Collection of refinement values
 * @return {Array} - List of refinement values
 */
function get(productSearch, refinementDefinition, refinementValues) {
    var Model = null;

    if (refinementDefinition.categoryRefinement) {
        return [];
    }

    Model = getAttributeRefinementValueModel(refinementDefinition);
    return dwHelper.map(refinementValues, function (value) {
        return new Model(productSearch, refinementDefinition, value);
    });
}

module.exports = {
    get: get
};
