'use strict';

var server = require('server');

var cache = require('*/cartridge/scripts/middleware/cache');
var consentTracking = require('*/cartridge/scripts/middleware/consentTracking');
var pageMetaData = require('*/cartridge/scripts/middleware/pageMetaData');

server.get('UpdateGrid', function (req, res, next) {
    var CatalogMgr = require('dw/catalog/CatalogMgr');
    var ProductSearchModel = require('dw/catalog/ProductSearchModel');
    var searchHelper = require('*/cartridge/scripts/helpers/searchHelpers');
    var ProductSearch = require('*/cartridge/models/search/productSearch');

    var apiProductSearch = new ProductSearchModel();
    apiProductSearch = searchHelper.setupSearch(apiProductSearch, req.querystring, req.httpParameterMap);
    apiProductSearch.search();

    if (!apiProductSearch.personalizedSort) {
        searchHelper.applyCache(res);
    }
    var productSearch = new ProductSearch(
        apiProductSearch,
        req.querystring,
        req.querystring.srule,
        CatalogMgr.getSortingOptions(),
        CatalogMgr.getSiteCatalog().getRoot()
    );

    res.render('/search/productGrid', {
        productSearch: productSearch
    });

    next();
});

server.get('Refinebar', cache.applyDefaultCache, function (req, res, next) {
    var CatalogMgr = require('dw/catalog/CatalogMgr');
    var ProductSearchModel = require('dw/catalog/ProductSearchModel');
    var ProductSearch = require('*/cartridge/models/search/productSearch');
    var searchHelper = require('*/cartridge/scripts/helpers/searchHelpers');

    var apiProductSearch = new ProductSearchModel();
    apiProductSearch = searchHelper.setupSearch(apiProductSearch, req.querystring, req.httpParameterMap);
    apiProductSearch.search();
    var productSearch = new ProductSearch(
        apiProductSearch,
        req.querystring,
        req.querystring.srule,
        CatalogMgr.getSortingOptions(),
        CatalogMgr.getSiteCatalog().getRoot()
    );
    res.render('/search/searchRefineBar', {
        productSearch: productSearch,
        querystring: req.querystring
    });

    next();
}, pageMetaData.computedPageMetaData);

server.get('ShowAjax', cache.applyShortPromotionSensitiveCache, consentTracking.consent, function (req, res, next) {
    var searchHelper = require('*/cartridge/scripts/helpers/searchHelpers');

    var result = searchHelper.search(req, res);

    if (result.searchRedirect) {
        res.redirect(result.searchRedirect);
        return next();
    }

    res.render('search/searchResultsNoDecorator', {
        productSearch: result.productSearch,
        maxSlots: result.maxSlots,
        reportingURLs: result.reportingURLs,
        refineurl: result.refineurl
    });

    return next();
}, pageMetaData.computedPageMetaData);

server.get('Show', cache.applyShortPromotionSensitiveCache, consentTracking.consent, function (req, res, next) {
    var searchHelper = require('*/cartridge/scripts/helpers/searchHelpers');

    if (req.querystring.cgid) {
        var pageLookupResult = searchHelper.getPageDesignerCategoryPage(req.querystring.cgid);

        if ((pageLookupResult.page && pageLookupResult.page.hasVisibilityRules()) || pageLookupResult.invisiblePage) {
            // the result may be different for another user, do not cache on this level
            // the page itself is a remote include and can still be cached
            res.cachePeriod = 0; // eslint-disable-line no-param-reassign
        }

        if (pageLookupResult.page) {
            res.page(pageLookupResult.page.ID, {}, pageLookupResult.aspectAttributes);
            return next();
        }
    }

    var template = 'search/searchResults';

    var result = searchHelper.search(req, res);

    if (result.searchRedirect) {
        res.redirect(result.searchRedirect);
        return next();
    }

    if (result.category && result.categoryTemplate) {
        template = result.categoryTemplate;
    }

    var redirectGridUrl = searchHelper.backButtonDetection(req.session.clickStream);
    if (redirectGridUrl) {
        res.redirect(redirectGridUrl);
    }

    res.render(template, {
        productSearch: result.productSearch,
        maxSlots: result.maxSlots,
        reportingURLs: result.reportingURLs,
        refineurl: result.refineurl,
        category: result.category ? result.category : null,
        canonicalUrl: result.canonicalUrl,
        schemaData: result.schemaData,
        apiProductSearch: result.apiProductSearch
    });

    return next();
}, pageMetaData.computedPageMetaData);

server.get('Content', cache.applyDefaultCache, consentTracking.consent, function (req, res, next) {
    var searchHelper = require('*/cartridge/scripts/helpers/searchHelpers');

    var contentSearch = searchHelper.setupContentSearch(req.querystring);
    res.render('/search/contentGrid', {
        contentSearch: contentSearch
    });
    next();
});

module.exports = server.exports();
