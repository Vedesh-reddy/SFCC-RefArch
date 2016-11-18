'use strict';

var server = require('server');

var CatalogMgr = require('dw/catalog/CatalogMgr');
var search = require('~/cartridge/scripts/search/search');
var ProductSearchModel = require('dw/catalog/ProductSearchModel');
var ProductSearch = require('~/cartridge/models/search/productSearch');
var ProductSortOptions = require('~/cartridge/models/search/productSortOptions');


server.get('Show', function (req, res, next) {
    var categoryTemplate = '';
    var productSearch;
    var productSort;
    var dwProductSearch = new ProductSearchModel();

    var params = search.parseParams(req.querystring);
    var selectedCategory = CatalogMgr.getCategory(params.cgid);
    var sortingRule = params.srule ? CatalogMgr.getSortingRule(params.srule) : null;

    selectedCategory = selectedCategory && selectedCategory.online ? selectedCategory : null;

    search.setProductProperties(dwProductSearch, params, selectedCategory, sortingRule);
    search.addRefinementValues(dwProductSearch, params.preferences);

    dwProductSearch.search();

    categoryTemplate = dwProductSearch.category ? dwProductSearch.category.template : '';
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
        res.render('search/searchresults', {
            productSearch: productSearch,
            productSort: productSort,
            category: dwProductSearch.category
        });
    }

    next();
});

module.exports = server.exports();
