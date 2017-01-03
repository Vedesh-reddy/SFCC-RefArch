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
        var result = {};

        if (imageConfig.quantity === 'single') {
            var firstImage = dwHelpers.first(images);
            result = [{
                alt: firstImage.alt,
                url: firstImage.URL.relative().toString(),
                title: firstImage.title
            }];
        } else {
            result = dwHelpers.map(images, function (image) {
                return {
                    alt: image.alt,
                    url: image.URL.relative().toString(),
                    title: image.title
                };
            });
        }
        this[type] = result;
    }, this);
}

module.exports = Images;
