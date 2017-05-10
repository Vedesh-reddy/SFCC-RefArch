'use strict';

/**
 * Retrieves the value associated with the Quantity pull-down menu
 * @return {string} - value found in the quantity input
 */
function getQuantitySelected() {
    return $('.quantity-select').val();
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
 * @param {jQuery} $productContainer - DOM container for a given product
 */
function processSwatchValues(attr, $productContainer) {
    attr.values.forEach(function (attrValue) {
        var $attrValue = $productContainer.find('[data-attr="' + attr.id + '"] [data-attr-value="' +
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
 * @param {jQuery} $productContainer - DOM container for a given product
 */
function processNonSwatchValues(attr, $productContainer) {
    var $attr = '[data-attr="' + attr.id + '"]';
    var $defaultOption = $productContainer.find($attr + ' .select-' + attr.id + ' option:first');
    $defaultOption.attr('value', attr.resetUrl);

    attr.values.forEach(function (attrValue) {
        var $attrValue = $productContainer
            .find($attr + ' [data-attr-value="' + attrValue.value + '"]');
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
 * @return {string} - The provided URL appended with the quantity selected in the query params or
 *     the original provided URL if no quantity selected
 */
function appendQuantityToUrl(url) {
    var quantitySelected = getQuantitySelected();
    return !quantitySelected ? url : url + '&quantity=' + quantitySelected;
}

/**
 * Routes the handling of attribute processing depending on whether the attribute has image
 *     swatches or not
 *
 * @param {Object} attrs - Attribute
 * @param {string} attr.id - Attribute ID
 * @param {jQuery} $productContainer - DOM element for a given product
 */
function updateAttrs(attrs, $productContainer) {
    // Currently, the only attribute type that has image swatches is Color.
    var attrsWithSwatches = ['color'];

    attrs.forEach(function (attr) {
        if (attrsWithSwatches.indexOf(attr.id) > -1) {
            processSwatchValues(attr, $productContainer);
        } else {
            processNonSwatchValues(attr, $productContainer);
        }
    });
}

/**
 * Updates the availability status in the Product Detail Page
 *
 * @param {Object} response - Ajax response object after an
 *                            attribute value has been [de]selected
 * @param {jQuery} $productContainer - DOM element for a given product
 */
function updateAvailability(response, $productContainer) {
    var availabilityValue = '';
    var availabilityMessages = response.product.availability.messages;
    if (!response.product.readyToOrder) {
        availabilityValue = '<div>' + response.resources.info_selectforstock + '</div>';
    } else {
        availabilityMessages.forEach(function (message) {
            availabilityValue += '<div>' + message + '</div>';
        });
    }

    $($productContainer).trigger('product:updateAvailability', {
        product: response.product,
        $productContainer: $productContainer,
        message: availabilityValue,
        resources: response.resources
    });
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
 * Parses JSON from Ajax call made whenever an attribute value is [de]selected
 * @param {Object} response - response from Ajax call
 * @param {Object} response.product - Product object
 * @param {string} response.product.id - Product ID
 * @param {Object[]} response.product.variationAttributes - Product attributes
 * @param {Object[]} response.product.images - Product images
 * @param {boolean} response.product.hasRequiredAttrsSelected - Flag as to whether all required
 *     attributes have been selected.  Used partially to
 *     determine whether the Add to Cart button can be enabled
 * @param {jQuery} $productContainer - DOM element for a given product.
 */
function handleVariantResponse(response, $productContainer) {
    if (response.product.variationAttributes) {
        updateAttrs(response.product.variationAttributes, $productContainer);
    }

    // Update primary images
    var primaryImageUrls = response.product.images;
    primaryImageUrls.large.forEach(function (imageUrl, idx) {
        $productContainer.find('.primary-images').find('img').eq(idx)
            .attr('src', imageUrl.url);
    });

    // Update pricing
    $('.prices .price', $productContainer).replaceWith(response.product.price.html);

    // Update promotions
    $('.promotions').empty().html(getPromotionsHtml(response.product.promotions));

    updateAvailability(response, $productContainer);

    // Enable "Add to Cart" button if all required attributes have been selected
    $('button.add-to-cart, button.add-to-cart-global').trigger('product:updateAddToCart', {
        product: response.product, $productContainer: $productContainer
    }).trigger('product:statusUpdate', response.product);

    // Update attributes
    $productContainer.find('.main-attributes').empty()
        .html(getAttributesHtml(response.product.attributes));
}

/**
 * Retrieves url to use when updating a product view and appends the quantity
 * @param {string} selectedValueUrl - string The url used to indicate the product variation
 * @return {string|null} - the Url for the selected variation value
 */
function createSelectedValueUrl(selectedValueUrl) {
    if (selectedValueUrl && selectedValueUrl !== 'null') {
        return appendQuantityToUrl(selectedValueUrl);
    }

    return null;
}

/**
 * updates the product view when a product attribute is selected or deselected or when
 *         changing quantity
 * @param {string} selectedValueUrl - the Url for the selected variation value
 * @param {jQuery} $productContainer - DOM element for current product
 */
function attributeSelect(selectedValueUrl, $productContainer) {
    if (selectedValueUrl) {
        $('body').trigger('product:beforeAttributeSelect',
            { url: selectedValueUrl, container: $productContainer });

        $.ajax({
            url: selectedValueUrl,
            method: 'GET',
            success: function (data) {
                handleVariantResponse(data, $productContainer);
                $('body').trigger('product:afterAttributeSelect',
                    { data: data, container: $productContainer });
                $('.quantity-select').data('action', data.product.selectedVariantUrl);
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
    return $('.add-to-cart-url').val();
}

/**
 * Updates the Mini-Cart quantity value after the customer has pressed the "Add to Cart" button
 * @param {string} response - ajax response from clicking the add to cart button
 */
function handlePostCartAdd(response) {
    $('.mini-cart').trigger('count:update', response);
    var messageType = response.error ? 'alert-danger' : 'alert-success';
    // show add to cart toast
    if ($('.add-to-cart-messages').length === 0) {
        $('body').append(
        '<div class="add-to-cart-messages"></div>'
     );
    }

    $('.add-to-cart-messages').append(
        '<div class="alert ' + messageType + ' add-to-basket-alert text-center" role="alert">'
        + response.message
        + '</div>'
    );

    setTimeout(function () {
        $('.add-to-basket-alert').remove();
    }, 10000);
}

/**
 * Retrieves the bundle product item ID's for the Controller to replace bundle master product
 * items with their selected variants
 *
 * @return {string[]} - List of selected bundle product item ID's
 */
function getChildPids() {
    return $('.bundle-item .product-id').map(function () {
        return $(this).text();
    }).get().join(',');
}

module.exports = {
    attributeSelect: attributeSelect,

    colorAttribute: function () {
        $(document).on('click', '[data-attr="color"] a', function (e) {
            e.preventDefault();

            if ($(this).attr('disabled')) {
                return;
            }

            var $productContainer = $(this).closest('.product-detail');
            if (!$productContainer.length) {
                $productContainer = $(this).closest('.product-quickview');
            }

            var selectedValueUrl = createSelectedValueUrl(e.currentTarget.href);
            attributeSelect(selectedValueUrl, $productContainer);
        });
    },

    selectAttribute: function () {
        $(document).on('change', 'select[class*="select-"]', function (e) {
            e.preventDefault();

            var $productContainer = $(this).closest('.product-detail');
            if (!$productContainer.length) {
                $productContainer = $(this).closest('.product-quickview');
            }

            var selectedValueUrl = createSelectedValueUrl(e.currentTarget.value);
            attributeSelect(selectedValueUrl, $productContainer);
        });
    },

    availability: function () {
        $(document).on('change', '.quantity-select', function (e) {
            e.preventDefault();
            var quantity = getQuantitySelected();

            var $productContainer = $(this).closest('.product-detail');
            if (!$productContainer.length) {
                $productContainer = $(this).closest('.modal-content').find('.product-quickview');
            }

            if ($('.bundle-items', $productContainer).length === 0) {
                attributeSelect($('.quantity-select').data('action') + '&quantity=' + quantity,
                    $productContainer);
            }
        });
    },

    addToCart: function () {
        $(document).on('click', 'button.add-to-cart, button.add-to-cart-global', function () {
            var addToCartUrl;
            var pid;

            $('body').trigger('product:beforeAddToCart', this);

            if ($('#quickViewModal').hasClass('show')) {
                pid = $(this).closest('.modal-content').find('.product-quickview').data('pid');
            } else {
                pid = $('.product-detail:not(".bundle-item")').data('pid');
            }

            addToCartUrl = getAddToCartUrl();

            if (addToCartUrl) {
                $.ajax({
                    url: addToCartUrl,
                    method: 'POST',
                    data: {
                        pid: pid,
                        childPids: getChildPids(),
                        quantity: getQuantitySelected($(this))
                    },
                    success: function (data) {
                        handlePostCartAdd(data);
                        $('body').trigger('product:afterAddToCart', data);
                        $.spinner().stop();
                    },
                    error: function () {
                        $.spinner().stop();
                    }
                });
            }
        });
    }
};
