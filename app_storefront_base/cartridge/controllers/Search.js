'use strict';

var server = require('server');
var locale = require('~/cartridge/scripts/middleware/locale');

var CatalogMgr = require('dw/catalog/CatalogMgr');
var search = require('~/cartridge/scripts/search/search');
var ProductSearchModel = require('dw/catalog/ProductSearchModel');
var ProductSearch = require('~/cartridge/models/search/productSearch');
var ProductSortOptions = require('~/cartridge/models/search/productSortOptions');


server.get('Show', locale, function (req, res, next) {
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

    productSearch = new ProductSearch(dwProductSearch, params);
    productSort = new ProductSortOptions(
        dwProductSearch,
        req.querystring.srule,
        CatalogMgr.getSortingOptions(),
        CatalogMgr.getSiteCatalog().getRoot()
    );

    res.render('search/searchresults', {
        productSearch: productSearch,
        productSort: productSort
    });

    next();
});

module.exports = server.exports();
