'use strict';

var base = require('*/cartridge/models/product/productBase');
var ProductBase = base.productBase;
var collections = require('*/cartridge/scripts/util/collections');

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
