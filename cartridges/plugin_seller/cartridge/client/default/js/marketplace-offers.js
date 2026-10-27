'use strict';

/**
 * PDP seller offers: reloads the offer list when the shopper picks a variant, and adds a
 * chosen offer to the cart through the base Cart-AddProduct route (the server re-checks
 * the offer, its price and the seller's stock).
 */

/**
 * @param {jQuery} $slot - offers slot
 * @param {string} pid - selected product ID
 */
function loadOffers($slot, pid) {
    var url = $slot.data('url');
    if (!url || !pid) return;
    $.ajax({
        url: url + (url.indexOf('?') >= 0 ? '&' : '?') + 'pid=' + encodeURIComponent(pid),
        method: 'GET',
        success: function (html) {
            $slot.html(html);
        }
    });
}

$(document).ready(function () {
    $('body').on('product:afterAttributeSelect', function (e, response) {
        var product = response && response.data && response.data.product;
        var $slot = response && response.container ? response.container.find('.marketplace-offers-slot') : $();
        if (!product || !$slot.length) return;
        if (product.productType === 'master') {
            $slot.empty();
        } else {
            loadOffers($slot, product.id);
        }
    });

    $(document).on('click', '.marketplace-add-offer', function () {
        var $button = $(this);
        var $section = $button.closest('.marketplace-offers');
        var $status = $section.find('.marketplace-offers-status');
        var $container = $button.closest('.product-detail');
        var quantity = $container.find('.quantity-select').val() || 1;
        $button.prop('disabled', true);
        $.ajax({
            url: $button.data('url'),
            method: 'POST',
            data: { pid: $button.data('pid'), quantity: quantity, mktOfferId: $button.data('offer-id') },
            success: function (data) {
                $status.text(data.message || '');
                if (!data.error) $('body').trigger('product:afterAddToCart', data);
            },
            error: function () {
                $status.text($status.data('error') || '');
            },
            complete: function () {
                $button.prop('disabled', false);
            }
        });
    });
});
