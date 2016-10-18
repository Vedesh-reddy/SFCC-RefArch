'use strict';

var formatMoney = require('dw/util/StringUtils').formatMoney;
var money = require('dw/value/Money');

var ProductBase = require('./product/productBase').productBase;
var productBase = require('./product/productBase');

/**
 * get the min and max numbers to display in the quantity drop down.
 * @param {dw.order.ProductLineItem} productLineItem - a line item of the basket.
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

/**
 * @constructor
 * @classdesc
 * @param {} product -
 * @param {} productVariables -
 * @param {} quantity - quantity of products selected
 */
function ProductLineItem(product, productVariables, quantity, lineItem) {
    this.variationModel = this.prototype.getVariationModel(product, productVariables);
    this.product = this.variationModel.selectedVariant
        || this.variationModel.defaultVariant;
    this.imageConfig = {
        types: ['small'],
        quantity: 'single'
    };
    this.quantity = quantity;
    this.attributeConfig = 'selected';
    this.initialize(lineItem);
}

ProductLineItem.prototype = ProductBase;

ProductLineItem.prototype.initialize = function (lineItem) {
    this.prototype.initialize.call(this);
    this.quantityOptions = getMinMaxQuantityOptions(this.product, this.quantity);
    this.priceTotal = formatMoney(money(
        lineItem.adjustedPrice.value,
        lineItem.adjustedPrice.currencyCode
    ));
    this.isBonusProductLineItem = lineItem.bonusProductLineItem;
    this.isGift = lineItem.gift;
    this.UUID = lineItem.UUID;
    this.isOrderable = this.product.availabilityModel.isOrderable(this.quantity);
};

/**
 * @constructor
 * @class
 * @param {dw.catalog.Product} product -
 * @param {Object} productVariables - empty array or object? not sure yet
 */
function ProductWrapper(lineItem, productVariables, quantity) {
    var productLineItem = new ProductLineItem(
        lineItem.product,
        productVariables,
        quantity,
        lineItem
    );
    var items = ['id', 'productName', 'price', 'productType', 'images', 'rating', 'attributes',
        'quantityOptions', 'priceTotal', 'isBonusProductLineItem', 'isGift', 'UUID', 'quantity',
        'isOrderable'];
    items.forEach(function (item) {
        this[item] = productLineItem[item];
    }, this);
}

module.exports = ProductWrapper;
module.exports.getProductType = productBase.getProductType;
module.exports.getVariationModel = productBase.getVariationModel;
