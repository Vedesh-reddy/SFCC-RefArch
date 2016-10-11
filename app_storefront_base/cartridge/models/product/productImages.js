'use strict';

var dwHelpers = require('../../scripts/dwHelpers');

/**
 * @constructor
 * @classdesc Returns images for a given product
 * @param {dw.catalog.Product} product - product to return images for
 * @param {Object} imageConfig - configuration object with image types
 */
function Images(product, imageConfig) {
    imageConfig.types.forEach(function (type) {
        var images = product.getImages(type);

        var func = imageConfig.quantity === 'single' ? dwHelpers.first : dwHelpers.map;

        this[type] = func(images, function (image) {
            var result = {
                alt: image.alt,
                url: image.URL.relative().toString(),
                title: image.title
            };
            if (imageConfig.quantity === 'single') {
                return [result];
            }
            return result;
        });
    }, this);
}

module.exports = Images;
