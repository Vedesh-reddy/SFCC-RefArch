'use strict';

var dwHelper = require('~/cartridge/scripts/dwHelpers');
var searchRefinementsFactory = require('~/cartridge/scripts/factories/searchRefinements/main');
var URLUtils = require('dw/web/URLUtils');

var ACTION_ENDPOINT = 'Search-Show';


/**
 * Generates URL that removes refinements, essentially resetting search criteria
 *
 * @param {dw.catalog.ProductSearchModel} search - Product search object
 * @param {Object} httpParams - Query params
 * @param {string} [httpParams.q] - Search keywords
 * @param {string} [httpParams.cgid] - Category ID
 * @return {string} - URL to reset query to original search
 */
function getResetLink(search, httpParams) {
    return search.categorySearch
        ? URLUtils.url(ACTION_ENDPOINT, 'cgid', httpParams.cgid)
        : URLUtils.url(ACTION_ENDPOINT, 'q', httpParams.q);
}

/**
 * Retrieves search refinements
 *
 * @param {dw.catalog.ProductSearchModel} productSearch - Product search object
 * @param {dw.catalog.ProductSearchRefinements} refinements - Search refinements
 * @param {ArrayList.<dw.catalog.ProductSearchRefinementDefinition>} refinementDefinitions - List of
 *     product serach refinement definitions
 * @return {Refinement[]} - List of parsed refinements
 */
function getRefinements(productSearch, refinements, refinementDefinitions) {
    return dwHelper.map(refinementDefinitions, function (definition) {
        var refinementValues = refinements.getAllRefinementValues(definition);
        var values = searchRefinementsFactory.get(productSearch, definition, refinementValues);

        return {
            displayName: definition.displayName,
            isCategoryRefinement: definition.categoryRefinement,
            isAttributeRefinement: definition.attributeRefinement,
            isPriceRefinement: definition.priceRefinement,
            values: values
        };
    });
}

/**
 * Returns the refinement values that have been selected
 *
 * @param {dw.catalog.ProductSearchModel} productSearch - Product search object
 * @param {Array.<CategoryRefinementValue|AttributeRefinementValue|PriceRefinementValue>}
 *     refinements - List of all relevant refinements for this search
 * @return {Object[]} - List of selected filters
 */
function getSelectedFilters(productSearch, refinements) {
    var selectedFilters = [];
    var selectedValues = [];

    refinements.forEach(function (refinement) {
        selectedValues = refinement.values.filter(function (value) { return value.selected; });
        if (selectedValues.length) {
            selectedFilters.push.apply(selectedFilters, selectedValues);
        }
    });

    return selectedFilters;
}

/**
 * @constructor
 * @classdesc ProductSearch class
 *
 * @param {dw.catalog.ProductSearchModel} productSearch - Product search object
 * @param {Object} httpParams - HTTP query parameters
 */
function ProductSearch(productSearch, httpParams) {
    this.isCategorySearch = productSearch.categorySearch;
    this.searchKeywords = productSearch.searchPhrase;
    this.refinements = getRefinements(
        productSearch,
        productSearch.refinements,
        productSearch.refinements.refinementDefinitions
    );
    this.selectedFilters = getSelectedFilters(productSearch, this.refinements);
    this.resetLink = getResetLink(productSearch, httpParams);
    this.productIds = dwHelper.pluck(productSearch.productSearchHits.asList(), 'productID');

    if (productSearch.category) {
        this.categoryName = productSearch.category.displayName;
    }
}

module.exports = ProductSearch;
