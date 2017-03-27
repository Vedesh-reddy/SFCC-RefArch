'use strict';

var $compareBar = $('.compare-bar');
var maxSlots = parseInt($compareBar.data('max-slots'), 10);
var productsForComparison = [];


/**
 * @typedef ProductComparisonList
 * @type Object
 * @property {string} pid - ID for product to compare
 * @property {string} imgSrc - Image URL for selected product
 */

/**
 * Compiles the HTML for a single slot
 *
 * @param {ProductComparisonList} product - Selected product to compare
 * @param {number} idx - Slot number (zero-based)
 * @return {string} - HTML for a single slot
 */
function compileSlot(product, idx) {
    var pid = product.pid;
    var name = 'pid' + idx;

    return '' +
        '<div class="col-3 selected-product">' +
            '<div class="slot" data-pid="' + pid + '">' +
                '<img src="' + product.imgSrc + '" />' +
                '<div class="close">' +
                    '<i class="fa fa-close"></i>' +
                '</div>' +
            '</div>' +
            '<input type="hidden" name="' + name + '" value="' + pid + '" />' +
        '</div>\n';
}

/**
 * Draw and render the Compare Bar product slots
 *
 * @param {ProductComparisonList []} productsToCompare - List of ID's of the products to compare
 */
function redrawCompareSlots(productsToCompare) {
    var html = productsToCompare.map(function (product, idx) {
        return compileSlot(product, idx);
    }).join('');

    // Render empty slots
    if (productsToCompare.length < maxSlots) {
        var numAvailableSlots = maxSlots - productsToCompare.length;

        for (var i = 0; i < numAvailableSlots; i++) {
            if (i === 0 && productsToCompare.length < 2) {
                html += '<div class="col-3 selected-product"><div class="slot">' +
                    '<div class="min-products-msg">' + $compareBar.data('min-products-msg') +
                    '</div></div></div>';
            } else {
                html += '<div class="col-3 selected-product"><div class="slot"></div></div>';
            }
        }
    }

    $('.compare-bar .product-slots').empty().append(html);
}

/**
 * Enables/disables the Compare button, depending on whether at least two products have been
 * selected for comparison
 *
 * @param {number} numProducts - Number of products selected for comparison
 */
function setCompareButton(numProducts) {
    if (numProducts < 2) {
        $('button.compare').attr('disabled', true);
    } else {
        $('button.compare').removeAttr('disabled');
    }
}

/**
 * Returns a copy of a list of products to compare
 *
 * @param {ProductComparisonList []} productsToCompare - List of ID's of the products to compare
 * @return {ProductComparisonList []} List of ID's of the products to compare
 */
function copyProducts(productsToCompare) {
    return productsToCompare.map(function (product) {
        var proxy = {};

        Object.keys(product).forEach(function (key) {
            proxy[key] = product[key];
        });

        return proxy;
    });
}

/**
 * Handles the selection of a product for comparison
 *
 * @param {ProductComparisonList []} products - List of ID's of the products to compare
 * @param {string} pid - ID for product to compare
 * @param {string} imgSrc - Image URL for selected product
 * @return {ProductComparisonList []} List of ID's of the products to compare
 */
function selectProduct(products, pid, imgSrc) {
    var productsToCompare = copyProducts(products) || [];

    if (productsToCompare.length < maxSlots) {
        productsToCompare.push({
            pid: pid,
            imgSrc: imgSrc
        });

        if (productsToCompare.length === maxSlots) {
            $('input[type=checkbox]:not(:checked)').attr('disabled', true);
        }

        redrawCompareSlots(productsToCompare);
        setCompareButton(productsToCompare.length);
        $compareBar.show();
    }

    return productsToCompare;
}

/**
 * Handles the deselection of a product
 *
 * @param {ProductComparisonList []} products - List of ID's of the products to compare
 * @param {string} pid - ID for product to compare
 * @return {ProductComparisonList []} List of ID's of the products to compare
 */
function deselectProduct(products, pid) {
    var productsToCompare = copyProducts(products) || [];

    productsToCompare = productsToCompare.filter(function (product) {
        return product.pid !== pid;
    });

    if (productsToCompare.length === 0) {
        $compareBar.hide();
    }

    $('input#' + pid).prop('checked', false);
    $('input[type=checkbox]:not(:checked)').removeAttr('disabled');

    redrawCompareSlots(productsToCompare);
    setCompareButton(productsToCompare.length);
    return productsToCompare;
}

module.exports = {
    /**
     * Handles Compare checkbox click
     */
    handleCompareClick: function () {
        $('div.page').on('click', '.compare input[type=checkbox]', function () {
            var pid = $(this).attr('id');
            var checked = $(this).is(':checked');
            var imgSrc = $(this).closest('.product-tile')
                .find('.tile-image')
                .prop('src');

            if (checked) {
                productsForComparison = selectProduct(productsForComparison, pid, imgSrc);
                $(this).trigger('compare:selected', { pid: pid });
            } else {
                productsForComparison = deselectProduct(productsForComparison, pid);
                $(this).trigger('compare:deselected', { pid: pid });
            }
        });
    },

    /**
     * Handles the Clear All link
     */
    handleClearAll: function () {
        $('.compare-bar a.clear-all').on('click', function (e) {
            e.preventDefault();

            productsForComparison.forEach(function (product) {
                $(this).trigger('compare:deselected', { pid: product.pid });
            });

            productsForComparison = [];
            $('.compare input').prop('checked', false);
            $('.compare input[type=checkbox]:not(:checked)').removeAttr('disabled');
            $compareBar.hide();
        });
    },

    /**
     * Handles deselection of a product on the Compare Bar
     */
    deselectProductOnCompareBar: function () {
        $('.compare-bar').on('click', '.close', function () {
            var pid = $(this).closest('.slot').data('pid').toString();
            productsForComparison = deselectProduct(productsForComparison, pid);
            $(this).trigger('compare:deselected', { pid: pid });
        });
    },

    /**
     * Selects products for comparison based on the checked status of the Compare checkboxes in
     * each product tile.  Used when user goes back from the Compare Products page.
     */
    selectCheckedProducts: function () {
        $('.product-grid').ready(function () {
            $('.compare input:checked').each(function () {
                var pid = $(this).prop('id');
                var imgSrc = $(this).closest('.product-tile')
                    .find('img.tile-image')
                    .prop('src');
                productsForComparison = selectProduct(productsForComparison, pid, imgSrc);
                $(this).trigger('compare:selected', { pid: pid });
            });
        });
    },

    /**
     * Sets the "backUrl" property to the last attribute selected URL to ensure that when the user
     * goes back from the Compare Products page, the previously selected attributes are still
     * selected and applied to the previous search.
     */
    setBackUrl: function () {
        $('.search-results').on('click', '.refinements a', function () {
            $('input[name="backUrl"]').val($(this).prop('href'));
        });
    },

    /**
     * Sets the history.pushState for history.back() to work from the Compare Products page.
     */
    setPushState: function () {
        $('form[name="compare-products"]').on('submit', function () {
            $(this).find('input[name="cgid"]').attr('value', $('input.category-id').val());
            history.pushState({}, 'Back to results', $('input[name="backUrl"]').val());
        });
    }
};
