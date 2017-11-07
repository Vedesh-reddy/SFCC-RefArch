'use strict';

/**
 * get the min and max numbers to display in the quantity drop down.
 * @param {Object} product - a line item of the basket.
 * @param {number} quantity - number of items for this product
 * @returns {Object} The minOrderQuantity and maxOrderQuantity to display in the quantity drop down.
 */
function getMinMaxQuantityOptions(product, quantity) {
    var availableToSell = product.availabilityModel.inventoryRecord.ATS.value;
    var max = Math.max(Math.min(availableToSell, 10), quantity);

    return {
        minOrderQuantity: product.minOrderQuantity.value || 1,
        maxOrderQuantity: max
    };
}

module.exports = function (object, product, quantity) {
    Object.defineProperty(object, 'quantityOptions', {
        enumerable: true,
        value: getMinMaxQuantityOptions(product, quantity)
    });
};
