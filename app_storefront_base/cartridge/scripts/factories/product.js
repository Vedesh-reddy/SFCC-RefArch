'use strict';

var ProductMgr = require('dw/catalog/ProductMgr');
var ProductModel = require('./../../models/product/Product');
var ProductTileModel = require('./../../models/product/Tile');

/**
 * Factory utility that returns a ProductModel instance that encapsulates a Demandware Product
 * instance.
 */
function ProductFactory() {}

ProductFactory.get = function (params) {
    var productModelUsed = params.pview === 'tile'
        ? ProductTileModel
        : ProductModel;

    var productId = params.pid;
    var dwProduct = ProductMgr.getProduct(productId);

    var selectedVariationModel = productModelUsed.updateVariationSelection({
        dwProduct: dwProduct,
        attrs: params.variables
    });

    var selectedVariant = selectedVariationModel.getSelectedVariant();

    if (selectedVariant) {
        dwProduct = selectedVariant;
    }

    var product = {};

    if (dwProduct.isVariant() || dwProduct.isMaster() || dwProduct.isVariationGroup()) {
        product = params.pview === 'tile'
            ? new ProductTileModel({ dwProduct: dwProduct, params: params })
            : new ProductModel({ dwProduct: dwProduct, params: params });
    } else if (dwProduct.isProductSet()) {
        // TODO: Add ProductSet factory
    } else if (dwProduct.isBundle()) {
        // TODO: Add ProductBundle factory
    } else {
        throw new TypeError('Invalid Product Type');
    }

    return product;
};

module.exports = ProductFactory;
