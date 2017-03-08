'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var toProductMock = require('../../../../util');

describe('productFactory', function () {
    var getVariationModel = function () {
        return {
            getSelectedVariant: function () {
                return {};
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
    productModel.getProductType = function () { return 'variant'; };
    var productFactory = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/factories/product', {
        'dw/catalog/ProductMgr': toProductMock(productMgrMock),
        'dw/campaign/PromotionMgr': {
            activeCustomerPromotions: { getProductPromotions: function () { return []; } }
        },
        './../../models/product/product': productModel,
        './../../models/product/productBase': function () { return { message: 'product base' }; },
        './../../models/productLineItem': function () { return { message: 'productLineItem' }; }
    });

    it('should return full product model', function () {
        var product = productFactory.get({ pid: 1234 });
        assert.equal(product.message, 'full product model');
    });

    it('should return productLineItem model', function () {
        var product = productFactory.get({
            pid: 1234,
            pview: 'productLineItem'
        });
        assert.equal(product.message, 'productLineItem');
    });

    it('should return product base', function () {
        var product = productFactory.get({
            pid: 1234,
            pview: 'tile'
        });
        assert.equal(product.message, 'product base');
    });
});
