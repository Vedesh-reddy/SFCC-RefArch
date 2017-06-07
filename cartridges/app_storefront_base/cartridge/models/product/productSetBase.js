'use strict';

var base = require('./productBase');
var ProductBase = base.productBase;
var collections = require('*/cartridge/scripts/util/collections');
var formatCurrency = require('~/cartridge/scripts/util/formatting').formatCurrency;

/**
 * Returns the products in the set
 *
 * @param {dw.util.Collection} individualProducts - Collection of products in the set
 * @param {Object} productFactory - product factory utilitiy to get product model based on
 *                                  product type
 * @returns {Array} Array of products in a set
 */
function getIndividualProducts(individualProducts, productFactory) {
    var products = collections.map(individualProducts, function (individualProduct) {
        return productFactory.get({ pid: individualProduct.ID });
    });
    return products;
}

/**
 * Returns a simple price object
 *
 * @param {number} price - price value
 * @param {string} currency - currency code
 * @returns {Object} price object
 */
function createPriceObject(price, currency) {
    return {
        list: null,
        sales: {
            currency: currency,
            formatted: formatCurrency(price, currency),
            value: price
        }
    };
}

/**
 * Normalizes and returns a running total of the products in a set
 *
 * @param {Object} previous - previous running total
 * @param {Object} current - current product object with price to normalize
 * @returns {Object} total running total
 */
function calculateRunningTotal(previous, current) {
    var runningTotal = {
        min: null,
        max: null,
        currency: null
    };
    var tiersLength;
    if (current.price.type === 'tiered') {
        tiersLength = current.price.tiers.length;
        runningTotal.min = current.price.tiers[tiersLength - 1]
            .price.sales.value + previous.min;
        runningTotal.max = current.price.tiers[0].price.sales.value + previous.max;
        runningTotal.currency = current.price.tiers[0].price.sales.currency;
    } else if (current.price.type === 'range') {
        runningTotal.min = current.price.min.sales.value + previous.min;
        runningTotal.max = current.price.max.sales.value + previous.max;
        runningTotal.currency = current.price.max.sales.currency;
    } else {
        runningTotal.min = current.price.sales.value + previous.min;
        runningTotal.max = current.price.sales.value + previous.max;
        runningTotal.currency = current.price.sales.currency;
    }
    return runningTotal;
}

/**
 * Returns total price in a product set
 *
 * @param {Array} individualProducts - Array of products in a product set
 * @returns {Object} total price object
 */
function getTotalPrice(individualProducts) {
    var priceTotal = individualProducts.reduce(calculateRunningTotal, { min: 0, max: 0 });

    if (priceTotal.max === priceTotal.min) {
        priceTotal = createPriceObject(priceTotal.min, priceTotal.currency);
    } else {
        priceTotal = {
            max: createPriceObject(priceTotal.max, priceTotal.currency),
            min: createPriceObject(priceTotal.min, priceTotal.currency),
            type: 'range'
        };
    }
    return priceTotal;
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
 * @param {Object} productFactory - Factory utility that returns a ProductModel instance
 */
function ProductSetBase(product, productVariables, quantity, promotions, productFactory) {
    this.productFactory = productFactory;
    ProductBase.call(this, product, productVariables, quantity, promotions);
}

ProductSetBase.prototype = Object.create(ProductBase.prototype);

ProductSetBase.prototype.initialize = function () {
    ProductBase.prototype.initialize.call(this);
    this.individualProducts = getIndividualProducts(
        this.product.bundledProducts,
        this.productFactory
    );
    this.price = getTotalPrice(this.individualProducts);
};

/**
 * @constructor
 * @classdesc Base product class. Used for product tiles
 * @param {dw.catalog.Product} product - Product instance returned from the API
 * @param {Object} productVariables - variables passed in the query string to
 *                                    target product variation group
 * @param {dw.util.Collection.<dw.campaign.Promotion>} promotions - Collection of applicable
 *                                                                  Promotions
 * @param {Object} productFactory - Factory utility that returns a ProductModel instance
 */
function ProductWrapper(product, productVariables, promotions, productFactory) {
    var productSetBase = new ProductSetBase(
        product,
        productVariables,
        null,
        promotions,
        productFactory
    );

    var items = [
        'id',
        'individualProducts',
        'price',
        'productName',
        'price',
        'productType',
        'images',
        'rating',
        'variationAttributes',
        'promotions',
        'attributes'
    ];

    items.forEach(function (item) {
        this[item] = productSetBase[item];
    }, this);
}

module.exports = ProductWrapper;
module.exports.productSetBase = ProductSetBase;
module.exports.getProductType = base.getProductType;
module.exports.getVariationModel = base.getVariationModel;
