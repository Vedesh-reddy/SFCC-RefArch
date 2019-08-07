'use strict';

var Template = require('dw/util/Template');
var HashMap = require('dw/util/HashMap');

/**
 * Render logic for Campaign Banner.
 * @param {dw.experience.PageScriptContext} context The page script context object.
 * @returns {string} template to be displayed
 */
module.exports.render = function (context) {
    var content = context.content;

    var model = new HashMap();
    model.bannerMessage = content.bannerMessage;

    return new Template('experience/components/storefront/campaignBanner').render(model).text;
};
