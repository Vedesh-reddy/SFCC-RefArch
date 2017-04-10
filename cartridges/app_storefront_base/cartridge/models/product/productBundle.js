'use strict';

var ProductBase = require('./productBase').productBase;
var helper = require('../../scripts/dwHelpers');

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
 * Returns the products in the bundle
 *
 * @param {dw.util.Collection} bundledProducts - Collection of products in the bundle
 * @param {Object} productFactory - product factory utilitiy to get product model based on
 *                                  product type
 * @returns {Array} Array of products in a bundle
 */
function getBundledProducts(bundledProducts, productFactory) {
    var products = helper.map(bundledProducts, function (bundledProduct) {
        return productFactory.get({ pid: bundledProduct.ID });
    });
    return products;
}

/**
 * @constructor
 * @classdesc Bundle product class
 * @param {dw.catalog.Product} product - Product instance returned from the API
 * @param {number} quantity - quantity of products selected
 * @param {dw.util.Collection.<dw.campaign.Promotion>} promotions - Promotions that apply to this
 *                                                                 product
 * @param {Object} productFactory - Factory utility that returns a ProductModel instance
 */
function ProductBundle(product, quantity, promotions, productFactory) {
    this.bundledProducts = getBundledProducts(product.bundledProducts, productFactory);
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

ProductBundle.prototype = Object.create(ProductBase.prototype);

ProductBundle.prototype.initialize = function () {
    ProductBase.prototype.initialize.call(this);
    this.available = isAvailable(this.quantity, this.product);
    this.online = this.product.online;
    this.searchable = this.product.searchable;
    this.minOrderQuantity = this.product.minOrderQuantity.value || 1;
    this.maxOrderQuantity = DEFAULT_MAX_ORDER_QUANTITY;
    this.readyToOrder = true;
};

/**
 * @constructor
 * @classdesc Bundle product class.
 * @param {dw.catalog.Product} product - Product instance returned from the API
 * @param {number} quantity - quantity of products selected
 * @param {dw.util.Collection.<dw.campaign.Promotion>} promotions - Promotions that apply to this
 * @param {Object} productFactory - Factory utility that returns a ProductModel instance
 */
function ProductWrapper(product, quantity, promotions, productFactory) {
    var productBundle = new ProductBundle(
        product,
        quantity,
        promotions,
        productFactory
    );
    var items = ['id', 'productName', 'price', 'productType', 'images', 'rating', 'bundledProducts',
        'available', 'online', 'searchable', 'minOrderQuantity', 'maxOrderQuantity', 'readyToOrder',
        'promotions'];
    items.forEach(function (item) {
        this[item] = productBundle[item];
    }, this);
}

module.exports = ProductWrapper;
