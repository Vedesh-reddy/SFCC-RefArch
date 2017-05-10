'use strict';

var base = require('./productBase');
var ProductBase = base.productBase;
var URLUtils = require('dw/web/URLUtils');

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
 * creates a url of the product's selected attributes
 * @param {dw.catalog.ProductVariationModel} variationModel - The product's variation model
 * @param {Array} allAttributes - a list of the product's available attributes
 * @param {string} endPoint - the endpoint to use when generating urls for product attributes
 * @param {string} id - the current product's id
 * @returns {string} a url of the product's selected attributes
 */
function getUrl(variationModel, allAttributes, endPoint, id) {
    var params = {};
    var url;

    if (allAttributes && variationModel) {
        allAttributes.forEach(function (attribute) {
            attribute.values.forEach(function (value) {
                if (value.selected) {
                    params[attribute.id] = attribute.value;
                }
            });
        });

        url = variationModel.url('Product-' + endPoint, params).relative().toString();
    } else {
        url = URLUtils.url('Product-' + endPoint, 'pid', id).relative().toString();
    }

    return url;
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
    this.quantity = quantity;
    this.productVariables = productVariables;
    this.variationAttributeConfig = {
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
    this.shortDescription = this.product.shortDescription
        ? this.product.shortDescription.markup
        : null;
    this.longDescription = this.product.longDescription
        ? this.product.longDescription.markup
        : null;
    this.online = this.product.online;
    this.searchable = this.product.searchable;
    this.minOrderQuantity = this.product.minOrderQuantity.value || 1;
    this.maxOrderQuantity = DEFAULT_MAX_ORDER_QUANTITY;
    this.readyToOrder = this.variationModel
        ? hasRequiredAttrsSelected(this.variationModel)
        : true;
    this.selectedVariantUrl = getUrl(
        this.variationModel,
        this.variationAttributes,
        this.variationAttributeConfig.endPoint,
        this.id
    );
    this.selectedProductUrl = getUrl(
        this.variationModel,
        this.variationAttributes,
        'Show',
        this.id
    );
    this.selectedQuantity = this.quantity ? parseInt(this.quantity, 10) : this.minOrderQuantity;
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
        'attributes', 'availability', 'selectedVariantUrl', 'selectedProductUrl',
        'selectedQuantity'];
    items.forEach(function (item) {
        this[item] = fullProduct[item];
    }, this);
}

module.exports = ProductWrapper;
module.exports.getProductType = base.getProductType;
module.exports.getVariationModel = base.getVariationModel;
