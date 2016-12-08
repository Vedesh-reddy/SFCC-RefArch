'use strict';

var dwHelper = require('~/cartridge/scripts/dwHelpers');

var ACTION_ENDPOINT = 'Search-UpdateGrid';


/**
 * Retrieves sorting options
 *
 * @param {dw.catalog.ProductSearchModel} productSearch - Product search instance
 * @param {dw.util.List.<dw.catalog.SortingOption>} sortingOptions - List of sorting rule options
 * @return {SortingOption} - Sorting option
 */
function getSortingOptions(productSearch, sortingOptions) {
    return dwHelper.map(sortingOptions, function (option) {
        return {
            displayName: option.displayName,
            id: option.ID,
            url: productSearch.urlSortingRule(ACTION_ENDPOINT, option.sortingRule)
        };
    });
}

/**
 * Retrieves refined or default category sort ID
 *
 * @param {dw.catalog.ProductSearchModel} productSearch - Product search instance
 * @param {dw.catalog.Category} rootCategory - Catalog's root category
 * @return {string} - Sort rule ID
 */
function getSortRuleDefault(productSearch, rootCategory) {
    var category = productSearch.category ? productSearch.category : rootCategory;
    return category.defaultSortingRule.ID;
}

/**
 * @constructor
 * @classdesc Model that encapsulates product sort options
 *
 * @param {dw.catalog.ProductSearchModel} productSearch - Product search instance
 * @param {string|null} sortingRuleId - HTTP Param srule value
 * @param {dw.util.List.<dw.catalog.SortingOption>} sortingOptions - Sorting rule options
 * @param {dw.catalog.Category} rootCategory - Catalog's root category
 */
function ProductSortOptions(productSearch, sortingRuleId, sortingOptions, rootCategory) {
    this.options = getSortingOptions(productSearch, sortingOptions);
    this.ruleId = sortingRuleId || getSortRuleDefault(productSearch, rootCategory);
}

module.exports = ProductSortOptions;
