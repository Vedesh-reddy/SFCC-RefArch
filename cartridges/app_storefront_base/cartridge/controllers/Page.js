'use strict';

var server = require('server');

var ContentMgr = require('dw/content/ContentMgr');
var Logger = require('dw/system/Logger');
var Locale = require('dw/util/Locale');
var Site = require('dw/system/Site');

var ContentModel = require('~/cartridge/models/content');

server.get('Include', server.middleware.include, function (req, res, next) {
    var apiContent = ContentMgr.getContent(req.querystring.cid);

    if (apiContent) {
        var content = new ContentModel(apiContent, 'components/content/contentassetinc');
        if (content.template) {
            res.cacheExpiration(24);
            res.render(content.template, { content: content });
        } else {
            Logger.warn('Content asset with ID {0} is offline', req.querystring.cid);
            res.render('/components/content/offlinecontent');
        }
    } else {
        Logger.warn('Content asset with ID {0} was included but not found', req.querystring.cid);
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

server.get('SetLocale', function (req, res, next) {
    var URLUtils = require('dw/web/URLUtils');
    var Currency = require('dw/util/Currency');
    var QueryString = server.querystring;
    var currency;
    var currentSite = Site.getCurrent();
    var allowedCurrencies = currentSite.allowedCurrencies;
    var queryStringObj = new QueryString(req.querystring.queryString || '');

    if (Object.hasOwnProperty.call(queryStringObj, 'lang')) {
        delete queryStringObj.lang;
    }

    if (req.setLocale(req.querystring.code)) {
        currency = Currency.getCurrency(req.querystring.CurrencyCode);
        if (allowedCurrencies.indexOf(req.querystring.CurrencyCode) > -1
            && (req.querystring.CurrencyCode !== req.session.currency.currencyCode)) {
            req.session.setCurrency(currency);
        }

        var redirectUrl = URLUtils.url(req.querystring.action).toString();
        var qsConnector = redirectUrl.indexOf('?') >= 0 ? '&' : '?';

        redirectUrl = Object.keys(queryStringObj).length === 0
            ? redirectUrl += queryStringObj.toString()
            : redirectUrl += qsConnector + queryStringObj.toString();

        res.json({
            success: true,
            redirectUrl: redirectUrl
        });
    } else {
        res.json({ error: true }); // TODO: error message
    }
    next();
});

server.get('Locale', function (req, res, next) {
    var LocaleModel = require('~/cartridge/models/locale');
    var currentSite = Site.getCurrent();
    var siteId = currentSite.getID();
    var allowedLocales = currentSite.allowedLocales;
    var currentLocale = Locale.getLocale(req.locale.id);
    var localeModel = new LocaleModel(currentLocale, allowedLocales, siteId);

    res.render('/components/header/countryselector', {
        localeModel: localeModel,
        showInMenu: req.querystring.showInMenu
    });
    next();
});

server.get('Show', function (req, res, next) {
    var apiContent = ContentMgr.getContent(req.querystring.cid);

    if (apiContent) {
        var content = new ContentModel(apiContent, 'content/contentasset');
        if (content.template) {
            res.cacheExpiration(24);
            res.render(content.template, { content: content });
        } else {
            Logger.warn('Content asset with ID {0} is offline', req.querystring.cid);
            res.render('/components/content/offlinecontent');
        }
    } else {
        Logger.warn('Content asset with ID {0} was included but not found', req.querystring.cid);
    }

    next();
});

module.exports = server.exports();
