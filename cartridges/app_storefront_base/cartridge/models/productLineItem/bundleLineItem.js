'use strict';

var ProductLineItem = require('./productLineItem').productLineItem;
var helper = require('~/cartridge/scripts/dwHelpers');

/**
 * creates an array of bundled line items
 * @param {dw.util.Collection} bundledProductLineItems - Collection of products in the bundle
 * @param {Object} productFactory - Factory utility that returns a ProductModel instance
 * @returns {Array} an array of bundled line items
 */
function getBundledProductLineItems(bundledProductLineItems, productFactory) {
    var bundledLineItems = helper.map(bundledProductLineItems, function (bundledProductLineItem) {
        return productFactory.get({
            pid: bundledProductLineItem.product.ID,
            pview: 'productLineItem',
            lineItem: bundledProductLineItem,
            quantity: bundledProductLineItem.quantity.value,
            variables: null
        });
    });
    return bundledLineItems;
}

/**
 * @constructor
 * @classdesc A product model that represents a single product in the cart.
 *
 * @param {dw.catalog.Product} product - Product instance from the line item
 * @param {number} quantity - The quantity of this product line item currently in the baskets
 * @param {dw.order.ProductLineItem} lineItem - API ProductLineItem instance
 * @param {dw.util.Collection.<dw.campaign.Promotion>} promotions - a collection of promotions
 * @param {Object} productFactory - Factory utility that returns a ProductModel instance
 */
function BundleLineItem(product, quantity, lineItem, promotions, productFactory) {
    this.product = product || {};
    this.imageConfig = {
        types: ['small'],
        quantity: 'single'
    };
    this.quantity = quantity;
    this.useSimplePrice = false;
    this.apiPromotions = promotions;
    this.lineItem = lineItem;
    this.initialize(productFactory);
}

BundleLineItem.prototype = Object.create(ProductLineItem.prototype);

BundleLineItem.prototype.initialize = function (productFactory) {
    ProductLineItem.prototype.initialize.call(this);
    this.bundledProductLineItems = getBundledProductLineItems(
        this.lineItem.bundledProductLineItems,
        productFactory
    );
};

/**
 * @constructor
 * @classdesc Wrapper around BundleLineItem model
 *
 * @param {dw.catalog.Product} product - The Product instance from the line item
 * @param {number} quantity - The quantity of this product line item currently in the baskets
 * @param {dw.order.ProductLineItem} lineItem - API ProductLineItem instance
 * @param {dw.util.Collection.<dw.campaign.Promotion>} promotions - a collection of promotions
 * @param {Object} productFactory - Factory utility that returns a ProductModel instance
 */
function BundleLineItemWrapper(product, quantity, lineItem, promotions, productFactory) {
    var bundleLineItem = new BundleLineItem(
        product,
        quantity,
        lineItem,
        promotions,
        productFactory
    );
    var items = ['id', 'productName', 'price', 'productType', 'images', 'rating',
        'variationAttributes', 'quantityOptions', 'priceTotal', 'isBonusProductLineItem', 'isGift',
        'UUID', 'quantity', 'isOrderable', 'promotions', 'appliedPromotions', 'renderedPromotions',
        'attributes', 'availability', 'bundledProductLineItems'];
    items.forEach(function (item) {
        this[item] = bundleLineItem[item];
    }, this);
}

module.exports = BundleLineItemWrapper;
