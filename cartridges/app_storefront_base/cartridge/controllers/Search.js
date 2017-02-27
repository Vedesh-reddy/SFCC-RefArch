'use strict';

var server = require('server');

var CatalogMgr = require('dw/catalog/CatalogMgr');
var search = require('~/cartridge/scripts/search/search');
var ProductSearchModel = require('dw/catalog/ProductSearchModel');
var ProductSearch = require('~/cartridge/models/search/productSearch');
var ProductSortOptions = require('~/cartridge/models/search/productSortOptions');


/**
 * Set search configuration values
 *
 * @param {dw.catalog.ProductSearchModel} dwProductSearch - API search instance
 * @param {Object} params - Provided HTTP query parameters
 * @return {dw.catalog.ProductSearchModel} - API search instance
 */
function setupSearch(dwProductSearch, params) {
    var sortingRule = params.srule ? CatalogMgr.getSortingRule(params.srule) : null;
    var selectedCategory = CatalogMgr.getCategory(params.cgid);
    selectedCategory = selectedCategory && selectedCategory.online ? selectedCategory : null;

    search.setProductProperties(dwProductSearch, params, selectedCategory, sortingRule);
    search.addRefinementValues(dwProductSearch, params.preferences);

    return dwProductSearch;
}

/**
 * Retrieve a category's template filepath if available
 *
 * @param {dw.catalog.ProductSearchModel} dwProductSearch - API search instance
 * @return {string} - Category's template filepath
 */
function getCategoryTemplate(dwProductSearch) {
    return dwProductSearch.category ? dwProductSearch.category.template : '';
}

server.get('UpdateGrid', function (req, res, next) {
    var params = search.parseParams(req.querystring);
    var dwProductSearch = new ProductSearchModel();
    var productSearch = {};

    dwProductSearch = setupSearch(dwProductSearch, params);
    dwProductSearch.search();
    productSearch = new ProductSearch(dwProductSearch, params);

    res.render('/search/productgrid', { productSearch: productSearch });

    next();
});

server.get('Show', function (req, res, next) {
    var categoryTemplate = '';
    var productSearch;
    var productSort;
    var isAjax = Object.hasOwnProperty.call(req.httpHeaders, 'x-requested-with')
        && req.httpHeaders['x-requested-with'] === 'XMLHttpRequest';
    var resultsTemplate = isAjax ? 'search/searchresults_nodecorator' : 'search/searchresults';
    var params = search.parseParams(req.querystring);
    var dwProductSearch = new ProductSearchModel();

    dwProductSearch = setupSearch(dwProductSearch, params);
    dwProductSearch.search();

    categoryTemplate = getCategoryTemplate(dwProductSearch);
    productSearch = new ProductSearch(dwProductSearch, params);
    productSort = new ProductSortOptions(
        dwProductSearch,
        req.querystring.srule,
        CatalogMgr.getSortingOptions(),
        CatalogMgr.getSiteCatalog().getRoot()
    );

    if (
        productSearch.isCategorySearch
        && !productSearch.isRefinedCategorySearch
        && categoryTemplate
        && dwProductSearch.category.parent.ID === 'root'
    ) {
        res.render(categoryTemplate, {
            productSearch: productSearch,
            category: dwProductSearch.category
        });
    } else {
        res.render(resultsTemplate, {
            productSearch: productSearch,
            productSort: productSort,
            category: dwProductSearch.category
        });
    }

    next();
});

server.get('GetSuggestions', function (req, res, next) {
    var SuggestModel = require('dw/suggest/SuggestModel');
    var CategorySuggestions = require('~/cartridge/models/search/suggestions/category');
    var ContentSuggestions = require('~/cartridge/models/search/suggestions/content');
    var ProductSuggestions = require('~/cartridge/models/search/suggestions/product');
    var categorySuggestions;
    var contentSuggestions;
    var productSuggestions;
    var searchTerms = req.querystring.q;
    var suggestions;
    // TODO: Move minChars and maxSuggestions to Site Preferences when ready for refactoring
    var minChars = 3;
    // Unfortunately, by default, max suggestions is set to 10 and is not configurable in Business
    // Manager.
    var maxSuggestions = 3;

    if (searchTerms.length >= minChars) {
        suggestions = new SuggestModel();
        suggestions.setSearchPhrase(searchTerms);
        suggestions.setMaxSuggestions(maxSuggestions);
        categorySuggestions = new CategorySuggestions(suggestions.categorySuggestions,
            maxSuggestions);
        contentSuggestions = new ContentSuggestions(suggestions.contentSuggestions, maxSuggestions);
        productSuggestions = new ProductSuggestions(suggestions.productSuggestions, maxSuggestions);

        if (productSuggestions.available || contentSuggestions.available
            || categorySuggestions.available) {
            res.render('search/suggestions', {
                suggestions: {
                    product: productSuggestions,
                    category: categorySuggestions,
                    content: contentSuggestions
                }
            });
        } else {
            res.json({});
        }
    } else {
        // Return an empty object that can be checked on the client.  By default, rendered
        // templates automatically get a diagnostic string injected into it, making it difficult
        // to check for a null or empty response on the client.
        res.json({});
    }

    next();
});

module.exports = server.exports();
