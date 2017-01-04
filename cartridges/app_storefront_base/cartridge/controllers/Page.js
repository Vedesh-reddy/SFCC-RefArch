'use strict';

var server = require('server');

server.get('Include', server.middleware.include, function (req, res, next) {
    var ContentMgr = require('dw/content/ContentMgr');
    var Content = require('~/cartridge/models/content');
    var logger = require('dw/system/Logger');

    var contentMgr = ContentMgr.getContent(req.querystring.cid);

    if (contentMgr) {
        var content = new Content(contentMgr);
        if (content.template) {
            res.cacheExpiration(24);
            res.render(content.template, { content: content });
        } else {
            logger.warn('Content asset with ID {0} is offline', req.querystring.cid);
            res.render('/components/content/offlinecontent');
        }
    } else {
        logger.warn('Content asset with ID {0} was included but not found', req.querystring.cid);
    }
    next();
});

server.get('IncludeHeaderMenu', server.middleware.include, function (req, res, next) {
    var catalogMgr = require('dw/catalog/CatalogMgr');
    var Categories = require('~/cartridge/models/categories');
    var ProductSearch = require('dw/catalog/ProductSearchModel');
    var helper = require('~/cartridge/scripts/dwHelpers');

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

server.get('Locale', function (req, res, next) {
    var LocaleModel = require('~/cartridge/models/locale');
    var locale = require('dw/util/Locale');
    var localeModel = new LocaleModel(locale.getLocale(req.locale));

    res.render('/components/header/countryselector', localeModel);
    next();
});

module.exports = server.exports();
