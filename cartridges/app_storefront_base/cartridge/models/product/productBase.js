'use strict';

var collections = require('*/cartridge/scripts/util/collections');
var productHelper = require('*/cartridge/scripts/helpers/productHelpers');
var VariationAttributesModel = require('./productAttributes');
var ImageModel = require('./productImages');
var priceFactory = require('../../scripts/factories/price');
var Resource = require('dw/web/Resource');

/**
 * Return type of the current product
 * @param  {dw.catalog.ProductVariationModel} product - Current product
 * @return {string} type of the current product
 */
function getProductType(product) {
    var result;
    if (product.master) {
        result = 'master';
    } else if (product.variant) {
        result = 'variant';
    } else if (product.variationGroup) {
        result = 'variationGroup';
    } else if (product.productSet) {
        result = 'set';
    } else if (product.bundle) {
        result = 'bundle';
    } else if (product.optionProduct) {
        result = 'optionProduct';
    } else {
        result = 'standard';
    }
    return result;
}

/**
 * Get fake rating for a product
 * @param  {string} id - Id of the product
 * @return {number} number of stars for a given product id rounded to .5
 */
function getRating(id) {
    var sum = id.split('').reduce(function (total, letter) {
        return total + letter.charCodeAt(0);
    }, 0);

    return Math.ceil((sum % 5) * 2) / 2;
}

/**
 * @typedef Promotion
 * @type Object
 * @property {string} calloutMsg - Promotion callout message
 * @property {boolean} enabled - Whether Promotion is enabled
 * @property {string} id - Promotion ID
 * @property {string} name - Promotion name
 * @property {string} promotionClass - Type of Promotion (Product, Shipping, or Order)
 * @property {number|null} rank - Promotion rank for sorting purposes
 */

/**
 * Retrieve Promotions that applies to thisProduct
 *
 * @param {dw.util.Collection.<dw.campaign.Promotion>} promotions - Promotions that apply to this
 *                                                                 product
 * @return {Promotion} - JSON representation of Promotion instance
 */
function getPromotions(promotions) {
    return collections.map(promotions, function (promotion) {
        return {
            calloutMsg: promotion.calloutMsg ? promotion.calloutMsg.markup : null,
            details: promotion.details ? promotion.details.markup : null,
            enabled: promotion.enabled,
            id: promotion.ID,
            name: promotion.name,
            promotionClass: promotion.promotionClass,
            rank: promotion.rank
        };
    });
}

/**
 * Normalize product and return Product variation model
 * @param  {dw.catalog.Product} product - Product instance returned from the API
 * @param  {Object} productVariables - variables passed in the query string to
 *                                     target product variation group
 * @return {dw.catalog.ProductVarationModel} Normalized variation model
 */
function getVariationModel(product, productVariables) {
    var variationModel = product.variationModel;
    if (!variationModel.master && !variationModel.selectedVariant) {
        variationModel = null;
    } else if (productVariables) {
        var variationAttrs = variationModel.productVariationAttributes;
        Object.keys(productVariables).forEach(function (attr) {
            if (attr && productVariables[attr].value) {
                var dwAttr = collections.find(variationAttrs,
                    function (item) { return item.ID === attr; });
                var dwAttrValue = collections.find(variationModel.getAllValues(dwAttr),
                    function (item) { return item.value === productVariables[attr].value; });

                if (dwAttr && dwAttrValue) {
                    variationModel.setSelectedAttributeValue(dwAttr.ID, dwAttrValue.ID);
                }
            }
        });
    }
    return variationModel;
}

/**
 * Creates an object of the visible attributes for a product
 * @param {dw.catalog.Product|dw.catalog.Variant} product - Product instance returned from the API
 * @return {Object|null} an object containing the visible attributes for a product.
 */
function getAttributes(product) {
    var attributes;
    var attributeModel = product.attributeModel;
    var visibleAttributeGroups = attributeModel.visibleAttributeGroups;

    if (visibleAttributeGroups.getLength() > 0) {
        attributes = collections.map(attributeModel.visibleAttributeGroups, function (group) {
            var visibleAttributeDef = attributeModel.getVisibleAttributeDefinitions(group);
            var attributeResult = {};

            attributeResult.ID = group.ID;
            attributeResult.name = group.displayName;
            attributeResult.attributes = collections.map(
                visibleAttributeDef,
                function (definition) {
                    var definitionResult = {};
                    definitionResult.label = definition.displayName;

                    if (definition.multiValueType) {
                        definitionResult.value = attributeModel.getDisplayValue(definition).map(
                            function (item) {
                                return item;
                            });
                    } else {
                        definitionResult.value = [attributeModel.getDisplayValue(definition)];
                    }

                    return definitionResult;
                }
            );

            return attributeResult;
        });
    } else {
        attributes = null;
    }

    return attributes;
}

/**
 * Creates an object containing an array of availability messages and an in stock date
 * @param {number} quantity - quantity of products selected
 * @param {dw.catalog.Product} product - Product instance returned from the API
 * @return {Object} an object containing the product availability.
 */
function getProductAvailability(quantity, product) {
    var availability = {};
    availability.messages = [];
    var productQuantity = quantity ? parseInt(quantity, 10) : product.minOrderQuantity.value;
    var availabilityModel = product.availabilityModel;
    var availabilityModelLevels = availabilityModel.getAvailabilityLevels(productQuantity);
    var inventoryRecord = availabilityModel.inventoryRecord;

    if (inventoryRecord && inventoryRecord.inStockDate) {
        availability.inStockDate = inventoryRecord.inStockDate.toDateString();
    } else {
        availability.inStockDate = null;
    }

    if (availabilityModelLevels.inStock.value > 0) {
        if (availabilityModelLevels.inStock.value === productQuantity) {
            availability.messages.push(Resource.msg('label.instock', 'common', null));
        } else {
            availability.messages.push(
                Resource.msgf(
                    'label.quantity.in.stock',
                    'common',
                    null,
                    availabilityModelLevels.inStock.value
                )
            );
        }
    }

    if (availabilityModelLevels.preorder.value > 0) {
        if (availabilityModelLevels.preorder.value === productQuantity) {
            availability.messages.push(Resource.msg('label.preorder', 'common', null));
        } else {
            availability.messages.push(
                Resource.msgf(
                    'label.preorder.items',
                    'common',
                    null,
                    availabilityModelLevels.preorder.value
                )
            );
        }
    }

    if (availabilityModelLevels.backorder.value > 0) {
        if (availabilityModelLevels.backorder.value === productQuantity) {
            availability.messages.push(Resource.msg('label.back.order', 'common', null));
        } else {
            availability.messages.push(
                Resource.msgf(
                    'label.back.order.items',
                    'common',
                    null,
                    availabilityModelLevels.backorder.value
                )
            );
        }
    }

    if (availabilityModelLevels.notAvailable.value > 0) {
        if (availabilityModelLevels.notAvailable.value === productQuantity) {
            availability.messages.push(Resource.msg('label.not.available', 'common', null));
        } else {
            availability.messages.push(Resource.msg('label.not.available.items', 'common', null));
        }
    }

    return availability;
}

/**
 * @constructor
 * @classdesc Base product class. Used for product tiles
 * @param {dw.catalog.Product} product - Product instance returned from the API
 * @param {Object} productVariables - variables passed in the query string to
 *                                    target product variation group
 * @param {number} quantity - Integer quantity of products selected
 * @param {dw.util.Collection.<dw.campaign.Promotion>} promotions - Promotions that apply to this
 *                                                                 product
 */
function ProductBase(product, productVariables, quantity, promotions) {
    this.variationModel = this.getVariationModel(product, productVariables);
    if (this.variationModel) {
        this.product = this.variationModel.selectedVariant || product;
    } else {
        this.product = product;
    }
    this.imageConfig = {
        types: ['medium'],
        quantity: 'single'
    };
    this.quantity = quantity || this.product.minOrderQuantity.value;

    this.variationAttributeConfig = {
        attributes: ['color'],
        endPoint: 'Show'
    };
    this.useSimplePrice = true;
    this.apiPromotions = promotions;
    this.initialize();
}

ProductBase.prototype = {
    initialize: function () {
        this.id = this.product.ID;
        this.productName = this.product.name;
        this.currentOptionModel = this.currentOptionModel || this.product.optionModel;
        this.price = priceFactory.getPrice(this.product, null, this.useSimplePrice,
            this.apiPromotions, this.currentOptionModel);
        this.productType = getProductType(this.product);
        this.images = this.variationModel
            ? new ImageModel(this.variationModel, this.imageConfig)
            : new ImageModel(this.product, this.imageConfig);
        this.rating = getRating(this.id);
        var selectedOptionsQueryParams = productHelper.getSelectedOptionsUrl(
            this.currentOptionModel);
        this.variationAttributes = this.variationModel
            ? (new VariationAttributesModel(
                this.variationModel,
                this.variationAttributeConfig,
                selectedOptionsQueryParams,
                this.quantity)).slice(0)
            : null;
        this.promotions = this.apiPromotions ? getPromotions(this.apiPromotions) : null;
        this.attributes = getAttributes(this.product);
        this.availability = getProductAvailability(this.quantity, this.product);
    },
    /**
     * Normalize product and return Product variation model
     * @param  {dw.catalog.Product} product - Product instance returned from the API
     * @param  {Object} productVariables - variables passed in the query string to
     *                                     target product variation group
     * @return {dw.catalog.ProductVarationModel} Normalized variation model
     */
    getVariationModel: function (product, productVariables) {
        return getVariationModel(product, productVariables);
    }
};

/**
 * @constructor
 * @classdesc Base product class. Used for product tiles
 * @param {dw.catalog.Product} product - Product instance returned from the API
 * @param {Object} productVariables - variables passed in the query string to
 *                                    target product variation group
 * @param {dw.util.Collection.<dw.campaign.Promotion>} promotions - Collection of applicable
 *                                                                  Promotions
 */
function ProductWrapper(product, productVariables, promotions) {
    var productBase = new ProductBase(product, productVariables, null, promotions);
    var items = [
        'id',
        'productName',
        'price',
        'productType',
        'images',
        'rating',
        'variationAttributes',
        'promotions',
        'attributes',
        'availability'
    ];

    items.forEach(function (item) {
        this[item] = productBase[item];
    }, this);
}

module.exports = ProductWrapper;
module.exports.productBase = ProductBase;
module.exports.getProductType = getProductType;
module.exports.getVariationModel = getVariationModel;
module.exports.getProductAvailability = getProductAvailability;
