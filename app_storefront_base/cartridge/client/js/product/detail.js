'use strict';
var base = require('./base');

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

        $attrValue.attr('data-selected', attrValue.selected);

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
    attr.values.forEach(function (attrValue) {
        var $attr = '[data-attr="' + attr.id + '"]';
        var $attrValue = $($attr + ' [data-attr-value="' + attrValue.value + '"]');
        $attrValue.attr('value', attrValue.url)
            .removeAttr('disabled');

        if (!attrValue.selectable) {
            $attrValue.attr('disabled', true);
        }
    });
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
 * @param {Object} response - Ajax response object after an attribute value has been [de]selected
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
 * Parses JSON from Ajax call made whenever an attribute value is [de]selected
 * @param {Object} response - response from Ajax call
 * @param {Object} response.product - Product object
 * @param {string} response.product.id - Product ID
 * @param {Object[]} response.product.attributes - Product attributes
 * @param {Object[]} response.product.images - Product images
 * @param {boolean} response.product.hasRequiredAttrsSelected - Flag as to whether all required
 *     attributes have been selected.  Used partially to determine whether the Add to Cart button
 *     can be enabled
 */
function parseJsonResponse(response) {
    // Update Item No.
    $('.product-id').text(response.product.id);

    updateAttrs(response.product.attributes);

    // Enable "Add to Cart" button if all required attributes have been selected
    $('button.add-to-cart').attr('disabled', !response.product.readyToOrder);

    // Update primary images
    var primaryImageUrls = response.product.images;
    primaryImageUrls.large.forEach(function (imageUrl, idx) {
        $('.primary-images').find('img').eq(idx)
            .attr('src', imageUrl.url);
    });

    updateAvailability(response);
}

module.exports = function () {
    $('select[class^="select-"]').on('change', function (e) {
        e.preventDefault();
        var selectedValueUrl = base.getSelectedValueUrl(e.currentTarget.value, $(this));

        if (selectedValueUrl) {
            $.ajax({
                url: selectedValueUrl,
                method: 'GET',
                success: parseJsonResponse
            });
        }
    });

    $('[data-attr="color"] a').on('click', function (e) {
        e.preventDefault();
        var selectedValueUrl = base.getSelectedValueUrl(e.currentTarget.href, $(this));

        $.ajax({
            url: selectedValueUrl,
            method: 'GET',
            success: parseJsonResponse
        });
    });

    $('button.add-to-cart').on('click', function () {
        var pid = $('.product-id').text();
        var addToCartUrl = base.getAddToCartUrl(pid);

        if (addToCartUrl) {
            $.ajax({
                url: addToCartUrl,
                method: 'POST',
                success: base.handlePostCartAdd
            });
        }
    });
};
