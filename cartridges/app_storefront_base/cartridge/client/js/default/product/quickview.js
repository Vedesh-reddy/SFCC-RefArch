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

module.exports = {
    showQuickview: function () {
        $('body').on('click', '.quickview', function (e) {
            e.preventDefault();
            var selectedValueUrl = $(this).closest('a.quickview').attr('href');
            var productUrl = selectedValueUrl.replace('Product-ShowQuickView', 'Product-Show');
            $(e.target).trigger('quickview:show');
            getModalHtmlElement();
            fillModalElement(productUrl, selectedValueUrl);
        });
    },

    colorAttribute: base.colorAttribute,

    selectAttribute: base.selectAttribute,

    availability: base.availability,

    addToCart: base.addToCart
};
