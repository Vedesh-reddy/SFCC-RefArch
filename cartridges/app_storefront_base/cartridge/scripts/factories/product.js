'use strict';

var ProductMgr = require('dw/catalog/ProductMgr');
var ProductTile = require('./../../models/product/productBase');
var Product = require('./../../models/product/product');
var ProductLineItemModel = require('./../../models/productLineItem');
var PromotionMgr = require('dw/campaign/PromotionMgr');

/**
 * Factory utility that returns a ProductModel instance that encapsulates a Demandware Product
 * instance.
 */
function ProductFactory() {}

ProductFactory.get = function (params) {
    var productId = params.pid;
    var apiProduct = ProductMgr.getProduct(productId);
    var variationModel = Product.getVariationModel(apiProduct, params.variables);
    var product = variationModel.getSelectedVariant() || apiProduct;
    var promotions = PromotionMgr.activeCustomerPromotions.getProductPromotions(product);
    promotions = promotions.length ? promotions : null;
    var productType = Product.getProductType(product);

    if (productType === 'variant' || productType === 'master' || productType === 'variationGroup') {
        switch (params.pview) {
            case 'tile':
                product = new ProductTile(product, params.variables, promotions);
                break;
            case 'productLineItem':
                product = new ProductLineItemModel(
                    product,
                    params.variables,
                    params.quantity,
                    params.lineItem,
                    promotions
                );
                break;
            default:
                product = new Product(product, params.variables, params.quantity, promotions);
                break;
        }
    } else if (productType === 'set') {
        // TODO: Add ProductSet factory
    } else if (productType === 'bundle') {
        // TODO: Add ProductBundle factory
    } else {
        throw new TypeError('Invalid Product Type');
    }

    return product;
};

module.exports = ProductFactory;
