'use strict';

/**
 * appends params to a url
 * @param {string} url - Original url
 * @param {Object} params - Parameters to append
 * @returns {string} result url with appended parameters
 */
function appendToUrl(url, params) {
    var newUrl = url;
    newUrl += (newUrl.indexOf('?') !== -1 ? '&' : '?') + Object.keys(params).map(function (key) {
        return key + '=' + encodeURIComponent(params[key]);
    }).join('&');

    return newUrl;
}

/**
 * re-renders the order totals and the number of items in the cart
 * @param {Object} data - AJAX response from the server
 */
function updateCartTotals(data) {
    $('.number-of-items').empty().append(data.resources.numberOfItems);
    $('.shipping-cost').empty().append(data.totals.totalShippingCost);
    $('.tax-total').empty().append(data.totals.totalTax);
    $('.sub-total').empty().append(data.totals.grandTotal);
    $('.minicart-quantity').empty().append(data.numItems);
}

/**
 * re-renders the order totals and the number of items in the cart
 * @param {Object} message - Error message to display
 */
function createErrorNotification(message) {
    $('<div class="alert alert-danger alert-dismissible fade in col-xs-12 ' +
        'text-xs-center notify" role="alert"> ' +
        '<button type="button" class="close" data-dismiss="alert" ' +
        'aria-label="Close"> ' +
        '<span aria-hidden="true">&times;</span> ' +
        '</button> ' + message +
        '</div>'
    ).appendTo('.page');
}

module.exports = function () {
    $('.remove-product').click(function (e) {
        e.preventDefault();

        var actionUrl = $(this).data('action');
        var productID = $(this).data('pid');
        var productName = $(this).data('name');
        var uuid = $(this).data('uuid');

        var $deleteConfirmBtn = $('.delete-confirmation-btn');
        var $productToRemoveSpan = $('.product-to-remove');

        $deleteConfirmBtn.data('pid', productID);
        $deleteConfirmBtn.data('action', actionUrl);
        $deleteConfirmBtn.data('uuid', uuid);

        $productToRemoveSpan.empty().append(productName);
    });

    $('.optional-promo').click(function (e) {
        e.preventDefault();
        $('.promo-code-form').toggle();
    });

    $('.delete-confirmation-btn').click(function (e) {
        e.preventDefault();

        var productID = $(this).data('pid');
        var url = $(this).data('action');
        var uuid = $(this).data('uuid');
        var urlParams = {
            pid: productID,
            uuid: uuid
        };

        url = appendToUrl(url, urlParams);

        $.ajax({
            url: url,
            type: 'get',
            dataType: 'json',
            success: function (data) {
                if (data.items.length === 0) {
                    $('.cart').empty().append('<div class="row"> ' +
                        '<div class="col-xs-12 text-xs-center"> ' +
                        '<h1>' + data.resources.emptyCartMsg + '</h1> ' +
                        '</div> ' +
                        '</div>'
                    );
                    $('.number-of-items').empty().append(data.resources.numberOfItems);
                    $('.minicart-quantity').empty().append(data.numItems);
                } else {
                    $('.uuid-' + uuid).remove();
                    updateCartTotals(data);
                }
            },
            error: function (err) {
                createErrorNotification(err.responseJSON.errorMessage);
            }
        });
    });

    $('.quantity').change(function () {
        var quantity = $(this).val();
        var productID = $(this).data('pid');
        var url = $(this).data('action');
        var uuid = $(this).data('uuid');

        var urlParams = {
            pid: productID,
            quantity: quantity,
            uuid: uuid
        };
        url = appendToUrl(url, urlParams);

        $.ajax({
            url: url,
            type: 'get',
            dataType: 'json',
            success: function (data) {
                $('.item-total-' + uuid).empty();
                for (var i = 0; i < data.items.length; i++) {
                    if (data.items[i].UUID === uuid) {
                        $('.item-total-' + uuid).append(data.items[i].priceTotal);
                        break;
                    }
                }
                updateCartTotals(data);
            },
            error: function (err) {
                createErrorNotification(err.responseJSON.errorMessage);
            }
        });
    });

    $('.shippingMethods').change(function () {
        var url = $(this).attr('data-actionUrl');
        var urlParams = {
            methodID: $(this).find(':selected').attr('data-shipping-id')
        };
        url = appendToUrl(url, urlParams);

        $.ajax({
            url: url,
            type: 'get',
            dataType: 'json',
            success: function (data) {
                updateCartTotals(data);
            },
            error: function (err) {
                createErrorNotification(err.responseJSON.errorMessage);
            }
        });
    });
};
