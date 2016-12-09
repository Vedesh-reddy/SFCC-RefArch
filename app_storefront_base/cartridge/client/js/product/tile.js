'use strict';
var base = require('./base');

/**
 * Generates the modal window on the first call.
 *
 */
function getModalHtmlElement() {
    if ($('.quickViewDialog').length === 0) {
        var htmlString = '<!-- Modal -->'
            + '<div class="modal fade" id="quickViewModal" role="dialog">'
            + '<div class="modal-dialog quickViewDialog">'
            + '<!-- Modal content-->'
            + '<div class="modal-content">'
            + '<div class="modal-header">'
            + '<button type="button" class="close" data-dismiss="modal">'
            + '<span>Close</span>&times;</button>'
            + '<a class="fullPdpLink" href=""><h4 class="modal-title">View Full Details</h4></a>'
            + '</div>'
            + '<div class="modal-body">'
            + '</div>'
            + '</div>'
            + '</div>'
            + '</div>';
        $('body').append(htmlString);
    }
}

/**
 * replaces the content in  the modal window on for the selected product variation.
 * @param {string} productUrl - url to be used for going to the product details page
 * @param {string} selectedValueUrl - url to be used to retrieve a new product model
 */
function fillModalElement(productUrl, selectedValueUrl) {
    $.ajax({
        url: selectedValueUrl,
        method: 'GET',
        dataType: 'html',
        success: function (html) {
            $('.modal-body').empty();
            $('.modal-body').html(html);
            $('#quickViewModal .fullPdpLink').attr('href', productUrl);
            $('#quickViewModal .size-chart').attr('href', productUrl);
            $('#quickViewModal').modal('show');
        }
    });
}

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
    productTile.find('.quickview').attr('href', swatchData.quickViewURL);
}

module.exports = function () {
    $('.product-tile .swatch').on('mouseenter', function () {
        handleSwatchHover($(this));
    });

    $('.product-tile .swatch').on('click', function () {
        handleSwatchHover($(this));
    });

    $('body').on('click', '.quickview', function (e) {
        e.preventDefault();
        var selectedValueUrl = $(this).closest('a.quickview').attr('href');
        var productUrl = selectedValueUrl.replace('Product-ShowQuickView', 'Product-Show');
        getModalHtmlElement();
        fillModalElement(productUrl, selectedValueUrl);
    });

    $(document).on('click', '[data-attr="color"] a', function (e) {
        e.preventDefault();
        var selectedValueUrl = base.getSelectedValueUrl(e.currentTarget.href, $(this));

        var productUrl;
        productUrl = selectedValueUrl.replace('Product-Variation', 'Product-Show');
        selectedValueUrl = selectedValueUrl.replace('Product-Variation', 'Product-ShowQuickView');
        fillModalElement(productUrl, selectedValueUrl);
    });

    $(document).on('change', 'select[class^="select-"]', function (e) {
        e.preventDefault();
        var selectedValueUrl = base.getSelectedValueUrl(e.currentTarget.value, $(this));

        if (selectedValueUrl) {
            var productUrl;
            productUrl = selectedValueUrl.replace('Product-Variation', 'Product-Show');
            selectedValueUrl =
                selectedValueUrl.replace('Product-Variation', 'Product-ShowQuickView');
            fillModalElement(productUrl, selectedValueUrl);
        }
    });

    $(document).on('click', 'button.add-to-cart', function () {
        var pid = $(this).closest('.product-quickview').data('pid');
        var addToCartUrl = base.getAddToCartUrl(pid);

        if (addToCartUrl) {
            $.ajax({
                url: addToCartUrl,
                method: 'POST',
                success: function (data) {
                    base.handlePostCartAdd(data);
                    $('#quickViewModal').modal('hide');
                }
            });
        }
    });
};
