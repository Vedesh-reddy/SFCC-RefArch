'use strict';


/**
 * Determines whether this is a Bundle PDP
 * @return {boolean} - Whether this is a Bundle PDP
 */
function isBundle() {
    return !!$('.product-detail .product-bundle').length;
}

/**
 * Retrieves the value associated with the Quantity pull-down menu
 *
 * @param {JQuery} $el - DOM element representing product whose quantity selection has changed
 * @return {string} - value found in the quantity input
 */
function getQuantitySelected($el) {
    return !isBundle()
        ? $('.quantity-select').val()
        : $el.closest('.prices-add-to-cart-actions')
            .siblings('.quantity-select')
            .val();
}

/**
 * Process the attribute values for an attribute that has image swatches
 *
 * @param {Object} attr - Attribute
 * @param {string} attr.id - Attribute ID
 * @param {Object[]} attr.values - Array of attribute value objects
 * @param {string} attr.values.value - Attribute coded value
 * @param {string} attr.values.url - URL to de/select an attribute value of the product
 * @param {boolean} attr.values.isSelectable - Flag as to whether an attribute value can be
 *     selected.  If there is no variant that corresponds to a specific combination of attribute
 *     values, an attribute may be disabled in the Product Detail Page
 */
function processSwatchValues(attr) {
    attr.values.forEach(function (attrValue) {
        var $attrValue = $('[data-attr="' + attr.id + '"] [data-attr-value="' +
            attrValue.value + '"]');
        var $swatchAnchor = $attrValue.parent();

        if (attrValue.selected) {
            $attrValue.addClass('selected');
        } else {
            $attrValue.removeClass('selected');
        }

        if (attrValue.url) {
            $swatchAnchor.attr('href', attrValue.url);
        } else {
            $swatchAnchor.removeAttr('href');
        }

        // Disable if not selectable
        $attrValue.removeClass('selectable unselectable');

        $attrValue.addClass(attrValue.selectable ? 'selectable' : 'unselectable');
    });
}

/**
 * Process attribute values associated with an attribute that does not have image swatches
 *
 * @param {Object} attr - Attribute
 * @param {string} attr.id - Attribute ID
 * @param {Object[]} attr.values - Array of attribute value objects
 * @param {string} attr.values.value - Attribute coded value
 * @param {string} attr.values.url - URL to de/select an attribute value of the product
 * @param {boolean} attr.values.isSelectable - Flag as to whether an attribute value can be
 *     selected.  If there is no variant that corresponds to a specific combination of attribute
 *     values, an attribute may be disabled in the Product Detail Page
 */
function processNonSwatchValues(attr) {
    var $attr = '[data-attr="' + attr.id + '"]';
    var $defaultOption = $($attr + ' .select-' + attr.id + ' option:first');
    $defaultOption.attr('value', attr.resetUrl);

    attr.values.forEach(function (attrValue) {
        var $attrValue = $($attr + ' [data-attr-value="' + attrValue.value + '"]');
        $attrValue.attr('value', attrValue.url)
            .removeAttr('disabled');

        if (!attrValue.selectable) {
            $attrValue.attr('disabled', true);
        }
    });
}

/**
 * Appends the quantity selected to the Ajax URL.  Used to determine product availability, which is
 * one criteria used to enable the "Add to Cart" button
 *
 * @param {string} url - Attribute value onClick URL used to [de]select an attribute value
 * @param {JQuery} $productContainer - DOM element containing a product
 * @return {string} - The provided URL appended with the quantity selected in the query params or
 *     the original provided URL if no quantity selected
 */
function appendQuantityToUrl(url, $productContainer) {
    var quantitySelected = $productContainer.find('.quantity-select').val();
    return !quantitySelected ? url : url + '&quantity=' + quantitySelected;
}

/**
 * Routes the handling of attribute processing depending on whether the attribute has image
 *     swatches or not
 *
 * @param {Object} attrs - Attribute
 * @param {string} attr.id - Attribute ID
 */
function updateAttrs(attrs) {
    // Currently, the only attribute type that has image swatches is Color.
    var attrsWithSwatches = ['color'];

    attrs.forEach(function (attr) {
        if (attrsWithSwatches.indexOf(attr.id) > -1) {
            processSwatchValues(attr);
        } else {
            processNonSwatchValues(attr);
        }
    });
}

/**
 * Determines bundle availability status
 *
 * @param {Object} response - JSON response from Ajax call
 * @param {string[]} response.resources - List of availability statuses
 * @return {string} - Bundle availability status
 */
function getBundleAvailability(response) {
    var availability = response.resources.label_instock;

    if ($('.bundle-item div.availability[data-available=false]').length) {
        availability = response.resources.label_outofstock;
    } else if ($('.bundle-item div.availability[data-ready-to-order=false]').length) {
        availability = response.resources.info_selectforstock;
    }

    return availability;
}

/**
 * Determines whether the main bundle product can be ordered
 *
 * @return {boolean} - Whether the main bundle product can be ordered
 */
function isBundleOrderable() {
    return !$('.bundle-item div.availability[data-ready-to-order=false]').length &&
        !$('.bundle-item div.availability[data-available=false]').length;
}

/**
 * Retrieves Bundle's Add to Cart Button jQuery object
 *
 * @return {JQuery} - Bundle's Add to Cart Button
 */
function getBundleAddToCartButton() {
    var bundlePid = $('.product-bundle').parents().data('pid');
    return $(['button.add-to-cart', '[data-pid="', bundlePid, '"]'].join(''));
}

/**
 * Updates the availability status in the Product Detail Page
 *
 * @param {Object} response - Ajax response object after an attribute value has been [de]selected
 * @param {jQuery} $productContainer - DOM element containing a product
 */
function updateAvailability(response, $productContainer) {
    var availabilityValue = '';
    var availabilityMessages = response.product.availability.messages;
    var hasRequiredAttrsSelected = response.product.readyToOrder;
    var bundleAvailability;

    $productContainer.find('div.availability')
        .attr('data-ready-to-order', response.product.readyToOrder)
        .attr('data-available', response.product.available);

    if (!hasRequiredAttrsSelected) {
        availabilityValue = '<li>' + response.resources.info_selectforstock + '</li>';
    } else {
        availabilityMessages.forEach(function (message) {
            availabilityValue += '<li>' + message + '</li>';
        });
    }

    $productContainer.find('.availability-msg')
        .eq(0)
        .empty()
        .html(availabilityValue);

    if (isBundle()) {
        // Update bundle
        $('.bundle-footer div.availability').attr('data-ready-to-order', isBundleOrderable());

        bundleAvailability = getBundleAvailability(response);

        $('.bundle-footer ul.availability-msg').html('<li>' + bundleAvailability + '</li>');
    }
}

/**
 * Generates html for promotions section
 *
 * @param {array} promotions - list of promotions
 * @return {string} - Compiled HTML
 */
function getPromotionsHtml(promotions) {
    if (!promotions) {
        return '';
    }

    var html = '';

    promotions.forEach(function (promotion) {
        html += '<div class="callout" title="' + promotion.details + '">' + promotion.calloutMsg +
            '</div>';
    });

    return html;
}

/**
 * Generates html for product attributes section
 *
 * @param {array} attributes - list of attributes
 * @return {string} - Compiled HTML
 */
function getAttributesHtml(attributes) {
    if (!attributes) {
        return '';
    }

    var html = '';

    attributes.forEach(function (attributeGroup) {
        if (attributeGroup.ID === 'mainAttributes') {
            attributeGroup.attributes.forEach(function (attribute) {
                html += '<div class="attribute-values">' + attribute.label + ': '
                    + attribute.value + '</div>';
            });
        }
    });

    return html;
}

/**
 * Enables/disables Add to Cart button for a bundle or specific product item
 *
 * @param {Object} response - response from Ajax call
 * @param {JQuery} $productContainer - Product item object
 */
function updateAddToCartButton(response, $productContainer) {
    var disableButton = false;

    $productContainer.find('button.add-to-cart')
        .eq(0)
        .attr('disabled', (!response.product.readyToOrder || !response.product.available))
        .trigger('product:statusUpdate', response.product);

    if (isBundle()) {
        disableButton = !isBundleOrderable();
        getBundleAddToCartButton()
            .attr('disabled', disableButton)
            .trigger('product:statusUpdate', response.product);
    }
}

/**
 * Parses JSON from Ajax call made whenever an attribute value is [de]selected
 * @param {Object} response - response from Ajax call
 * @param {Object} response.product - Product object
 * @param {string} response.product.id - Product ID
 * @param {Object[]} response.product.variationAttributes - Product attributes
 * @param {Object[]} response.product.images - Product images
 * @param {boolean} response.product.hasRequiredAttrsSelected - Flag as to whether all required
 *     attributes have been selected.  Used partially to
 *     determine whether the Add to Cart button can be enabled
 * @param {string} caller - identifying the calling element
 *                          (a product tile or the product details page)
 * @param {JQuery} $productContainer - Product item object
 */
function handleVariantResponse(response, caller, $productContainer) {
    // Update Item No.
    if (caller === 'tile') {
        $productContainer.find('.product-quickview').eq(0).data('pid', response.product.id);
    }

    if (caller === 'details') {
        $productContainer.find('.product-id')
            .eq(0)
            .text(response.product.id);
        $productContainer.attr('data-pid', response.product.id);
    }

    if (response.product.variationAttributes) {
        updateAttrs(response.product.variationAttributes);
    }

    // Update primary images
    var primaryImageUrls = response.product.images;
    primaryImageUrls.large.forEach(function (imageUrl, idx) {
        $productContainer.find('.primary-images').eq(0).find('img').eq(idx)
            .attr('src', imageUrl.url);
    });

    // Update pricing
    $productContainer.find('.prices .price').eq(0).replaceWith(response.product.price.html);

    // Update promotions
    $productContainer.find('.promotions')
        .eq(0)
        .empty()
        .html(getPromotionsHtml(response.product.promotions));

    updateAvailability(response, $productContainer);

    // Enable "Add to Cart" button if all required attributes have been selected
    updateAddToCartButton(response, $productContainer);

    // Update attributes
    $productContainer.find('.main-attributes')
        .eq(0)
        .empty()
        .html(getAttributesHtml(response.product.attributes));
}

/**
 * Retrieves url to use when updating a product view and appends the quantity
 * @param {string} selectedValueUrl - string The url used to indicate the product variation
 * @param {JQuery} $productContainer - Product item object
 * @return {string|null} - the Url for the selected variation value
 */
function createSelectedValueUrl(selectedValueUrl, $productContainer) {
    if (selectedValueUrl && selectedValueUrl !== 'null') {
        return appendQuantityToUrl(selectedValueUrl, $productContainer);
    }

    return null;
}

/**
 * updates the product view when a product attribute is selected or deselected or when
 *         changing quantity
 * @param {string} selectedValueUrl - the Url for the selected variation value
 * @param {JQuery} $productContainer - Product item object
 */
function attributeSelect(selectedValueUrl, $productContainer) {
    var productUrl;
    var view;

    if (selectedValueUrl) {
        if ($('#quickViewModal').hasClass('show')) {
            view = 'tile';
            $('.modal-body').spinner().start();
            productUrl = selectedValueUrl.replace('Product-Variation', 'Product-Show');
            $('.full-pdp-link').attr('href', productUrl);
            $('.product-quickview .size-chart a').attr('href', productUrl);
        } else {
            view = 'details';
            $.spinner().start();
        }

        $.ajax({
            url: selectedValueUrl,
            method: 'GET',
            success: function (data) {
                handleVariantResponse(data, view, $productContainer);
                $productContainer.find('.quantity-select')
                    .data('action', data.product.selectedVariantUrl);
                $.spinner().stop();
            },
            error: function () {
                $.spinner().stop();
            }
        });
    }
}

/**
 * Retrieves url to use when adding a product to the cart
 *
 * @return {string} - The provided URL to use when adding a product to the cart
 */
function getAddToCartUrl() {
    return $('input[name="addToCartUrl"]').val();
}

/**
 * Updates the Mini-Cart quantity value after the customer has pressed the "Add to Cart" button
 * @param {string} response - ajax response from clicking the add to cart button
 */
function handlePostCartAdd(response) {
    $('.mini-cart').trigger('count:update', response);
    var messageType = 'alert-success';
    // show add to cart toast
    if ($('.add-to-basket-alert').length === 0) {
        if (response.error) {
            messageType = 'alert-danger';
        }
        $('body').append(
            '<div class="alert ' + messageType + ' add-to-basket-alert" role="alert">'
            + response.message + response.error
            + '</div>'
        );
    }

    $('.add-to-basket-alert').addClass('show');
    setTimeout(function () {
        $('.add-to-basket-alert').removeClass('show');
    }, 10000);
}

/**
 * Retrieves the bundle product item ID's for the Controller to replace bundle master product
 * items with their selected variants
 *
 * @return {string[]} - List of selected bundle product item ID's
 */
function getChildPids() {
    if (isBundle()) {
        return $('.bundle-item .product-id').map(function () {
            return $(this).text();
        }).get().join(',');
    }
    return [];
}

module.exports = {
    attributeSelect: attributeSelect,

    colorAttribute: function () {
        $(document).on('click', '[data-attr="color"] a', function (e) {
            e.preventDefault();

            var $productContainer = $(this).closest('.product-detail');
            var selectedValueUrl = createSelectedValueUrl(e.currentTarget.href, $productContainer);
            attributeSelect(selectedValueUrl, $productContainer);
        });
    },

    selectAttribute: function () {
        $(document).on('change', 'select[class*="select-"]', function (e) {
            e.preventDefault();

            var $productContainer = $(this).closest('.product-detail');
            var selectedValueUrl = createSelectedValueUrl(e.currentTarget.value, $productContainer);
            attributeSelect(selectedValueUrl, $productContainer);
        });
    },

    availability: function () {
        $(document).on('change', '.quantity-select', function (e) {
            e.preventDefault();
            var quantity = getQuantitySelected($(this));
            var $productContainer = $(this).closest('.product-detail');
            if (!isBundle()) {
                attributeSelect($('.quantity-select').data('action') + '&quantity=' + quantity,
                    $productContainer);
            }
        });
    },

    addToCart: function () {
        $(document).on('click', 'button.add-to-cart', function () {
            var view;
            var pid;

            if ($('#quickViewModal').hasClass('show')) {
                view = 'tile';
                pid = $(this).closest('.product-quickview').data('pid');
            } else {
                view = 'details';
                pid = isBundle()
                    ? $('.product-bundle .product-id').eq(0).text()
                    : $('.product-id').text();
            }

            if (view === 'tile') {
                $('.modal-body').spinner().start();
            } else {
                $.spinner().start();
            }

            $.ajax({
                url: getAddToCartUrl(),
                method: 'POST',
                data: {
                    pid: pid,
                    childPids: getChildPids(),
                    quantity: getQuantitySelected($(this))
                },
                success: function (data) {
                    handlePostCartAdd(data);
                    if (view === 'tile') {
                        $('#quickViewModal').modal('hide');
                    }
                    $.spinner().stop();
                },
                error: function () {
                    $.spinner().stop();
                }
            });
        });
    }
};
