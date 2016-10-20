'use strict';

var helper = require('~/cartridge/scripts/dwHelpers');
var PricingModel = require('./product/productPricing');

var URLUtils = require('dw/web/URLUtils');
var formatMoney = require('dw/util/StringUtils').formatMoney;
var money = require('dw/value/Money');

/**
 * get the min and max numbers to display in the quantity drop down.
 * @param {dw.order.ProductLineItem} productLineItem - a line item of the basket.
 * @returns {Object} The minOrderQuantity and maxOrderQuantity to display in the quantity drop down.
 */
function getMinMaxQuantityOptions(productLineItem) {
    var quantity = productLineItem.quantity.value;
    var availableToSell = productLineItem.product.availabilityModel.inventoryRecord.ATS.value;
    var max = Math.max(Math.min(availableToSell, 10), quantity);

    return {
        minOrderQuantity: productLineItem.product.minOrderQuantity.value || 1,
        maxOrderQuantity: max
    };
}

/**
 * Creates an array of objects containing a product line item's selected variants
 * @param {dw.catalog.Product} product - the product that the line item represents
 * @returns {Array} an array of objects containing a product line item's selected variants
 */
function getSelectedVariationAttributes(product) {
    var variationAttributes = product.variationModel.productVariationAttributes;
    var selectedAttributes = helper.map(variationAttributes, function (attribute) {
        return {
            displayName: attribute.displayName,
            displayValue: product.variationModel.getSelectedValue(attribute).displayValue
        };
    });

    return selectedAttributes;
}

/**
 * Creates an array of objects containing Product line item information
 * @param {dw.util.Collection <dw.order.ProductLineItem>} allLineItems - All product
 * line items of the basket
 * @returns {Array} an array of objects that contain information about each product line item.
 */
function createProductLineItemsObject(allLineItems) {
    var lineItems = helper.map(allLineItems, function (item) {
        var result = {
            type: 'Product',
            url: !item.categoryID
                ? URLUtils.http('Product-Show', 'pid', item.productID).toString()
                : URLUtils.http(
                'Product-Show',
                'pid',
                item.productID,
                'cgid',
                item.categoryID
            ).toString(),
            variationAttributes: getSelectedVariationAttributes(item.product),
            quantity: item.quantity.value,
            quantityOptions: getMinMaxQuantityOptions(item),
            priceModelPricing: new PricingModel(item.product, []),
            priceTotal: formatMoney(money(
                item.adjustedPrice.value,
                item.adjustedPrice.currencyCode
            )),
            name: item.productName,
            isBundle: item.product.bundle,
            isMaster: item.product.master,
            isProductSet: item.product.productSet,
            isVariant: item.product.variant,
            isBonusProductLineItem: item.bonusProductLineItem,
            isGift: item.gift,
            isOrderable: item.product.availabilityModel.isOrderable(item.quantity.value),
            productID: item.productID,
            UUID: item.UUID
        };

        if (item.product.getImage('small', 0)) {
            result.image = {
                src: item.product.getImage('small', 0).URL.toString(),
                alt: item.product.getImage('small', 0).alt,
                title: item.product.getImage('small', 0).title
            };
        } else {
            result.image = {
                src: URLUtils.staticURL('/images/noimagesmall.png').toString(),
                alt: item.productName,
                title: item.productName
            };
        }
        return result;
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
