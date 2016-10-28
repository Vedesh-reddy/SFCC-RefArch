'use strict';

var server = require('server');
var locale = require('~/cartridge/scripts/middleware/locale');
var ProductSearch = require('~/cartridge/models/search/productSearch');


server.get('Show', locale, function (req, res, next) {
    var productSearch = new ProductSearch(req.querystring);

    res.render('search/searchresults', {
        isCategorySearch: productSearch.isCategorySearch,
        categoryName: productSearch.categoryName,
        productIds: productSearch.productIds,
        refinements: productSearch.refinements,
        resetLink: productSearch.resetLink,
        searchKeywords: req.querystring.q,
        selectedFilters: productSearch.selectedFilters
    });

    next();
});

module.exports = server.exports();
