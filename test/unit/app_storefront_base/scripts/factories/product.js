'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var toProductMock = require('../../../../util');

describe('productFactory', function () {
    var getPrimaryCategory = function () {
        return {
            custom: {
                sizeChartID: 7890
            }
        };
    };

    var getVariationModel = function () {
        return {
            getSelectedVariant: function () {
                return {
                    getPrimaryCategory: getPrimaryCategory
                };
            }
        };
    };

    var productMgrMock = {
        getProduct: {
            return: getVariationModel,
            type: 'function'
        }
    };

    var productModel = function () { this.message = 'full product model'; };
    productModel.getVariationModel = getVariationModel;
    var productFactory = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/factories/product', {
        'dw/catalog/ProductMgr': toProductMock(productMgrMock),
        'dw/campaign/PromotionMgr': {
            activeCustomerPromotions: { getProductPromotions: function () { return []; } }
        },
        '*/cartridge/models/product/product': productModel,
        '*/cartridge/models/product/productBase': function () { return { message: 'product base' }; },
        '*/cartridge/models/productLineItem/productLineItem': function () { return { message: 'productLineItem' }; },
        '*/cartridge/models/productLineItem/bundleLineItem': function () { return { message: 'bundleLineItem' }; },
        '*/cartridge/models/product/productBundle': function () { return { message: 'productBundle' }; },
        '*/cartridge/models/product/productSet': function () { return { message: 'productSet' }; },
        '*/cartridge/models/product/productSetBase': function () { return { message: 'productSetBase' }; }
    });

    it('should return full product model', function () {
        productModel.getProductType = function () { return 'variant'; };
        var product = productFactory.get({ pid: 1234 });
        assert.equal(product.message, 'full product model');
    });

    it('should return productLineItem model', function () {
        productModel.getProductType = function () { return 'variant'; };
        var product = productFactory.get({
            pid: 1234,
            pview: 'productLineItem'
        });
        assert.equal(product.message, 'productLineItem');
    });

    it('should return productLineItem model', function () {
        productModel.getProductType = function () { return 'bundle'; };
        var product = productFactory.get({
            pid: 1234,
            pview: 'productLineItem'
        });
        assert.equal(product.message, 'bundleLineItem');
    });

    it('should return product base', function () {
        productModel.getProductType = function () { return 'variant'; };
        var product = productFactory.get({
            pid: 1234,
            pview: 'tile'
        });
        assert.equal(product.message, 'product base');
    });

    it('should return product bundle model', function () {
        productModel.getProductType = function () { return 'bundle'; };

        var product = productFactory.get({ pid: 1234 });
        assert.equal(product.message, 'productBundle');
    });

    it('should return product base model for bundle tile view', function () {
        productModel.getProductType = function () { return 'bundle'; };

        var product = productFactory.get({ pid: 1234, pview: 'tile' });
        assert.equal(product.message, 'product base');
    });

    it('should return product set base model for tile view', function () {
        productModel.getProductType = function () { return 'set'; };

        var product = productFactory.get({ pid: 1234, pview: 'tile' });
        assert.equal(product.message, 'productSetBase');
    });

    it('should return product set model', function () {
        productModel.getProductType = function () { return 'set'; };

        var product = productFactory.get({ pid: 1234 });
        assert.equal(product.message, 'productSet');
    });
});
