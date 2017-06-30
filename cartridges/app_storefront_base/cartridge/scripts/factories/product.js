'use strict';

var ProductMgr = require('dw/catalog/ProductMgr');
var ProductTile = require('*/cartridge/models/product/productBase');
var Product = require('*/cartridge/models/product/product');
var ProductLineItemModel = require('*/cartridge/models/productLineItem/productLineItem');
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
    var selectedOptions = params.options;
    var productFactory = this;
    var ProductSetTile;
    var ProductSet;
    var ProductBundle;
    var product;

    if (variationModel) {
        product = variationModel.getSelectedVariant() || apiProduct;
    } else {
        product = apiProduct;
    }

    var promotions = PromotionMgr.activeCustomerPromotions.getProductPromotions(product);
    promotions = promotions.length ? promotions : null;
    var productType = Product.getProductType(product);

    if (productType === 'set') {
        switch (params.pview) {
            case 'tile':
                ProductSetTile = require('*/cartridge/models/product/productSetBase');
                product = new ProductSetTile(product, params.variables, promotions, productFactory);
                break;
            default:
                ProductSet = require('*/cartridge/models/product/productSet');
                product = new ProductSet(
                    product,
                    params.quantity,
                    promotions,
                    productFactory
                );
                break;
        }
    } else if (productType === 'bundle') {
        switch (params.pview) {
            case 'tile':
                product = new ProductTile(product, params.variables, promotions);
                break;
            case 'productLineItem':
                var ProductLineItemBundleModel = require(
                    '*/cartridge/models/productLineItem/bundleLineItem'
                );
                product = new ProductLineItemBundleModel(
                    product,
                    params.quantity,
                    params.lineItem,
                    promotions,
                    productFactory
                );
                break;
            default:
                ProductBundle = require('*/cartridge/models/product/productBundle');
                product = new ProductBundle(
                    product,
                    params.quantity,
                    promotions,
                    productFactory
                );
                break;
        }
    } else {
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
                    promotions,
                    selectedOptions
                );
                break;
            default:
                product = new Product(product, params.variables, params.quantity, promotions,
                    selectedOptions);
                break;
        }
    }

    return product;
};

module.exports = ProductFactory;
