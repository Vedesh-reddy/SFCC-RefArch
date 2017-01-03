'use strict';

var helper = require('~/cartridge/scripts/dwHelpers');
var ProductLineItemModel = require('./productLineItem');

/**
 * Creates an array of product line items
 * @param {dw.util.Collection <dw.order.ProductLineItem>} allLineItems - All product
 * line items of the basket
 * @returns {Array} an array of product line items.
 */
function createProductLineItemsObject(allLineItems) {
    var lineItems = helper.map(allLineItems, function (item) {
        return new ProductLineItemModel(item.product, null, item.quantity.value, item);
    });

    return lineItems;
}

/**
 * Loops through all of the product line items and adds the quantities together.
 * @param {dw.util.Collection <dw.order.ProductLineItem>} items - All product
 * line items of the basket
 * @returns {number} a number representing all product line items in the lineItem container.
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
 * @constructor
 * @classdesc class that represents a collection of line items and total quantity of
 * items in current basket
 *
 * @param {dw.order.Basket} basket Current users's basket
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
