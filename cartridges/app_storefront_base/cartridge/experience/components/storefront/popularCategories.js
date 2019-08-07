'use strict';

var Template = require('dw/util/Template');
var HashMap = require('dw/util/HashMap');
var PageRenderHelper = require('*/cartridge/experience/utilities/PageRenderHelper.js');

/**
 * Render logic for the storefront.popularCategories.
 *
 * @param {dw.experience.PageScriptContext}
 *            context The page script context object.
 *
 * @returns {string} The template text
 */
module.exports.render = function (context) {
    var model = new HashMap();
    var content = context.content;
    model.textHeadline = content.textHeadline ? content.textHeadline : null;

    model.regions = PageRenderHelper.getRegionModelRegistry(context.component);

    return new Template('experience/components/storefront/popularCategories').render(model).text;
};
