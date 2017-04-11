'use strict';

var ProductSetBase = require('./productSetBase').productSetBase;

var DEFAULT_MAX_ORDER_QUANTITY = 9;

/**
 * Determines whether a product is available
 *
 * @param {string} quantity - Quantity value to check against product availability
 * @param {dw.catalog.Product} product - Product instance returned from the API
 * @returns {boolean} - True if available, False if not
 */
function isAvailable(quantity, product) {
    var availabilityModel = product.availabilityModel;
    var currentQuantity = parseFloat(quantity) || 1;

    return availabilityModel.isOrderable(currentQuantity);
}

/**
 * @constructor
 * @classdesc Set product class
 * @param {dw.catalog.Product} product - Product instance returned from the API
 * @param {number} quantity - quantity of products selected
 * @param {dw.util.Collection.<dw.campaign.Promotion>} promotions - Promotions that apply to this
 *                                                                 product
 * @param {Object} productFactory - Factory utility that returns a ProductModel instance
 */
function ProductSet(product, quantity, promotions, productFactory) {
    this.productFactory = productFactory;
    this.product = product;
    this.imageConfig = {
        types: ['large', 'small'],
        quantity: 'all'
    };
    this.quantity = quantity;
    this.useSimplePrice = false;
    this.apiPromotions = promotions;
    this.initialize();
}

ProductSet.prototype = Object.create(ProductSetBase.prototype);

ProductSet.prototype.initialize = function () {
    ProductSetBase.prototype.initialize.call(this);
    this.available = isAvailable(this.quantity, this.product);
    this.online = this.product.online;
    this.searchable = this.product.searchable;
    this.minOrderQuantity = this.product.minOrderQuantity.value || 1;
    this.maxOrderQuantity = DEFAULT_MAX_ORDER_QUANTITY;
    this.readyToOrder = true;
};

/**
 * @constructor
 * @classdesc Set product class.
 * @param {dw.catalog.Product} product - Product instance returned from the API
 * @param {number} quantity - quantity of products selected
 * @param {dw.util.Collection.<dw.campaign.Promotion>} promotions - Promotions that apply to this
 * @param {Object} productFactory - Factory utility that returns a ProductModel instance
 */
function ProductWrapper(product, quantity, promotions, productFactory) {
    var productSet = new ProductSet(
        product,
        quantity,
        promotions,
        productFactory
    );
    var items = ['id', 'productName', 'price', 'productType', 'images', 'rating',
        'individualProducts', 'available', 'online', 'searchable', 'minOrderQuantity',
        'maxOrderQuantity', 'readyToOrder', 'promotions'];
    items.forEach(function (item) {
        this[item] = productSet[item];
    }, this);
}

module.exports = ProductWrapper;
