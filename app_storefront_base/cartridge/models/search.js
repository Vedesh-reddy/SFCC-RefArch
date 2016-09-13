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
<<<<<<< 271797ebb758a97b5ad252f43ef169c561e2582a
    if (dataForSearch.querystring.srule) {
        var sortingRule = CatalogMgr.getSortingRule(dataForSearch.querystring.srule);
        productSearchModel.setSortingRule(sortingRule);
    }

    if (dataForSearch.querystring.cgid) {
        var category = CatalogMgr.getCategory(dataForSearch.querystring.cgid);
        productSearchModel.setCategoryID(category.getID());
    } else {
        productSearchModel.setSearchPhrase(dataForSearch.querystring.q);
    }

=======
    productSearchModel.setSearchPhrase(dataForSearch.searchPhrase);
    var refinementsToApply = dataForSearch.refinements;
    for (var i = 0; i < refinementsToApply.length; i++) {
        if (refinementsToApply[i].name && refinementsToApply[i].value) {
            productSearchModel.addRefinementValues(
                    refinementsToApply[i].name,
                    refinementsToApply[i].value
            );
        }
    }
>>>>>>> [RAP-5151 : Set and apply refinements for searches]
    productSearchModel.search();

    this.products = productSearchModel.getProducts().asList();
    this.refinements = productSearchModel.getRefinements().getRefinementDefinitions();
    this.productIds = helper.pluck(this.products, 'ID');
    this.refinementNames = helper.pluck(this.refinements, 'displayName');
}

module.exports = search;
