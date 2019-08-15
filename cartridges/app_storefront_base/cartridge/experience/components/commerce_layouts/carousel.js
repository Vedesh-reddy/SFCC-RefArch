'use strict';

var Template = require('dw/util/Template');
var HashMap = require('dw/util/HashMap');
var carouselBuilder = require('*/cartridge/scripts/experience/utilities/carouselBuilder.js');

/**
 * Render logic for carousel layout.
 * @param {dw.experience.PageScriptContext} context The page script context object.
 * @returns {string} template to be displayed
 */
module.exports.render = function (context) {
    var model = new HashMap();

    model = carouselBuilder.init(model, context);

    return new Template('experience/components/commerce_layouts/carousel').render(model).text;
};
