'use strict';

var money = require('dw/value/Money');
var formatMoney = require('dw/util/StringUtils').formatMoney;
var dwHelpers = require('../../scripts/dwHelpers');
var PROMOTION_CLASS_PRODUCT = require('dw/campaign/Promotion').PROMOTION_CLASS_PRODUCT;
/**
 * Convert API price to an object
 * @param {Object} price - Price object returned from the API
 * @returns {Object} price formatted as a simple object
 */
function toPriceModel(price) {
    var value = price.available ? price.getDecimalValue().get() : null;
    var currency = price.available ? price.getCurrencyCode() : null;

    return {
        value: value,
        currency: currency,
        formatted: formatMoney(money(value, currency))
    };
}

/**
 * Return correct price book for a given priceModel
 * @param {Object} priceModel - the price model of the product object
 * @returns {Object} priceBook of a given priceModel
 */
function getPriceBook(priceModel) {
    var priceBook = priceModel.priceInfo.priceBook;
    while (priceBook.parentPriceBook) {
        priceBook = priceBook.parentPriceBook ? priceBook.parentPriceBook : priceBook;
    }
    return priceBook;
}

/**
 * @constructor
 * @classdesc Pricing model for a given product
 * @param {Object} product - API object for a product
 * @param {Object} promotions - API object for promotions for a current product
 * @param {Object} currency - Current session currencyCode
 * @param {Object} currentOptionModel - No idea what this is
 */
function productPricing(product, promotions, currency, currentOptionModel) {
    var priceModel = product.getPriceModel();
    var promotionalPrice;
    var rangePrice;
    var standardPrice;
    var tieredPrice;

    /**
     * Get standard price for a product
     * @returns {Object} price object
     * @private
     */
    function getStandardPrice() {
        var price;

        if (promotions.length > 0) {
            var priceBook = getPriceBook(priceModel);
            if (priceModel.length > 0 && priceModel.getPrice().available) {
                var priceBookPrice = priceModel.getPriceBookPrice(priceBook.ID);
                if (priceBookPrice.available && priceBookPrice.getCurrency().getCurrencyCode() ===
                    standardPrice.getCurrency().getCurrencyCode()) {
                    return toPriceModel(priceBookPrice);
                }
            }
        }

        price = priceModel.getPrice().available ? priceModel.getPrice() : priceModel.minPrice;

        return toPriceModel(price);
    }

    /**
     * Get promotional price for a product
     * @returns {Object} price object
     * @private
     */
    function getPromotionalPrice() {
        var optionModel = currentOptionModel || product.getOptionModel;

        if (promotions.length > 0) {
            var promoPrice = null;
            dwHelpers.forEach(promotions, function (promo) {
                if (promo.getPromotionClass()
                    && promo.getPromotionClass().equals(PROMOTION_CLASS_PRODUCT)) {
                    if (product.optionProduct) {
                        // TODO: remove usage of currentOptionModel
                        promoPrice = promo.getPromotionalPrice(product, optionModel);
                    } else {
                        promoPrice = promo.getPromotionalPrice(product);
                    }
                }
            });

            if (promoPrice) {
                return toPriceModel(promoPrice);
            }
        }
        return null;
    }

    /**
     * Get range price for a product
     * @returns {Object} object with min and max pricing
     * @private
     */
    function getRangePrice() {
        if ((product.master || product.variationGroup) && priceModel.isPriceRange()) {
            return {
                min: toPriceModel(priceModel.minPrice),
                max: toPriceModel(priceModel.maxPrice)
            };
        }
        return null;
    }

    /**
     * Get tiered price for a product
     * @returns {Object} object with keys containing quantity brakets and prices
     * @private
     */
    function getTieredPrice() {
        var priceTable = priceModel.getPriceTable();
        var basePriceQuantity = priceModel.getBasePriceQuantity();
        var tieredPricing = null;
        dwHelpers.forEach(priceTable.getQuantities(), function (quantity) {
            if (quantity.compareTo(basePriceQuantity) !== 0) {
                if (!tieredPricing) {
                    tieredPricing = {};
                }
                tieredPricing[quantity.getValue()] = toPriceModel(priceTable.getPrice(quantity));
            }
        });

        return tieredPricing;
    }

    standardPrice = getStandardPrice();
    promotionalPrice = getPromotionalPrice(); // TODO: promotions don't seem to work
    rangePrice = getRangePrice();
    tieredPrice = getTieredPrice();

    if (promotionalPrice && standardPrice) {
        return {
            type: 'promotion',
            standard: standardPrice,
            promo: promotionalPrice
        };
    }
    if (tieredPrice) {
        tieredPrice.type = 'tiered';
        return tieredPrice;
    }
    if (rangePrice && rangePrice.min.value !== rangePrice.max.value) {
        rangePrice.type = 'range';
        return rangePrice;
    }

    standardPrice.type = 'standard';
    return standardPrice;
}

module.exports = productPricing;
