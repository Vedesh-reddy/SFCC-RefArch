'use strict';

/**
 * @constructor
 * @classdesc Basic refinement object
 *
 * @property {String} displayName
 * @property {Boolean} isCategoryRefinement
 * @property {Boolean} isAttributeRefinement
 * @property {Boolean} isPriceRefinement
 * @property {Array.<dw.catalog.Category|dw.catalog.ProductSearchRefinementValue>} values
 */
function Refinement(definition, values) {
    this.displayName = definition.displayName;
    this.isCategoryRefinement = definition.categoryRefinement;
    this.isAttributeRefinement = definition.attributeRefinement;
    this.isPriceRefinement = definition.priceRefinement;
    this.values = values;
}

module.exports = Refinement;
