'use strict';

var Template = require('dw/util/Template');
var HashMap = require('dw/util/HashMap');
var URLUtils = require('dw/web/URLUtils');
var ImageTransformation = require('*/cartridge/experience/utilities/ImageTransformation.js');

/**
 * Render logic for Main Banner.
 * @param {dw.experience.PageScriptContext} context The page script context object.
 * @returns {string} template to be displayed
 */
module.exports.render = function (context) {
    var model = new HashMap();
    var content = context.content;

    model.heading = content.heading;
    model.image = ImageTransformation.getScaledImage(content.image);
    model.categoryLink = URLUtils.url('Search-Show', 'cgid', content.categoryLink.getID()).toString();

    return new Template('experience/components/assets/mainBanner').render(model).text;
};
