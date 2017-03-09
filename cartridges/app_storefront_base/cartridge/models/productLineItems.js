'use strict';

var helper = require('~/cartridge/scripts/dwHelpers');
var ProductFactory = require('../scripts/factories/product');

/**
 * Creates an array of product line items
 * @param {dw.util.Collection <dw.order.ProductLineItem>} allLineItems - All product
 * line items of the basket
 * @returns {Array} an array of product line items.
 */
function createProductLineItemsObject(allLineItems) {
    var lineItems = helper.map(allLineItems, function (item) {
        var params = {
            pid: item.product.ID,
            quantity: item.quantity.value,
            variables: null,
            pview: 'productLineItem',
            lineItem: item
        };

        return ProductFactory.get(params);
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
 * items in current basket or per shipment
 *
 * @param {Object} shipment - the target Shipment or Basket object
 */
function ProductLineItems(shipment) {
    var plis;
    if (shipment) {
        if ('allProductLineItems' in shipment) {
            plis = shipment.allProductLineItems;
        } else {
            plis = shipment.productLineItems;
        }
    }
    if (plis) {
        this.items = createProductLineItemsObject(plis);
        this.totalQuantity = getTotalQuantity(plis);
    } else {
        this.items = [];
        this.totalQuantity = 0;
    }
}

ProductLineItems.getTotalQuantity = getTotalQuantity;

module.exports = ProductLineItems;
