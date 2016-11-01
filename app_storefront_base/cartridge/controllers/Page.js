'use strict';

var logger = require('dw/system/Logger');
var server = require('server');
var ContentMgr = require('dw/content/ContentMgr');
var Content = require('~/cartridge/models/content');
var catalogMgr = require('dw/catalog/CatalogMgr');
var Categories = require('~/cartridge/models/categories');
var ProductSearch = require('dw/catalog/ProductSearchModel');
var helper = require('~/cartridge/scripts/dwHelpers');

server.get('Include', server.middleware.include, function (req, res, next) {
    var contentMgr = ContentMgr.getContent(req.querystring.cid);

    if (contentMgr) {
        var content = new Content(contentMgr);
        res.cacheExpiration(24);
        res.render(content.template, { content: content });
    } else {
        logger.warn('Content asset with ID {0} was included but not found', req.querystring.cid);
    }
    next();
});

server.get('IncludeHeaderCustomerInfo', server.middleware.include, function (req, res, next) {
    var loggedIn = req.currentCustomer.raw.authenticated;
    res.render('/components/header/myaccount', { loggedIn: loggedIn });
    next();
});

server.get('IncludeHeaderMenu', server.middleware.include, function (req, res, next) {
    var siteRootCategory = catalogMgr.getSiteCatalog().getRoot();
    var ps = new ProductSearch();
    var topLevelCategories = null;
    var categories = null;
    ps.setCategoryID(siteRootCategory.getID());
    ps.search();
    topLevelCategories = ps.getRefinements().getNextLevelCategoryRefinementValues(siteRootCategory);
    categories = helper.map(topLevelCategories, function (item) {
        return catalogMgr.getCategory(item.value);
    });
    res.render('/components/header/menu', new Categories(categories));
    next();
});

module.exports = server.exports();
