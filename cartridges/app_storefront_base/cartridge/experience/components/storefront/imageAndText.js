'use strict';

var Template = require('dw/util/Template');
var HashMap = require('dw/util/HashMap');
var ImageTransformation = require('*/cartridge/experience/utilities/ImageTransformation.js');


/**
 * Render logic for Image And Text component.
 * @param {dw.experience.PageScriptContext} context The page script context object.
 * @returns {string} template to be displayed
 */
module.exports.render = function (context) {
    var model = new HashMap();
    var content = context.content;

    model.heading = content.heading ? content.heading : null;
    model.ITCText = content.ITCText ? content.ITCText : null;
    model.image = ImageTransformation.getScaledImage(content.image);
    model.link = content.ITCLink ? content.ITCLink : '#';

    return new Template('experience/components/storefront/imageAndText').render(model).text;
};
