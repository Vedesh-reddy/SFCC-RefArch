'use strict';
var base = require('./base');

/**
 * Generates the modal window on the first call.
 *
 */
function getModalHtmlElement() {
    if ($('.quickViewDialog').length !== 0) {
        $('#quickViewModal').remove();
    }
    var htmlString = '<!-- Modal -->'
        + '<div class="modal fade" id="quickViewModal" role="dialog">'
        + '<div class="modal-dialog quick-view-dialog">'
        + '<!-- Modal content-->'
        + '<div class="modal-content">'
        + '<div class="modal-header">'
        + '<a class="full-pdp-link" href=""><h4 class="modal-title">View Full Details</h4></a>'
        + '<button type="button" class="close" data-dismiss="modal">'
        + '<span>Close</span>&times;</button>'
        + '</div>'
        + '<div class="modal-body">'
        + '</div>'
        + '</div>'
        + '</div>'
        + '</div>';
    $('body').append(htmlString);
}

/**
 * replaces the content in  the modal window on for the selected product variation.
 * @param {string} productUrl - url to be used for going to the product details page
 * @param {string} selectedValueUrl - url to be used to retrieve a new product model
 */
function fillModalElement(productUrl, selectedValueUrl) {
    $('.modal-body').spinner().start();
    $.ajax({
        url: selectedValueUrl,
        method: 'GET',
        dataType: 'html',
        success: function (html) {
            $('.modal-body').empty();
            $('.modal-body').html(html);
            $('#quickViewModal .full-pdp-link').attr('href', productUrl);
            $('#quickViewModal .size-chart').attr('href', productUrl);
            $('#quickViewModal').modal('show');
            $.spinner().stop();
        },
        error: function () {
            $.spinner().stop();
        }
    });
}

module.exports = function () {
    $('body').on('click', '.quickview', function (e) {
        e.preventDefault();
        var selectedValueUrl = $(this).closest('a.quickview').attr('href');
        var productUrl = selectedValueUrl.replace('Product-ShowQuickView', 'Product-Show');
        getModalHtmlElement();
        fillModalElement(productUrl, selectedValueUrl);
    });

    $(document).on('click', '[data-attr="color"] a', function (e) {
        e.preventDefault();

        var productUrl;
        var selectedValueUrl = base.getSelectedValueUrl(e.currentTarget.href, $(this));

        if (selectedValueUrl) {
            productUrl = selectedValueUrl.replace('Product-Variation', 'Product-Show');
            $('.modal-body').spinner().start();
            $.ajax({
                url: selectedValueUrl,
                method: 'GET',
                success: function (data) {
                    base.parseJsonResponse(data, 'tile');
                    $.spinner().stop();
                },
                error: function () {
                    $.spinner().stop();
                }
            });
            $('.full-pdp-link').attr('href', productUrl);
            $('.product-quickview .size-chart a').attr('href', productUrl);
        }
    });

    $(document).on('change', 'select[class*="select-"]', function (e) {
        e.preventDefault();

        var productUrl;
        var selectedValueUrl = base.getSelectedValueUrl(e.currentTarget.value, $(this));

        if (selectedValueUrl) {
            productUrl = selectedValueUrl.replace('Product-Variation', 'Product-Show');
            $('.modal-body').spinner().start();
            $.ajax({
                url: selectedValueUrl,
                method: 'GET',
                success: function (data) {
                    base.parseJsonResponse(data, 'tile');
                    $.spinner().stop();
                },
                error: function () {
                    $.spinner().stop();
                }
            });
            $('.full-pdp-link').attr('href', productUrl);
            $('.product-quickview .size-chart a').attr('href', productUrl);
        }
    });

    $(document).on('click', 'button.add-to-cart', function () {
        var pid = $(this).closest('.product-quickview').data('pid');
        var addToCartUrl = base.getAddToCartUrl(pid);

        if (addToCartUrl) {
            $('.modal-body').spinner().start();
            $.ajax({
                url: addToCartUrl,
                method: 'POST',
                success: function (data) {
                    base.handlePostCartAdd(data);
                    $('#quickViewModal').modal('hide');
                    $.spinner().stop();
                },
                error: function () {
                    $.spinner().stop();
                }
            });
        }
    });
};
