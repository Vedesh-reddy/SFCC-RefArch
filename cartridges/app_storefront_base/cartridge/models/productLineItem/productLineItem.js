'use strict';

var formatMoney = require('dw/util/StringUtils').formatMoney;
var ProductBase = require('./../product/productBase').productBase;
var renderTemplateHelper = require('~/cartridge/scripts/renderTemplateHelper');
var helper = require('~/cartridge/scripts/dwHelpers');

/**
 * get the min and max numbers to display in the quantity drop down.
 * @param {Object} product - a line item of the basket.
 * @param {number} quantity - number of items for this product
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
 * get the total price for the product line item
 * @param {dw.order.ProductLineItem} lineItem - API ProductLineItem instance
 * @returns {Object} an object containing the product line item total info.
 */
function getTotalPrice(lineItem) {
    var context;
    var result = {};
    var template = 'checkout/productCard/productCardProductRenderedTotalPrice';

    if (lineItem.priceAdjustments.getLength() > 0) {
        result.nonAdjustedPrice = formatMoney(lineItem.getPrice());
    }

    result.price = formatMoney(lineItem.adjustedPrice);
    context = { lineItem: { priceTotal: result } };

    result.renderedPrice = renderTemplateHelper.getRenderedHtml(context, template);

    return result;
}

/**
 * get the promotions applied to the product line item
 * @param {dw.order.ProductLineItem} lineItem - API ProductLineItem instance
 * @returns {Object[]|undefined} an array of objects containing the promotions applied to the
 *                               product line item.
 */
function getAppliedPromotions(lineItem) {
    var priceAdjustments;

    if (lineItem.priceAdjustments.getLength() > 0) {
        priceAdjustments = helper.map(lineItem.priceAdjustments, function (priceAdjustment) {
            return {
                callOutMsg: priceAdjustment.promotion.calloutMsg ?
                    priceAdjustment.promotion.calloutMsg.markup : null,
                name: priceAdjustment.promotion.name,
                details: priceAdjustment.promotion.details ?
                    priceAdjustment.promotion.details.markup : null
            };
        });
    }

    return priceAdjustments;
}

/**
 * get the rendered applied promotions
 * @param {Object[]} appliedPromotions - an array of objects containing the product line items
 *                                    applied promotions
 * @returns {string} the rendered html for the applied promotions
 */
function getRenderedPromotions(appliedPromotions) {
    var context;
    var result = '';
    var template = 'checkout/productCard/productCardProductRenderedPromotions';

    if (appliedPromotions) {
        context = { lineItem: { appliedPromotions: appliedPromotions } };
        result = renderTemplateHelper.getRenderedHtml(context, template);
    }

    return result;
}

/**
 * @constructor
 * @classdesc A product model that represents a single product in the cart.
 *
 * @param {dw.catalog.Product} product - Product instance from the line item
 * @param {Array} productVariables - empty array
 * @param {number} quantity - The quantity of this product line item currently in the baskets
 * @param {dw.order.ProductLineItem} lineItem - API ProductLineItem instance
 * @param {dw.util.Collection.<dw.campaign.Promotion>} promotions - a collection of promotions
 */
function ProductLineItem(product, productVariables, quantity, lineItem, promotions) {
    var safeProduct = product || {};

    this.variationModel = this.getVariationModel(safeProduct, productVariables);
    this.product = this.variationModel && this.variationModel.selectedVariant ?
        this.variationModel.selectedVariant : safeProduct;
    this.imageConfig = {
        types: ['small'],
        quantity: 'single'
    };
    this.quantity = quantity;

    this.variationAttributeConfig = {
        attributes: 'selected'
    };
    this.useSimplePrice = false;
    this.apiPromotions = promotions;
    this.lineItem = lineItem;
    this.initialize();
}

ProductLineItem.prototype = Object.create(ProductBase.prototype);

ProductLineItem.prototype.initialize = function () {
    ProductBase.prototype.initialize.call(this);
    this.quantityOptions = getMinMaxQuantityOptions(this.product, this.quantity);
    this.priceTotal = getTotalPrice(this.lineItem);
    this.isBonusProductLineItem = this.lineItem.bonusProductLineItem;
    this.isGift = this.lineItem.gift;
    this.UUID = this.lineItem.UUID;
    this.shipmentUUID = this.lineItem.shipment.UUID;
    this.isOrderable = this.product.availabilityModel.isOrderable(this.quantity);

    // TODO: Pull out this constant to top
    this.isAvailableForInStorePickup = (this.product.custom
        && Object.prototype.hasOwnProperty.call(this.product.custom, 'isAvailableForInStorePickup')
        && !!this.product.custom.isAvailableForInStorePickup);
    this.isInStorePickup = (this.lineItem.custom
        && Object.prototype.hasOwnProperty.call(this.lineItem.custom, 'fromStoreId')
        && !!this.lineItem.custom.fromStoreId);

    this.appliedPromotions = getAppliedPromotions(this.lineItem);
    this.renderedPromotions = getRenderedPromotions(this.appliedPromotions);
};

/**
 * @constructor
 * @classdesc Wrapper around productLineItem model
 *
 * @param {dw.catalog.Product} product - The Product instance from the line item
 * @param {Array} productVariables - Empty array
 * @param {number} quantity - The quantity of this product line item currently in the baskets
 * @param {dw.order.ProductLineItem} lineItem - API ProductLineItem instance
 * @param {dw.util.Collection.<dw.campaign.Promotion>} promotions - a collection of promotions
 */
function ProductWrapper(product, productVariables, quantity, lineItem, promotions) {
    var productLineItem = new ProductLineItem(
        product,
        productVariables,
        quantity,
        lineItem,
        promotions
    );

    var items = ['id', 'productName', 'price', 'productType', 'images', 'rating',
        'variationAttributes', 'quantityOptions', 'priceTotal', 'isBonusProductLineItem', 'isGift',
        'UUID', 'quantity', 'isOrderable', 'promotions', 'appliedPromotions', 'renderedPromotions',
        'attributes', 'availability', 'isAvailableForInStorePickup'];

    items.forEach(function (item) {
        this[item] = productLineItem[item];
    }, this);
}

module.exports = ProductWrapper;
module.exports.productLineItem = ProductLineItem;
