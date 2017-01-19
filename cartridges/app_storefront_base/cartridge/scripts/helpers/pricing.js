'use strict';

var HashMap = require('dw/util/HashMap');
var Template = require('dw/util/Template');


/**
 * Return root price book for a given price book
 * @param {dw.catalog.PriceBook} priceBook - Provided price book
 * @returns {dw.catalog.PriceBook} root price book
 */
function getRootPriceBook(priceBook) {
    var rootPriceBook = priceBook;
    while (rootPriceBook.parentPriceBook) {
        rootPriceBook = rootPriceBook.parentPriceBook;
    }
    return rootPriceBook;
}

/**
 * Creates a HashMap input object for dw.util.Template.render(HashMap)
 * @param {Object} keyMap - Key-value pairs object
 * @return {dw.util.HashMap} - HashMap from key-value pairs
 */
function getHtmlContext(keyMap) {
    var context = new HashMap();
    Object.keys(keyMap).forEach(function (key) {
        context.put(key, keyMap[key]);
    });
    return context;
}

/**
 * Render Template HTML
 *
 * @param {dw.util.HashMap} context - Context object that will fill template placeholders
 * @param {string} [templatePath] - Optional template path to override default
 * @return {string} - Rendered HTML
 */
function renderHtml(context, templatePath) {
    var html;
    var path = templatePath || 'product/components/pricing/ajax-main.isml';
    var tmpl = new Template(path);
    var result = new HashMap();

    result.put('price', context);
    html = tmpl.render(result);

    return html.text;
}

module.exports = {
    getHtmlContext: getHtmlContext,
    getRootPriceBook: getRootPriceBook,
    renderHtml: renderHtml
};
