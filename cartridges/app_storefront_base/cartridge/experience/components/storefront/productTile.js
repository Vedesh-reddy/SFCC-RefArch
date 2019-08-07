'use strict';

var Template = require('dw/util/Template');
var HashMap = require('dw/util/HashMap');
var URLUtils = require('dw/web/URLUtils');

/**
 * Render logic for storefront product tile.
 * @param {dw.experience.PageScriptContext} context The page script context object.
 * @returns {string} template to be displayed
 */
module.exports.render = function (context) {
    var ProductFactory = require('*/cartridge/scripts/factories/product');

    var content = context.content;
    var productTileParams = { pview: 'tile', pid: context.content.product.ID };
    var product = ProductFactory.get(productTileParams);

    var productUrl = URLUtils.url('Product-Show', 'pid', product.id).relative().toString();

    var model = new HashMap();
    model.product = product;
    model.display = {
        swatches: true,
        ratings: content.displayRatings
    };

    model.urls = {
        product: productUrl
    };

    return new Template('experience/components/storefront/product/productTile').render(model).text;
};
