'use strict';

/**
 * Retrieves the value associated with the Quantity pull-down menu
 * @return {string} - value found in the quantity input
 */
function getQuantitySelected() {
    return $('.quantity select').val();
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
 * Updates the availability status in the Product Detail Page
 *
 * @param {Object} response - Ajax response object after an
 *                            attribute value has been [de]selected
 */
function updateAvailability(response) {
    var resources = {
        instock: response.resources.label_instock,
        allnotavailable: response.resources.label_allnotavailable,
        selectforstock: response.resources.info_selectforstock
    };
    var hasRequiredAttrsSelected = response.product.readyToOrder;
    var isAvailable = response.product.available;
    var availabilityValue;

    if (hasRequiredAttrsSelected && isAvailable) {
        availabilityValue = resources.instock;
    } else if (hasRequiredAttrsSelected && !isAvailable) {
        availabilityValue = resources.allnotavailable;
    } else {
        availabilityValue = resources.selectforstock;
    }

    $('.availability-msg').empty().text(availabilityValue);
}

/**
 * Generates html for promotions section
 *
 * @param {array} promotions - list of promotions
 * @return {string} - Compiled HTML
 */
function getPromotionsHtml(promotions) {
    if (!promotions.length) {
        return '';
    }

    var html = '';

    promotions.forEach(function (promotion) {
        html += '<div class="callout" title="' + promotion.details + '">' + promotion.calloutMsg +
            '</div>';
    });

    return html;
}

module.exports = {
    /**
     * Updates the Mini-Cart quantity value after the customer has pressed the "Add to Cart" button
     * @param {string} response - ajax response from clicking the add to cart button
     */
    handlePostCartAdd: function (response) {
        $('.mini-cart').trigger('count:update', response);
        // show add to cart toast
        if ($('.add-to-basket-alert').length === 0) {
            $('body').append(
                '<div class="alert alert-success add-to-basket-alert" role="alert">'
                + response.message
                + '</div>'
            );
        }
        $('.add-to-basket-alert').addClass('show');
        setTimeout(function () {
            $('.add-to-basket-alert').removeClass('show');
        }, 10000);
    },

    /**
     * Retrieves url to use when adding a product to the cart
     * @param {string} pid - product id
     * @return {string} - The provided URL to use when adding a product to the cart
     */
    getAddToCartUrl: function (pid) {
        var quantity = getQuantitySelected();
        var queryParams = ['pid=' + pid, 'quantity=' + quantity].join('&');
        return $('input[name="addToCartUrl"]').val() + '?' + queryParams;
    },

    /**
     * Retrieves url to use when updating a product view
     * @param {string} selectedValueUrl - string The url used to indicate the product variation
     * @param {string} selectedInput - the option value of a select tag or a swatch link
     * @return {string} - the Url for the selected variation value including quantity, or null
     */
    getSelectedValueUrl: function (selectedValueUrl, selectedInput) {
        if (selectedValueUrl && selectedValueUrl !== 'null') {
            return appendQuantityToUrl(selectedValueUrl);
        }

        selectedInput.closest('.attributes').find('.add-to-cart').attr('disabled', true);
        return null;
    },

    /**
     * Parses JSON from Ajax call made whenever an attribute value is [de]selected
     * @param {Object} response - response from Ajax call
     * @param {Object} response.product - Product object
     * @param {string} response.product.id - Product ID
     * @param {Object[]} response.product.attributes - Product attributes
     * @param {Object[]} response.product.images - Product images
     * @param {boolean} response.product.hasRequiredAttrsSelected - Flag as to whether all required
     *     attributes have been selected.  Used partially to
     *     determine whether the Add to Cart button can be enabled
     * @param {string} caller - identifying the calling element
     *                          (a product tile or the product details page)
     */
    parseJsonResponse: function (response, caller) {
        // Update Item No.
        if (caller === 'tile') {
            $('.product-quickview').data('pid', response.product.id);
        }

        if (caller === 'details') {
            $('.product-id').text(response.product.id);
        }

        updateAttrs(response.product.attributes);

        // Enable "Add to Cart" button if all required attributes have been selected
        $('button.add-to-cart').attr('disabled', !response.product.readyToOrder);

        // Update primary images
        var primaryImageUrls = response.product.images;
        primaryImageUrls.large.forEach(function (imageUrl, idx) {
            $('.primary-images').find('img').eq(idx)
                .attr('src', imageUrl.url);
        });

        // Update pricing
        $('.prices .price').replaceWith(response.product.price.html);

        // Update promotions
        $('.promotions').empty().html(getPromotionsHtml(response.product.promotions));

        updateAvailability(response);
    }

};
