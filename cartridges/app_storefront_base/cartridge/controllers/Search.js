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

module.exports = server.exports();
