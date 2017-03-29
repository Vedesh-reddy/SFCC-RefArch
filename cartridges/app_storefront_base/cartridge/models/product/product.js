'use strict';

var ProductBase = require('./productBase').productBase;
var productBase = require('./productBase');

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
 * Determine whether all required attributes have been selected.  Value is used as one criteria as
 *     to whether the product can be added to the customer's cart
 * @param {dw.catalog.ProductVariationModel} variationModel - The product's variation model
 * @returns {boolean} Flag that specifies if the product is ready to order
 */
function hasRequiredAttrsSelected(variationModel) {
    return !!variationModel.selectedVariant;
}

/**
 * @constructor
 * @classdesc Base product class. Used for product tiles
 * @param {dw.catalog.Product} product - Product instance returned from the API
 * @param {Object} productVariables - variables passed in the query string to
 *                                    target product variation group
 * @param {number} quantity - quantity of products selected
 * @param {dw.util.Collection.<dw.campaign.Promotion>} promotions - Promotions that apply to this
 *                                                                 product
 */
function FullProduct(product, productVariables, quantity, promotions) {
    this.variationModel = this.getVariationModel(product, productVariables);
    if (this.variationModel) {
        this.product = this.variationModel.selectedVariant || product;
    } else {
        this.product = product;
    }
    this.imageConfig = {
        types: ['large', 'small'],
        quantity: 'all'
    };
    this.selectedQuantity = quantity;
    this.productVariables = productVariables;
    this.attributeConfig = {
        attributes: '*',
        endPoint: 'Variation'
    };
    this.useSimplePrice = false;
    this.apiPromotions = promotions;
    this.initialize();
}

FullProduct.prototype = Object.create(ProductBase.prototype);

FullProduct.prototype.initialize = function () {
    ProductBase.prototype.initialize.call(this);
    this.available = isAvailable(this.quantity, this.product);
    this.shortDescription = this.product.shortDescription.markup;
    this.longDescription = this.product.longDescription ? this.product.longDescription.markup : '';
    this.online = this.product.online;
    this.searchable = this.product.searchable;
    this.minOrderQuantity = this.product.minOrderQuantity.value || 1;
    this.maxOrderQuantity = DEFAULT_MAX_ORDER_QUANTITY;
    this.readyToOrder = this.variationModel
        ? hasRequiredAttrsSelected(this.variationModel)
        : true;
};

/**
 * @constructor
 * @classdesc Base product class. Used for product tiles
 * @param {dw.catalog.Product} product - Product instance returned from the API
 * @param {Object} productVariables - variables passed in the query string to
 *                                    target product variation group
 * @param {number} quantity - quantity of products selected
 * @param {dw.util.Collection.<dw.campaign.Promotion>} promotions - Promotions that apply to this
 */
function ProductWrapper(product, productVariables, quantity, promotions) {
    var fullProduct = new FullProduct(product, productVariables, quantity, promotions);
    var items = ['id', 'productName', 'price', 'productType', 'images', 'rating',
        'variationAttributes', 'available', 'shortDescription', 'longDescription', 'online',
        'searchable', 'minOrderQuantity', 'maxOrderQuantity', 'readyToOrder', 'promotions',
        'attributes'];
    items.forEach(function (item) {
        this[item] = fullProduct[item];
    }, this);
}

module.exports = ProductWrapper;
module.exports.getProductType = productBase.getProductType;
module.exports.getVariationModel = productBase.getVariationModel;
