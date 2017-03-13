'use strict';

var formatMoney = require('dw/util/StringUtils').formatMoney;
var ProductBase = require('./product/productBase').productBase;
var renderTemplateHelper = require('~/cartridge/scripts/renderTemplateHelper');

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

    if (lineItem.priceAdjustments.length) {
        result.nonAdjustedPrice = formatMoney(lineItem.getPrice());
    }

    result.price = formatMoney(lineItem.adjustedPrice);
    context = { lineItem: { priceTotal: result } };

    result.renderedPrice = renderTemplateHelper.getRenderedHtml(context, template);

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

    this.attributeConfig = {
        attributes: 'selected'
    };
    this.useSimplePrice = false;
    this.apiPromotions = promotions;
    this.initialize(lineItem);
}

ProductLineItem.prototype = Object.create(ProductBase.prototype);

ProductLineItem.prototype.initialize = function (lineItem) {
    ProductBase.prototype.initialize.call(this);
    this.quantityOptions = getMinMaxQuantityOptions(this.product, this.quantity);
    this.priceTotal = getTotalPrice(lineItem);
    this.isBonusProductLineItem = lineItem.bonusProductLineItem;
    this.isGift = lineItem.gift;
    this.UUID = lineItem.UUID;
    this.shipmentUUID = lineItem.shipment.UUID;
    this.isOrderable = this.product.availabilityModel.isOrderable(this.quantity);

    // TODO: Pull out this constant to top
    this.isAvailableForInStorePickup = ('isAvailableForInStorePickup' in this.product.custom
        && !!this.product.custom.isAvailableForInStorePickup);
    this.isInStorePickup = ('fromStoreId' in lineItem.custom
        && !!lineItem.custom.fromStoreId);
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
    var items = ['id', 'productName', 'price', 'productType', 'images', 'rating', 'attributes',
        'quantityOptions', 'priceTotal', 'isBonusProductLineItem', 'isGift', 'UUID', 'quantity',
        'isOrderable', 'promotions'];
    items.forEach(function (item) {
        this[item] = productLineItem[item];
    }, this);
}

module.exports = ProductWrapper;
