'use strict';

var base = require('./productBase');
var ProductBase = base.productBase;
var URLUtils = require('dw/web/URLUtils');
var productHelper = require('*/cartridge/scripts/helpers/productHelpers');
var urlHelper = require('*/cartridge/scripts/helpers/urlHelpers');

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
 * @param {dw.catalog.ProductOptionModel} optionModel - The product's option model
 * @param {string} endPoint - the endpoint to use when generating urls for product attributes
 * @param {string} id - the current product's id
 * @param {number} quantity - quantity to purchase
 * @returns {string} a url of the product's selected attributes
 */
function getUrl(variationModel, optionModel, endPoint, id, quantity) {
    var params = ['quantity=' + quantity];
    var action = endPoint || 'Product-Show';
    var optionsQueryParams = productHelper.getSelectedOptionsUrl(optionModel).split('?')[1];
    var url = variationModel ? variationModel.url(action) : URLUtils.url(action, 'pid', id);

    if (optionsQueryParams) {
        optionsQueryParams.split('&').forEach(function (keyValue) {
            params.push(keyValue);
        });
    }

    return urlHelper.appendQueryParams(url.relative().toString(), params);
}

/**
 * @typedef {Object} ProductOptions
 *
 * @property {string} id - Product option ID
 * @property {string} name - Product option name
 * @property {string} htmlName - HTML representation of product option name
 * @property {ProductOptionValues} values - A product option's values
 * @property {string} selectedValueId - Selected option value ID
 */

/**
 * Compile quantity meta for pull-down menu selection
 *
 * @param {number} minOrderQty - Minimum order quantity
 * @param {number} stepQuantity - Quantity increment from one value to the next
 * @param {string} selectedQty - Quanity selected
 * @param {string} pid - Product ID
 * @param {number} size - Number of quantity values to include in drop-down menu
 * @param {Object} attributes - Variation attribute query params
 * @param {ProductOptions[]} options - Product options query params
 * @return {Array} - Quantity options for PDP pull-down menu
 */
function getQuantities(minOrderQty, stepQuantity, selectedQty, pid, size, attributes, options) {
    var listSize = (typeof size === 'number' && size > 0) ? size : DEFAULT_MAX_ORDER_QUANTITY;
    var quantities = [];
    var compareQty = parseInt(selectedQty, 10) || minOrderQty;
    var endpoint = 'Product-Variation';
    var baseUrl = URLUtils.url(endpoint, 'pid', pid).relative().toString();
    var params = {
        options: options || [],
        variables: attributes || {}
    };
    var value;
    var valueString;
    var url;
    for (var i = 1; i < listSize + 1; i++) {
        value = minOrderQty * i * stepQuantity;
        valueString = value.toString();
        params.quantity = valueString;
        url = urlHelper.appendQueryParams(baseUrl, params);
        quantities.push({
            value: valueString,
            selected: value === compareQty,
            url: url
        });
    }
    return quantities;
}

/**
 * @typedef SelectedOption
 * @type Object
 * @property {string} optionId - Product option ID
 * @property {string} productId - Product ID
 * @property {string} selectedValueId - Selected product option value ID
 */

/**
 * @constructor
 * @classdesc Base product class. Used for product tiles
 * @param {dw.catalog.Product} product - Product instance returned from the API
 * @param {Object} productVariables - variables passed in the query string to
 *                                    target product variation group
 * @param {number} quantity - quantity of products selected
 * @param {dw.util.Collection.<dw.campaign.Promotion>} promotions - Promotions that apply to this
 *                                                                  product
 * @param {SelectedOption[]} selectedOptions - Dictionary object of selected options
 */
function FullProduct(product, productVariables, quantity, promotions, selectedOptions) {
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
    this.quantity = quantity || this.product.minOrderQuantity.value;
    this.productVariables = productVariables;
    this.selectedOptions = selectedOptions;
    this.variationAttributeConfig = {
        attributes: '*',
        endPoint: 'Variation'
    };
    this.useSimplePrice = false;
    this.apiPromotions = promotions;
    this.currentOptionModel = productHelper.getCurrentOptionModel(
        this.product.optionModel,
        this.selectedOptions
    );
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
    this.readyToOrder = this.variationModel ? hasRequiredAttrsSelected(this.variationModel) : true;
    this.selectedQuantity = this.quantity ? parseInt(this.quantity, 10) : this.minOrderQuantity;
    this.selectedProductUrl = getUrl(
        this.variationModel,
        this.currentOptionModel,
        'Product-Show',
        this.id,
        this.selectedQuantity
    );

    var queryParams = {
        variables: this.productVariables,
        quantity: this.quantity
    };
    this.options = productHelper.getOptions(this.currentOptionModel, queryParams);

    this.quantities = getQuantities(
        this.product.minOrderQuantity.value,
        this.product.stepQuantity.value,
        this.quantity,
        this.product.ID,
        this.maxOrderQuantity,
        this.productVariables,
        this.selectedOptions
    );

    Object.defineProperty(this, 'raw', {
        enumerable: false,
        configurable: false,
        writable: false,
        value: this.product
    });
};

/**
 * @constructor
 * @classdesc Base product class. Used for product tiles
 * @param {dw.catalog.Product} product - Product instance returned from the API
 * @param {Object} productVariables - variables passed in the query string to
 *                                    target product variation group
 * @param {number} quantity - quantity of products selected
 * @param {dw.util.Collection.<dw.campaign.Promotion>} promotions - Promotions that apply to this
 * @param {SelectedOption[]} selectedOptions - Dictionary object of selected options
 */
function ProductWrapper(product, productVariables, quantity, promotions, selectedOptions) {
    var fullProduct = new FullProduct(product, productVariables, quantity, promotions,
        selectedOptions);
    var items = ['id', 'productName', 'price', 'productType', 'images', 'rating',
        'variationAttributes', 'available', 'shortDescription', 'longDescription', 'online',
        'searchable', 'minOrderQuantity', 'maxOrderQuantity', 'readyToOrder', 'promotions',
        'attributes', 'availability', 'selectedProductUrl',
        'selectedQuantity', 'options', 'quantities', 'raw'];
    items.forEach(function (item) {
        this[item] = fullProduct[item];
    }, this);
}

module.exports = ProductWrapper;
module.exports.getProductType = base.getProductType;
module.exports.getVariationModel = base.getVariationModel;
