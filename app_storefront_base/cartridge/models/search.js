'use strict';

var helper = require('~/cartridge/scripts/dwHelpers');
var CatalogMgr = require('dw/catalog/CatalogMgr');

/**
 * Search class that represents product search
 * @param {dw.catalog.ProductSearchModel} productSearchModel - Current product search
 * @param {Object} req - local instance of request object
 * @constructor
 */
function search(productSearchModel, dataForSearch) {
    if (dataForSearch.querystring.srule) {
        var sortingRule = CatalogMgr.getSortingRule(dataForSearch.querystring.srule);
        productSearchModel.setSortingRule(sortingRule);
    }

    if (dataForSearch.querystring.cgid) {
        var category = CatalogMgr.getCategory(dataForSearch.querystring.cgid);
        productSearchModel.setCategoryID(category.getID());
    }

    if (dataForSearch.querystring.q) {
        productSearchModel.setSearchPhrase(dataForSearch.querystring.q);
    }

    var refinementsToApply = dataForSearch.refinements;
    refinementsToApply.forEach(function (refinement) {
        if (refinement.name && refinement.value) {
            productSearchModel.addRefinementValues(
                refinement.name,
                refinement.value
            );
        }
    });

    productSearchModel.search();

    this.products = productSearchModel.getProducts().asList();
    this.refinements = productSearchModel.getRefinements().getRefinementDefinitions();
    this.productIds = helper.pluck(this.products, 'ID');
    this.refinementNames = helper.pluck(this.refinements, 'displayName');
}

module.exports = search;
