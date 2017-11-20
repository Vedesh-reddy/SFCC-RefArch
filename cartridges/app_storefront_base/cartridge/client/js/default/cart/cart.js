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
 * Checks whether the basket is valid. if invalid displays error message and disables
 * checkout button
 * @param {Object} data - AJAX response from the server
 */
function validateBasket(data) {
    if (data.valid.error) {
        if (data.valid.message) {
            var errorHtml = '<div class="alert alert-danger alert-dismissible valid-cart-error ' +
                'fade show" role="alert">' +
                '<button type="button" class="close" data-dismiss="alert" aria-label="Close">' +
                '<span aria-hidden="true">&times;</span>' +
                '</button>' + data.valid.message + '</div>';

            $('.cart-error').append(errorHtml);
        } else {
            $('.cart').empty().append('<div class="row"> ' +
                '<div class="col-12 text-center"> ' +
                '<h1>' + data.resources.emptyCartMsg + '</h1> ' +
                '</div> ' +
                '</div>'
            );
            $('.number-of-items').empty().append(data.resources.numberOfItems);
            $('.minicart-quantity').empty().append(data.numItems);
            $('.mini-cart .popover').empty();
            $('.mini-cart .popover').removeClass('show');
        }

        $('.checkout-btn').addClass('disabled');
    } else {
        $('.checkout-btn').removeClass('disabled');
    }
}

/**
 * re-renders the order totals and the number of items in the cart
 * @param {Object} data - AJAX response from the server
 */
function updateCartTotals(data) {
    $('.number-of-items').empty().append(data.resources.numberOfItems);
    $('.shipping-cost').empty().append(data.totals.totalShippingCost);
    $('.tax-total').empty().append(data.totals.totalTax);
    $('.grand-total').empty().append(data.totals.grandTotal);
    $('.sub-total').empty().append(data.totals.subTotal);
    $('.minicart-quantity').empty().append(data.numItems);

    if (data.totals.orderLevelDiscountTotal.value > 0) {
        $('.order-discount').removeClass('hide-order-discount');
        $('.order-discount-total').empty()
            .append('- ' + data.totals.orderLevelDiscountTotal.formatted);
    } else {
        $('.order-discount').addClass('hide-order-discount');
    }

    if (data.totals.shippingLevelDiscountTotal.value > 0) {
        $('.shipping-discount').removeClass('hide-shipping-discount');
        $('.shipping-discount-total').empty().append('- ' +
            data.totals.shippingLevelDiscountTotal.formatted);
    } else {
        $('.shipping-discount').addClass('hide-shipping-discount');
    }

    data.items.forEach(function (item) {
        $('.item-' + item.UUID).empty().append(item.renderedPromotions);
        $('.item-total-' + item.UUID).empty().append(item.priceTotal.renderedPrice);
    });
}

/**
 * re-renders the order totals and the number of items in the cart
 * @param {Object} message - Error message to display
 */
function createErrorNotification(message) {
    var errorHtml = '<div class="alert alert-danger alert-dismissible valid-cart-error ' +
        'fade show" role="alert">' +
        '<button type="button" class="close" data-dismiss="alert" aria-label="Close">' +
        '<span aria-hidden="true">&times;</span>' +
        '</button>' + message + '</div>';

    $('.cart-error').append(errorHtml);
}

/**
 * re-renders the approaching discount messages
 * @param {Object} approachingDiscounts - updated approaching discounts for the cart
 */
function updateApproachingDiscounts(approachingDiscounts) {
    var html = '';
    $('.approaching-discounts').empty();
    if (approachingDiscounts.length > 0) {
        approachingDiscounts.forEach(function (item) {
            html += '<div class="single-approaching-discount text-center">'
                + item.discountMsg + '</div>';
        });
    }
    $('.approaching-discounts').append(html);
}

/**
 * Updates the availability of a product line item
 * @param {Object} data - AJAX response from the server
 * @param {string} uuid - The uuid of the product line item to update
 */
function updateAvailability(data, uuid) {
    var lineItem;
    var messages = '';

    for (var i = 0; i < data.items.length; i++) {
        if (data.items[i].UUID === uuid) {
            lineItem = data.items[i];
            break;
        }
    }

    $('.availability-' + lineItem.UUID).empty();

    if (lineItem.availability) {
        if (lineItem.availability.messages) {
            lineItem.availability.messages.forEach(function (message) {
                messages += '<p class="line-item-attributes">' + message + '</p>';
            });
        }

        if (lineItem.availability.inStockDate) {
            messages += '<p class="line-item-attributes line-item-instock-date">'
                + lineItem.availability.inStockDate
                + '</p>';
        }
    }

    $('.availability-' + lineItem.UUID).html(messages);
}

module.exports = function () {
    $('body').on('click', '.remove-product', function (e) {
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

    $('body').on('click', '.delete-confirmation-btn', function (e) {
        e.preventDefault();

        var productID = $(this).data('pid');
        var url = $(this).data('action');
        var uuid = $(this).data('uuid');
        var urlParams = {
            pid: productID,
            uuid: uuid
        };

        url = appendToUrl(url, urlParams);

        $('body > .modal-backdrop').remove();

        $.spinner().start();
        $.ajax({
            url: url,
            type: 'get',
            dataType: 'json',
            success: function (data) {
                if (data.basket.items.length === 0) {
                    $('.cart').empty().append('<div class="row"> ' +
                        '<div class="col-12 text-center"> ' +
                        '<h1>' + data.basket.resources.emptyCartMsg + '</h1> ' +
                        '</div> ' +
                        '</div>'
                    );
                    $('.number-of-items').empty().append(data.basket.resources.numberOfItems);
                    $('.minicart-quantity').empty().append(data.basket.numItems);
                    $('.mini-cart .popover').empty();
                    $('.mini-cart .popover').removeClass('show');
                    $('body').removeClass('modal-open');
                    $('html').removeClass('veiled');
                } else {
                    if (data.toBeDeletedUUIDs && data.toBeDeletedUUIDs.length > 0) {
                        for (var i = 0; i < data.toBeDeletedUUIDs.length; i++) {
                            $('.uuid-' + data.toBeDeletedUUIDs[i]).remove();
                        }
                    }
                    $('.uuid-' + uuid).remove();
                    if (!data.basket.hasBonusProduct) {
                        $('.bonus-product').remove();
                    }
                    $('.coupons-and-promos').empty().append(data.basket.totals.discountsHtml);
                    updateCartTotals(data.basket);
                    updateApproachingDiscounts(data.basket.approachingDiscounts);
                    validateBasket(data.basket);
                }
                $.spinner().stop();
            },
            error: function (err) {
                if (err.responseJSON.redirectUrl) {
                    window.location.href = err.responseJSON.redirectUrl;
                } else {
                    createErrorNotification(err.responseJSON.errorMessage);
                    $.spinner().stop();
                }
            }
        });
    });

    $('body').on('change', '.quantity-form > .quantity', function () {
        var preSelectQty = $(this).data('pre-select-qty');
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

        $(this).parents('.card').spinner().start();

        $.ajax({
            url: url,
            type: 'get',
            context: this,
            dataType: 'json',
            success: function (data) {
                $('.quantity[data-uuid="' + uuid + '"]').val(quantity);
                $('.coupons-and-promos').empty().append(data.totals.discountsHtml);
                updateCartTotals(data);
                updateApproachingDiscounts(data.approachingDiscounts);
                updateAvailability(data, uuid);
                validateBasket(data);
                $(this).data('pre-select-qty', quantity);
                $.spinner().stop();
            },
            error: function (err) {
                if (err.responseJSON.redirectUrl) {
                    window.location.href = err.responseJSON.redirectUrl;
                } else {
                    createErrorNotification(err.responseJSON.errorMessage);
                    $(this).val(parseInt(preSelectQty, 10));
                    $.spinner().stop();
                }
            }
        });
    });

    $('.shippingMethods').change(function () {
        var url = $(this).attr('data-actionUrl');
        var urlParams = {
            methodID: $(this).find(':selected').attr('data-shipping-id')
        };
        // url = appendToUrl(url, urlParams);

        $('.totals').spinner().start();
        $.ajax({
            url: url,
            type: 'post',
            dataType: 'json',
            data: urlParams,
            success: function (data) {
                if (data.error) {
                    window.location.href = data.redirectUrl;
                } else {
                    $('.coupons-and-promos').empty().append(data.totals.discountsHtml);
                    updateCartTotals(data);
                    updateApproachingDiscounts(data.approachingDiscounts);
                    validateBasket(data);
                }
                $.spinner().stop();
            },
            error: function (err) {
                if (err.redirectUrl) {
                    window.location.href = err.redirectUrl;
                } else {
                    createErrorNotification(err.responseJSON.errorMessage);
                    $.spinner().stop();
                }
            }
        });
    });

    $('.promo-code-form').submit(function (e) {
        e.preventDefault();
        $.spinner().start();
        $('.coupon-missing-error').hide();
        $('.coupon-error-message').empty();
        if (!$('.coupon-code-field').val()) {
            $('.promo-code-form .form-control').addClass('is-invalid');
            $('.coupon-missing-error').show();
            $.spinner().stop();
            return false;
        }
        var $form = $('.promo-code-form');
        $('.promo-code-form .form-control').removeClass('is-invalid');
        $('.coupon-error-message').empty();

        $.ajax({
            url: $form.attr('action'),
            type: 'GET',
            dataType: 'json',
            data: $form.serialize(),
            success: function (data) {
                if (data.error) {
                    $('.promo-code-form .form-control').addClass('is-invalid');
                    $('.coupon-error-message').empty().append(data.errorMessage);
                } else {
                    $('.coupons-and-promos').empty().append(data.totals.discountsHtml);
                    updateCartTotals(data);
                    updateApproachingDiscounts(data.approachingDiscounts);
                    validateBasket(data);
                }
                $('.coupon-code-field').val('');
                $.spinner().stop();
            },
            error: function (err) {
                if (err.responseJSON.redirectUrl) {
                    window.location.href = err.responseJSON.redirectUrl;
                } else {
                    createErrorNotification(err.errorMessage);
                    $.spinner().stop();
                }
            }
        });
        return false;
    });

    $('body').on('click', '.remove-coupon', function (e) {
        e.preventDefault();

        var couponCode = $(this).data('code');
        var uuid = $(this).data('uuid');
        var $deleteConfirmBtn = $('.delete-coupon-confirmation-btn');
        var $productToRemoveSpan = $('.coupon-to-remove');

        $deleteConfirmBtn.data('uuid', uuid);
        $deleteConfirmBtn.data('code', couponCode);

        $productToRemoveSpan.empty().append(couponCode);
    });

    $('body').on('click', '.delete-coupon-confirmation-btn', function (e) {
        e.preventDefault();

        var url = $(this).data('action');
        var uuid = $(this).data('uuid');
        var couponCode = $(this).data('code');
        var urlParams = {
            code: couponCode,
            uuid: uuid
        };

        url = appendToUrl(url, urlParams);

        $('body > .modal-backdrop').remove();

        $.spinner().start();
        $.ajax({
            url: url,
            type: 'get',
            dataType: 'json',
            success: function (data) {
                $('.coupon-uuid-' + uuid).remove();
                updateCartTotals(data);
                updateApproachingDiscounts(data.approachingDiscounts);
                validateBasket(data);
                $.spinner().stop();
            },
            error: function (err) {
                if (err.responseJSON.redirectUrl) {
                    window.location.href = err.responseJSON.redirectUrl;
                } else {
                    createErrorNotification(err.responseJSON.errorMessage);
                    $.spinner().stop();
                }
            }
        });
    });
};
