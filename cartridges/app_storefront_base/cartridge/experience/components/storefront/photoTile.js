'use strict';

var Template = require('dw/util/Template');
var HashMap = require('dw/util/HashMap');
var ImageTransformation = require('*/cartridge/experience/utilities/ImageTransformation.js');

/**
 * Render logic for the storefront.Photo Tile.
 * @param {dw.experience.PageScriptContext} context The page script context object.
 * @returns {string} template to be displayed
 */
module.exports.render = function (context) {
    var model = new HashMap();
    var content = context.content;

    model.image = ImageTransformation.getScaledImage(content.image);

    return new Template('experience/components/storefront/photoTile').render(model).text;
};
