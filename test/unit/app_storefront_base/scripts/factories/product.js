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

    it('should return full product model', function () {
        var productModel = function () { this.message = 'full product model'; };
        productModel.getVariationModel = getVariationModel;
        productModel.getProductType = function () { return 'variant'; };
        var productFactory = proxyquire('../../../../../app_storefront_base/cartridge/scripts/factories/product', {
            'dw/catalog/ProductMgr': toProductMock(productMgrMock),
            './../../models/product/product': productModel,
            './../../models/product/productBase': function () {}
        });

        var product = productFactory.get({ pid: 1234 });
        assert.equal(product.message, 'full product model');
    });
});
