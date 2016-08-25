'use strict';

/**
 * Process the attribute values for an attribute that has image swatches
 *
 * @param {Object} element - the swatch element that is currently being clicked or hovered over
 */
function handleSwatchHover(element) {
    var swatchData = element.data('attributes');
    var productTile = element.closest('.product-tile');
    var productTileImg = productTile.find('.tile-image');

    productTileImg.attr('src', swatchData.imageUrl);
    productTileImg.closest('a').attr('href', swatchData.pdpUrl);
    productTile.find('.link').attr('href', swatchData.pdpUrl);
    productTile.find('.swatches a').attr('href', swatchData.pdpUrl);
}

module.exports = function () {
    $('.product-tile .swatch').on('mouseenter', function () {
        handleSwatchHover($(this));
    });

    $('.product-tile .swatch').on('click', function () {
        handleSwatchHover($(this));
    });
    $('.quickview').on('click', function (e) {
        e.preventDefault();
    });
};
