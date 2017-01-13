'use strict';

var money = require('dw/value/Money');
var dwHelpers = require('../dwHelpers');
var priceHelper = require('../helpers/pricing');
var PromotionMgr = require('dw/campaign/PromotionMgr');
var DefaultPrice = require('../../models/price/default');
var RangePrice = require('../../models/price/range');
var TieredPrice = require('../../models/price/tiered');
var PROMOTION_CLASS_PRODUCT = require('dw/campaign/Promotion').PROMOTION_CLASS_PRODUCT;


/**
 * Get list price for a product
 *
 * @param {dw.catalog.ProductPriceModel} priceModel - Product price model
 * @return {dw.value.Money} - List price
 */
function getListPrice(priceModel) {
    var price = money.NOT_AVAILABLE;
    var priceBook;
    var priceBookPrice;

    if (priceModel.price.valueOrNull === null && priceModel.minPrice) {
        return priceModel.minPrice;
    }

    priceBook = priceHelper.getRootPriceBook(priceModel.priceInfo.priceBook);
    priceBookPrice = priceModel.getPriceBookPrice(priceBook.ID);

    if (priceBookPrice.available) {
        return priceBookPrice;
    }

    price = priceModel.price.available ? priceModel.price : priceModel.minPrice;

    return price;
}

/**
 * Get a product's promotional price
 *
 * @param {dw.catalog.Product} product - Product under evaluation
 * @param {dw.util.Collection.<dw.campaign.Promotion>} promotions - Promotions that apply to this
 *     product
 * @param {dw.catalog.ProductOptionModel} currentOptionModel - The product's option model
 * @return {dw.value.Money} - Promotional price
 */
function getPromotionPrice(product, promotions, currentOptionModel) {
    var price = money.NOT_AVAILABLE;
    var promotion = dwHelpers.find(promotions, function (promo) {
        return promo.promotionClass && promo.promotionClass.equals(PROMOTION_CLASS_PRODUCT);
    });

    if (promotion) {
        price = currentOptionModel
            ? promotion.getPromotionalPrice(product, currentOptionModel)
            : promotion.getPromotionalPrice(product, product.optionModel);
    }

    return price;
}

/**
 * Retrieves Price instance
 *
 * @param {dw.catalog.Product} inputProduct - API object for a product
 * @param {string} currency - Current session currencyCode
 * @param {boolean} isProductTile - Flag as to whether this price is for a product tile
 * @param {dw.catalog.ProductOptionModel} currentOptionModel - The product's option model
 * @return {TieredPrice|RangePrice|DefaultPrice} - The product's price
 */
function getPrice(inputProduct, currency, isProductTile, currentOptionModel) {
    var inputPriceModel;
    var rangePrice;
    var salesPrice;
    var listPrice;
    var product = inputProduct;
    var promotions;
    var promotionPrice = money.NOT_AVAILABLE;
    var priceModel = product.getPriceModel();
    var priceTable = priceModel.getPriceTable();

    // TIERED
    if (priceTable.quantities.length > 1) {
        return new TieredPrice(priceTable, isProductTile);
    }

    // RANGE
    if ((product.master || product.variationGroup) && product.priceModel.priceRange) {
        inputPriceModel = product.priceModel;
        rangePrice = new RangePrice(inputPriceModel.minPrice, inputPriceModel.maxPrice);

        if (rangePrice && rangePrice.min.value !== rangePrice.max.value) {
            return rangePrice;
        }
    }

    // DEFAULT
    if (product.master && product.variationModel.variants.size() > 0) {
        product = product.variationModel.variants[0];
        priceModel = product.priceModel;
    }

    promotions = PromotionMgr.activeCustomerPromotions.getProductPromotions(product);
    promotionPrice = getPromotionPrice(product, promotions, currentOptionModel);
    listPrice = getListPrice(priceModel);
    salesPrice = priceModel.price;

    return new DefaultPrice(listPrice, salesPrice, promotionPrice);
}

module.exports = {
    getPrice: getPrice
};
