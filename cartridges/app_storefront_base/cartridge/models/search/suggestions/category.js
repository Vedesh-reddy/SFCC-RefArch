'use strict';

var URLUtils = require('dw/web/URLUtils');
var endpoint = 'Search-Show';


/**
 * @constructor
 * @classdesc CategorySuggestions class
 *
 * @param {dw.suggest.CategorySuggestions} suggestions - Category suggestions
 * @param {number} maxItems - Maximum number of categories to retrieve
 */
function CategorySuggestions(suggestions, maxItems) {
    var iter = suggestions.suggestedCategories;

    this.available = suggestions.hasSuggestions();
    this.categories = [];

    for (var i = 0; i < maxItems; i++) {
        var category = null;

        if (iter.hasNext()) {
            category = iter.next().category;
            this.categories.push({
                name: category.displayName,
                imageUrl: category.image ? category.image.url : '',
                url: URLUtils.url(endpoint, 'cgid', category.ID)
            });
        }
    }
}

module.exports = CategorySuggestions;
