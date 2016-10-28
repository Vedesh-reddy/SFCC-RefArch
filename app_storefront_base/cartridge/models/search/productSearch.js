'use strict';

var BaseSearch = require('~/cartridge/models/search/baseSearch');
var CatalogMgr = require('dw/catalog/CatalogMgr');
var ProductSearchModel = require('dw/catalog/ProductSearchModel');
var dwHelper = require('~/cartridge/scripts/dwHelpers');
var Refinement = require('~/cartridge/models/search/refinement');
var searchRefinementsFactory = require('~/cartridge/scripts/factories/searchRefinements/main');
var URLUtils = require('dw/web/URLUtils');

var ACTION_ENDPOINT = BaseSearch.actionEndpoint;


/**
 * Sets the relevant product search model properties, depending on the parameters provided
 *
 * @param {dw.content.ProductSearchModel|dw.content.ContentSearchModel} productSearch
 * @param {Object} httpParams
 * @return {dw.content.ProductSearchModel} - Processed product search model
 */
function setProperties(productSearch, httpParams) {
    var category;
    var sortingRule;

    productSearch.setRecursiveCategorySearch(true);

    if (httpParams.pid) {
        productSearch.setProductID(httpParams.pid);
    }
    if (httpParams.pmin) {
        productSearch.setPriceMin(parseInt(httpParams.pmin, 10));
    }
    if (httpParams.pmax) {
        productSearch.setPriceMax(parseInt(httpParams.pmax, 10));
    }

    sortingRule = httpParams.srule ? CatalogMgr.getSortingRule(httpParams.srule) : null;

    if (sortingRule) {
        productSearch.setSortingRule(sortingRule);
    }

    if (httpParams.cgid) {
        category = CatalogMgr.getCategory(httpParams.cgid);
        if (category && category.online) {
            productSearch.setCategoryID(category.getID());
        }
    }

    productSearch.search();

    return productSearch;
}

/**
 * Generates URL that removes refinements, essentially resetting search criteria
 *
 * @param {dw.catalog.ProductSearchModel} dwProductSearch - Product search object
 * @param {Object} httpParams - Query params
 * @param {String} [httpParams.q] - Search keywords
 * @param {String} [httpParams.cgid] - Category ID
 * @return {String}
 */
function getResetLink(search, httpParams) {
    return search.categorySearch
        ? URLUtils.url(ACTION_ENDPOINT, 'cgid', httpParams.cgid)
        : URLUtils.url(ACTION_ENDPOINT, 'q', httpParams.q);
}

/**
 * Retrieves search refinements
 *
 * @param {dw.catalog.ProductSearchModel} productSearch - Product search object
 * @param {dw.catalog.ProductSearchRefinements} refinements
 * @param {dw.catalog.ProductSearchRefinementDefinition} refinementDefinitions
 * @return {Refinement[]}
 */
function getRefinements(productSearch, refinements, refinementDefinitions) {
    return dwHelper.map(refinementDefinitions, function (definition) {
        var refinementValues = refinements.getAllRefinementValues(definition);
        var values = searchRefinementsFactory.get(productSearch, definition, refinementValues);

        return new Refinement(definition, values);
    });
}

/**
 * @constructor
 * @classdesc ProductSearch class
 * @property {Object} prototype - prototype inherited from BaseSearch class
 * @property {dw.catalog.ProductSearchModel} search
 * @property {Object} httpParams - HTTP query parameters
 */
function ProductSearch(httpParams) {
    this.search = new ProductSearchModel();
    this.httpParams = httpParams;

    this.initialize();
}

ProductSearch.prototype = Object.create(BaseSearch.prototype);

ProductSearch.prototype.initialize = function () {
    BaseSearch.prototype.initialize.call(this);

    setProperties(this.search, this.httpParams);

    this.search.search();

    this.isCategorySearch = this.search.categorySearch;
    this.refinementDefinitions = this.search.refinements.refinementDefinitions;
    this.searchPhrase = this.search.searchPhrase;
    this.refinements = getRefinements(
        this.search,
        this.search.refinements,
        this.search.refinements.refinementDefinitions
    );
    this.resetLink = getResetLink(this.search, this.httpParams);
    this.productIds = dwHelper.pluck(this.search.productSearchHits.asList(), 'productID');

    if (this.search.category) {
        this.categoryName = this.search.category.displayName;
    }
};

module.exports = ProductSearch;
