'use strict';

var CatalogMgr = require('dw/catalog/CatalogMgr');
var URLUtils = require('dw/web/URLUtils');

/**
 * Builds the links for the category hero: the sub-categories, or the sibling categories
 * on a leaf so shoppers can still move sideways
 * @param {string} categoryId - Category being viewed
 * @returns {Object[]} Links with name, url and active flag
 */
function getCategoryLinks(categoryId) {
    var category = CatalogMgr.getCategory(categoryId);
    if (!category) {
        return [];
    }
    var children = category.getOnlineSubCategories();
    if (children.isEmpty() && category.getParent() && !category.getParent().isRoot()) {
        children = category.getParent().getOnlineSubCategories();
    }
    return children.toArray().map(function (child) {
        return {
            name: child.getDisplayName(),
            url: URLUtils.url('Search-Show', 'cgid', child.getID()).toString(),
            active: child.getID() === categoryId
        };
    });
}

module.exports = {
    getCategoryLinks: getCategoryLinks
};
