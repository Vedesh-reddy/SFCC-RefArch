'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var ArrayList = require('../../../../mocks/dw.util.Collection');
var toProductMock = require('../../../../util');

describe('productBase', function () {
    var ProductBase = proxyquire('../../../../../app_storefront_base/cartridge/models/product/productBase', {
        './productPricing': function () {},
        './productImages': function () {},
        './productAttributes': function () { return []; },
        '../../scripts/dwHelpers': proxyquire('../../../../../app_storefront_base/cartridge/scripts/dwHelpers', {
            'dw/util/ArrayList': ArrayList
        })
    });

    var productVariantMock = {
        ID: '1234567',
        name: 'test product',
        variant: false,
        variationGroup: false,
        productSet: false,
        bundle: false
    };

    var productMock = {
        variationModel: {
            productVariationAttributes: new ArrayList([{
                attributeID: '',
                value: ''
            }]),
            setSelectedAttributeValue: {
                return: null,
                type: 'function'
            },
            selectedVariant: productVariantMock,
            getAllValues: {
                return: new ArrayList([]),
                type: 'function'
            }
        }
    };

    it('should create a simple product with no query string params', function () {
        var mock = toProductMock(productMock);
        var product = new ProductBase(mock);

        assert.equal(product.productName, 'test product');
        assert.equal(product.id, 1234567);
        assert.equal(product.rating, 4);
    });

    it('should create a product with query string params', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.variationModel.selectedVariant.variant = true;
        var mock = toProductMock(tempMock);
        var product = new ProductBase(mock, { color: { value: 123 } });

        assert.equal(product.productName, 'test product');
        assert.equal(product.id, 1234567);
        assert.equal(product.rating, 4);
    });

    it('should create a product with default variant', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.variationModel.selectedVariant = null;
        tempMock = Object.assign({}, productVariantMock, tempMock);
        tempMock.variant = false;
        tempMock.variationGroup = true;
        var product = new ProductBase(toProductMock(tempMock), { color: { value: 123 } });

        assert.equal(product.productName, 'test product');
        assert.equal(product.id, 1234567);
        assert.equal(product.rating, 4);
    });
});
