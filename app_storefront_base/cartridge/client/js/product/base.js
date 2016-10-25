'use strict';

/**
 * Retrieves the value associated with the Quantity pull-down menu
 * @return {string} - value found in the quantity input
 */
function getQuantitySelected() {
    return $('select.quantity').val();
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

module.exports = {
    /**
     * Updates the Mini-Cart quantity value after the customer has pressed the "Add to Cart" button
     * @param {string} response - ajax response from clicking the add to cart button
     */
    handlePostCartAdd: function (response) {
        $('.mini-cart').trigger('count:update', response);
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
    }

};
