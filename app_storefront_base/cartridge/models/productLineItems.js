'use strict';

var helper = require('~/cartridge/scripts/dwHelpers');
var ProductLineItemModel = require('./productLineItem');

/**
 * Creates an array of objects containing Product line item information
 * @param {dw.util.Collection <dw.order.ProductLineItem>} allLineItems - All product
 * line items of the basket
 * @returns {Array} an array of objects that contain information about each product line item.
 */
function createProductLineItemsObject(allLineItems) {
    var lineItems = helper.map(allLineItems, function (item) {
        return new ProductLineItemModel(item, [], item.quantity.value);
    });

    return lineItems;
}

/**
 * Loops through all of the product line items and adds the quantities together.
 * @param {dw.util.Collection <dw.order.ProductLineItem>} productLineItems - All product
 * line items of the basket
 * @returns {Number} a number representing all product line items in the lineItem container.
 */
function getTotalQuantity(items) {
    // TODO add giftCertificateLineItems quantity
    var totalQuantity = 0;
    helper.forEach(items, function (lineItem) {
        totalQuantity += lineItem.quantity.value;
    });

    return totalQuantity;
}

/**
 * class that represents a collection of line items and total quantity of items in current basket
 * @param {dw.order.Basket} basket Current users's basket
 * @constructor
 */
function productLineItems(basket) {
    if (basket) {
        this.items = createProductLineItemsObject(basket.allProductLineItems);
        this.totalQuantity = getTotalQuantity(basket.allProductLineItems);
    } else {
        this.items = [];
        this.totalQuantity = 0;
    }
}

productLineItems.getTotalQuantity = getTotalQuantity;

module.exports = productLineItems;
