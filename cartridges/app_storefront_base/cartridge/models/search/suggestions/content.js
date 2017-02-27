'use strict';

var URLUtils = require('dw/web/URLUtils');


/**
 * @constructor
 * @classdesc ContentSuggestions class
 *
 * @param {dw.suggest.ContentSuggestions} suggestions - Content suggestions
 * @param {number} maxItems - Maximum number of content items to retrieve
 */
function ContentSuggestions(suggestions, maxItems) {
    var content;
    var iter = suggestions.suggestedContent;

    this.available = suggestions.hasSuggestions();
    this.contents = [];

    for (var i = 0; i < maxItems; i++) {
        if (iter.hasNext()) {
            content = iter.next().content;
            this.contents.push({
                name: content.name,
                url: URLUtils.url('Page-Show', 'cid', content.ID)
            });
        }
    }
}

module.exports = ContentSuggestions;
