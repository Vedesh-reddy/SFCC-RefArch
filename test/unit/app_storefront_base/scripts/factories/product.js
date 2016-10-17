'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var commonHelpers = require('../../../../mocks/helpers/common');
var productFactoryPath = '../../../../../app_storefront_base/cartridge/scripts/factories/product';
var stubProductMgrGetProduct = sinon.stub();
var ProductMgrMock = {
    getProduct: stubProductMgrGetProduct
};


var testValue = 'test 123';
function ProductModelMock() {
    return {
        someprop: testValue
    };
}

var ProductFactory = proxyquire(productFactoryPath, {
    'dw/catalog/ProductMgr': ProductMgrMock,
    './../../models/product/Product': ProductModelMock,
    './../../models/product/Tile': {}
});

function createGetSelectedVariantStub(introspectors) {
    return sinon.stub().returns(introspectors);
}

describe('ProductFactory', function () {
    describe('.get()', function () {
        var params = { pid: 'product123' };

        it('should call ProductMgr.getProduct()', function () {
            var stubGetSelectedVariant = sinon.stub()
                .returns({
                    isMaster: commonHelpers.returnTrue,
                    isVariant: commonHelpers.returnFalse,
                    isVariationGroup: commonHelpers.returnFalse,
                    isProductSet: commonHelpers.returnFalse,
                    isBundle: commonHelpers.returnFalse
                });

            ProductModelMock.updateVariationSelection = function () {
                return {
                    getSelectedVariant: stubGetSelectedVariant
                };
            };

            ProductFactory.get(params);
            assert.isTrue(stubProductMgrGetProduct.called);
        });

        it('should return a ProductModel instance if the product is a Variant', function () {
            var introspectors = {
                isMaster: commonHelpers.returnFalse,
                isVariant: commonHelpers.returnTrue,
                isVariationGroup: commonHelpers.returnFalse,
                isProductSet: commonHelpers.returnFalse,
                isBundle: commonHelpers.returnFalse
            };
            var stubGetSelectedVariant = createGetSelectedVariantStub(introspectors);

            ProductModelMock.updateVariationSelection = function () {
                return {
                    getSelectedVariant: stubGetSelectedVariant
                };
            };

            var product = ProductFactory.get(params);
            assert.equal(product.someprop, testValue);
        });

        it('should return a ProductModel instance if the product is a Master product', function () {
            var introspectors = {
                isMaster: commonHelpers.returnTrue,
                isVariant: commonHelpers.returnFalse,
                isVariationGroup: commonHelpers.returnFalse,
                isProductSet: commonHelpers.returnFalse,
                isBundle: commonHelpers.returnFalse
            };
            var stubGetSelectedVariant = createGetSelectedVariantStub(introspectors);

            ProductModelMock.updateVariationSelection = function () {
                return {
                    getSelectedVariant: stubGetSelectedVariant
                };
            };

            var product = ProductFactory.get(params);
            assert.equal(product.someprop, testValue);
        });

        it('should return a ProductModel instance if the product is a Variation Group', function () {
            var introspectors = {
                isMaster: commonHelpers.returnFalse,
                isVariant: commonHelpers.returnFalse,
                isVariationGroup: commonHelpers.returnTrue,
                isProductSet: commonHelpers.returnFalse,
                isBundle: commonHelpers.returnFalse
            };
            var stubGetSelectedVariant = createGetSelectedVariantStub(introspectors);

            ProductModelMock.updateVariationSelection = function () {
                return {
                    getSelectedVariant: stubGetSelectedVariant
                };
            };

            var product = ProductFactory.get(params);
            assert.equal(product.someprop, testValue);
        });

        it('should return a ProductModel instance if the product is a Product Set', function () {
            var introspectors = {
                isMaster: commonHelpers.returnFalse,
                isVariant: commonHelpers.returnFalse,
                isVariationGroup: commonHelpers.returnFalse,
                isProductSet: commonHelpers.returnTrue,
                isBundle: commonHelpers.returnFalse
            };
            var stubGetSelectedVariant = createGetSelectedVariantStub(introspectors);

            ProductModelMock.updateVariationSelection = function () {
                return {
                    getSelectedVariant: stubGetSelectedVariant
                };
            };

            var product = ProductFactory.get(params);
            assert.isFalse(product.hasOwnProperty.call(product, 'someprop'));
        });

        it('should return a ProductModel instance if the product is a Bundle', function () {
            var introspectors = {
                isMaster: commonHelpers.returnFalse,
                isVariant: commonHelpers.returnFalse,
                isVariationGroup: commonHelpers.returnFalse,
                isProductSet: commonHelpers.returnFalse,
                isBundle: commonHelpers.returnTrue
            };
            var stubGetSelectedVariant = createGetSelectedVariantStub(introspectors);

            ProductModelMock.updateVariationSelection = function () {
                return {
                    getSelectedVariant: stubGetSelectedVariant
                };
            };

            var product = ProductFactory.get(params);
            assert.isFalse(product.hasOwnProperty.call(product, 'someprop'));
        });

        it('should throw an Error if not valid product type', function () {
            var introspectors = {
                isMaster: commonHelpers.returnFalse,
                isVariant: commonHelpers.returnFalse,
                isVariationGroup: commonHelpers.returnFalse,
                isProductSet: commonHelpers.returnFalse,
                isBundle: commonHelpers.returnFalse
            };
            var stubGetSelectedVariant = createGetSelectedVariantStub(introspectors);

            ProductModelMock.updateVariationSelection = function () {
                return {
                    getSelectedVariant: stubGetSelectedVariant
                };
            };

            function testThrowError() {
                ProductFactory.get(params);
            }

            assert.throws(testThrowError, TypeError);
        });
    });
});
