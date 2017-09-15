'use strict';

var server = require('server');

var CatalogMgr = require('dw/catalog/CatalogMgr');
var cache = require('*/cartridge/scripts/middleware/cache');

/**
 * Set search configuration values
 *
 * @param {dw.catalog.ProductSearchModel} apiProductSearch - API search instance
 * @param {Object} params - Provided HTTP query parameters
 * @return {dw.catalog.ProductSearchModel} - API search instance
 */
function setupSearch(apiProductSearch, params) {
    var search = require('*/cartridge/scripts/search/search');

    var sortingRule = params.srule ? CatalogMgr.getSortingRule(params.srule) : null;
    var selectedCategory = CatalogMgr.getCategory(params.cgid);
    selectedCategory = selectedCategory && selectedCategory.online ? selectedCategory : null;

    search.setProductProperties(apiProductSearch, params, selectedCategory, sortingRule);

    if (params.preferences) {
        search.addRefinementValues(apiProductSearch, params.preferences);
    }

    return apiProductSearch;
}

/**
 * Retrieve a category's template filepath if available
 *
 * @param {dw.catalog.ProductSearchModel} apiProductSearch - API search instance
 * @return {string} - Category's template filepath
 */
function getCategoryTemplate(apiProductSearch) {
    return apiProductSearch.category ? apiProductSearch.category.template : '';
}

server.get('UpdateGrid', cache.applyPromotionSensitiveCache, function (req, res, next) {
    var ProductSearchModel = require('dw/catalog/ProductSearchModel');
    var ProductSearch = require('*/cartridge/models/search/productSearch');

    var apiProductSearch = new ProductSearchModel();
    apiProductSearch = setupSearch(apiProductSearch, req.querystring);
    apiProductSearch.search();
    var productSearch = new ProductSearch(
        apiProductSearch,
        req.querystring,
        req.querystring.srule,
        CatalogMgr.getSortingOptions(),
        CatalogMgr.getSiteCatalog().getRoot()
    );

    res.render('/search/productgrid', {
        productSearch: productSearch
    });

    next();
});

server.get('Show', cache.applyPromotionSensitiveCache, function (req, res, next) {
    var ProductSearchModel = require('dw/catalog/ProductSearchModel');
    var ProductSearch = require('*/cartridge/models/search/productSearch');
    var reportingUrls = require('*/cartridge/scripts/reportingUrls');

    var categoryTemplate = '';
    var productSearch;
    var isAjax = Object.hasOwnProperty.call(req.httpHeaders, 'x-requested-with')
        && req.httpHeaders['x-requested-with'] === 'XMLHttpRequest';
    var resultsTemplate = isAjax ? 'search/searchresults_nodecorator' : 'search/searchresults';
    var apiProductSearch = new ProductSearchModel();
    var maxSlots = 4;
    var reportingURLs;

    apiProductSearch = setupSearch(apiProductSearch, req.querystring);
    apiProductSearch.search();

    categoryTemplate = getCategoryTemplate(apiProductSearch);
    productSearch = new ProductSearch(
        apiProductSearch,
        req.querystring,
        req.querystring.srule,
        CatalogMgr.getSortingOptions(),
        CatalogMgr.getSiteCatalog().getRoot()
    );

    if (productSearch.searchKeywords !== null && !productSearch.selectedFilters.length) {
        reportingURLs = reportingUrls.getProductSearchReportingURLs(productSearch);
    }

    if (
        productSearch.isCategorySearch
        && !productSearch.isRefinedCategorySearch
        && categoryTemplate
        && apiProductSearch.category.parent.ID === 'root'
    ) {
        if (isAjax) {
            res.render(resultsTemplate, {
                productSearch: productSearch,
                maxSlots: maxSlots,
                reportingURLs: reportingURLs
            });
        } else {
            res.render(categoryTemplate, {
                productSearch: productSearch,
                maxSlots: maxSlots,
                category: apiProductSearch.category,
                reportingURLs: reportingURLs
            });
        }
    } else {
        res.render(resultsTemplate, {
            productSearch: productSearch,
            maxSlots: maxSlots,
            reportingURLs: reportingURLs
        });
    }

    next();
});

server.get('Content', cache.applyDefaultCache, function (req, res, next) {
    var ContentSearchModel = require('dw/content/ContentSearchModel');
    var ContentSearch = require('*/cartridge/models/search/contentSearch');
    var apiContentSearchModel = new ContentSearchModel();
    var contentSearch;
    var contentSearchResult;
    var queryPhrase = req.querystring.q;
    var startingPage = Number(req.querystring.startingPage);

    apiContentSearchModel.setRecursiveFolderSearch(true);
    apiContentSearchModel.setSearchPhrase(req.querystring.q);
    apiContentSearchModel.search();
    contentSearchResult = apiContentSearchModel.getContent();
    var count = Number(apiContentSearchModel.getCount());
    contentSearch = new ContentSearch(contentSearchResult, count, queryPhrase, startingPage, null);

    res.render('/search/contentgrid', {
        contentSearch: contentSearch
    });
    next();
});

server.get('GetSuggestions', cache.applyDefaultCache, function (req, res, next) {
    var SuggestModel = require('dw/suggest/SuggestModel');
    var CategorySuggestions = require('*/cartridge/models/search/suggestions/category');
    var ContentSuggestions = require('*/cartridge/models/search/suggestions/content');
    var ProductSuggestions = require('*/cartridge/models/search/suggestions/product');
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
        categorySuggestions = new CategorySuggestions(suggestions, maxSuggestions);
        contentSuggestions = new ContentSuggestions(suggestions, maxSuggestions);
        productSuggestions = new ProductSuggestions(suggestions, maxSuggestions);

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
