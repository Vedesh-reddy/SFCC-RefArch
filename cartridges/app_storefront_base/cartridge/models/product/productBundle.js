'use strict';

var ProductBase = require('*/cartridge/models/product/productBase').productBase;
var collections = require('*/cartridge/scripts/util/collections');

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
 * Determines whether bundle is ready to order
 *
 * @param {Object[]} bundledProducts - List of products that comprise this bundle
 * @return {boolean} - Whether bundle is ready to order
 */
function isReadyToOrder(bundledProducts) {
    return !bundledProducts.some(function (product) {
        return !(product.available && product.readyToOrder);
    });
}

/**
 * Returns the products in the bundle
 *
 * @param {dw.catalog.Product} apiBundle - Bundle product object
 * @param {dw.util.Collection} bundledProducts - Collection of products in the bundle
 * @param {Object} productFactory - product factory utilitiy to get product model based on
 *                                  product type
 * @returns {Array} Array of products in a bundle
 */
function getBundledProducts(apiBundle, bundledProducts, productFactory) {
    return collections.map(bundledProducts, function (bundledProduct) {
        return productFactory.get({
            pid: bundledProduct.ID,
            quantity: apiBundle.getBundledProductQuantity(bundledProduct).value
        });
    });
}

/**
 * Compile quantity meta for pull-down menu selection
 *
 * @param {number} minOrderQty - Minimum order quantity
 * @param {number} stepQuantity - Quantity increment from one value to the next
 * @param {number} size - Number of quantity values to include in drop-down menu
 * @return {Array} - Quantity options for PDP pull-down menu
 */
function getQuantities(minOrderQty, stepQuantity, size) {
    var listSize = size || DEFAULT_MAX_ORDER_QUANTITY;
    var quantities = [];
    var value;
    var valueString;
    for (var i = 1; i < listSize + 1; i++) {
        value = minOrderQty * i * stepQuantity;
        valueString = value.toString();
        quantities.push({ value: valueString });
    }
    return quantities;
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
    this.bundledProducts = getBundledProducts(product, product.bundledProducts, productFactory);
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
    this.readyToOrder = isReadyToOrder(this.bundledProducts);
    this.longDescription = this.product.longDescription;
    this.shortDescription = this.product.shortDescription;
    this.quantities = getQuantities(
        this.product.minOrderQuantity.value,
        this.product.stepQuantity.value,
        this.maxOrderQuantity
    );
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
        'available', 'availability', 'online', 'searchable', 'minOrderQuantity', 'maxOrderQuantity',
        'readyToOrder', 'promotions', 'longDescription', 'shortDescription', 'quantities'];
    items.forEach(function (item) {
        this[item] = productBundle[item];
    }, this);
}

module.exports = ProductWrapper;
