'use strict';

var money = require('dw/value/Money');
var collections = require('*/cartridge/scripts/util/collections');
var priceHelper = require('*/cartridge/scripts/helpers/pricing');
var DefaultPrice = require('*/cartridge/models/price/default');
var RangePrice = require('*/cartridge/models/price/range');
var TieredPrice = require('*/cartridge/models/price/tiered');
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
    var promotion = collections.find(promotions, function (promo) {
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
 * @param {boolean} useSimplePrice - Flag as to whether a simple price should be used, used for
 *     product tiles and cart line items.
 * @param {dw.util.Collection.<dw.campaign.Promotion>} promotions - Promotions that apply to this
 *                                                                 product
 * @param {dw.catalog.ProductOptionModel} currentOptionModel - The product's option model
 * @return {TieredPrice|RangePrice|DefaultPrice} - The product's price
 */
function getPrice(inputProduct, currency, useSimplePrice, promotions, currentOptionModel) {
    var rangePrice;
    var salesPrice;
    var listPrice;
    var product = inputProduct;
    var promotionPrice = money.NOT_AVAILABLE;
    var priceModel = product.getPriceModel(currentOptionModel);
    var priceTable = priceModel.getPriceTable();

    // TIERED
    if (priceTable.quantities.length > 1) {
        return new TieredPrice(priceTable, useSimplePrice);
    }

    // RANGE
    if ((product.master || product.variationGroup) && priceModel.priceRange) {
        rangePrice = new RangePrice(priceModel.minPrice, priceModel.maxPrice);

        if (rangePrice && rangePrice.min.sales.value !== rangePrice.max.sales.value) {
            return rangePrice;
        }
    }

    // DEFAULT
    if (product.master && product.variationModel.variants.length > 0) {
        product = product.variationModel.variants[0];
        priceModel = product.priceModel;
    }

    promotionPrice = getPromotionPrice(product, promotions, currentOptionModel);
    listPrice = getListPrice(priceModel);
    salesPrice = priceModel.price;

    if (promotionPrice && promotionPrice.available && salesPrice.compareTo(promotionPrice)) {
        salesPrice = promotionPrice;
    }

    if (salesPrice && listPrice && salesPrice.value === listPrice.value) {
        listPrice = null;
    }

    return new DefaultPrice(salesPrice, listPrice);
}

module.exports = {
    getPrice: getPrice
};
