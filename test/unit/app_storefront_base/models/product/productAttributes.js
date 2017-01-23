'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var ArrayList = require('../../../../mocks/dw.util.Collection');
var toProductMock = require('../../../../util');

describe('productAttributes', function () {
    var ProductAttributes = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/models/product/productAttributes', {
        './productImages': function () {},
        '../../scripts/dwHelpers': proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/dwHelpers', {
            'dw/util/ArrayList': ArrayList
        })
    });

    var variationsMock = {
        productVariationAttributes: new ArrayList([]),
        getSelectedValue: {
            return: {
                equals: {
                    return: true,
                    type: 'function'
                }
            },
            type: 'function'
        },
        getAllValues: {
            return: new ArrayList([]),
            type: 'function'
        },
        hasOrderableVariants: {
            return: false,
            type: 'function'
        },
        urlUnselectVariationValue: {
            return: 'unselect_url',
            type: 'function'
        },
        urlSelectVariationValue: {
            return: 'select_url',
            type: 'function'
        }
    };

    it('should return empty array if product doesn not have attributes', function () {
        var mock = toProductMock(variationsMock);
        var attrs = new ProductAttributes(mock, ['color']);

        assert.equal(attrs.length, 0);
    });

    it('should return color attributes', function () {
        var tempMock = Object.assign({}, variationsMock);
        tempMock.productVariationAttributes = new ArrayList([{
            attributeID: 'color',
            displayName: 'color',
            ID: 'COLOR_ID'
        }]);
        var mock = toProductMock(tempMock);
        var attrs = new ProductAttributes(mock, ['color']);

        assert.equal(attrs.length, 1);
        assert.equal(attrs[0].displayName, 'color');
        assert.equal(attrs[0].attributeId, 'color');
        assert.equal(attrs[0].id, 'COLOR_ID');
        assert.isTrue(attrs[0].swatchable);
        assert.equal(attrs[0].values.length, 0);
    });

    it('should return color attributes with multiple values', function () {
        var tempMock = Object.assign({}, variationsMock);
        tempMock.productVariationAttributes = new ArrayList([{
            attributeID: 'color',
            displayName: 'color',
            ID: 'COLOR_ID'
        }, {
            attributeID: 'size',
            displayName: 'size',
            ID: 'SIZE_ID'
        }]);
        tempMock.getAllValues.return = new ArrayList([{
            ID: 'asdfa9s87sad',
            description: '',
            displayValue: 'blue',
            value: 'asdfa9s87sad'
        }, {
            ID: 'asd98f7asdf',
            description: '',
            displayValue: 'grey',
            value: 'asd98f7asdf'
        }]);
        var mock = toProductMock(tempMock);
        var attrs = new ProductAttributes(mock, ['color']);

        assert.equal(attrs.length, 1);
        assert.equal(attrs[0].displayName, 'color');
        assert.equal(attrs[0].values.length, 2);
        assert.equal(attrs[0].values[0].displayValue, 'blue');
        assert.equal(attrs[0].values[1].displayValue, 'grey');
    });

    it('should return size attributes with multiple values', function () {
        var tempMock = Object.assign({}, variationsMock);
        tempMock.productVariationAttributes = new ArrayList([{
            attributeID: 'color',
            displayName: 'color',
            ID: 'COLOR_ID'
        }, {
            attributeID: 'size',
            displayName: 'size',
            ID: 'SIZE_ID'
        }]);
        tempMock.getAllValues.return = new ArrayList([{
            ID: '038',
            description: '',
            displayValue: '38',
            value: '038'
        }, {
            ID: '039',
            description: '',
            displayValue: '39',
            value: '039'
        }]);
        var mock = toProductMock(tempMock);
        var attrs = new ProductAttributes(mock, ['size']);

        assert.equal(attrs.length, 1);
        assert.equal(attrs[0].displayName, 'size');
        assert.equal(attrs[0].values.length, 2);
        assert.equal(attrs[0].values[0].displayValue, '38');
        assert.equal(attrs[0].values[1].displayValue, '39');
    });

    it('should return size attributes with a resetUrl', function () {
        var tempMock = Object.assign({}, variationsMock);

        tempMock.productVariationAttributes = new ArrayList([{
            attributeID: 'color',
            displayName: 'color',
            ID: 'color'
        }, {
            attributeID: 'size',
            displayName: 'size',
            ID: 'size',
            resetUrl: ''
        }]);

        tempMock.getAllValues.return = new ArrayList([{
            ID: '038',
            description: '',
            displayValue: '38',
            value: '038',
            selectable: true,
            selected: false,
            url: ''
        }, {
            ID: '039',
            description: '',
            displayValue: '39',
            value: '039',
            selectable: true,
            selected: false,
            url: ''

        }]);

        tempMock.getSelectedValue.return = false;
        tempMock.hasOrderableVariants.return = true;
        tempMock.urlSelectVariationValue.return = '?pid=25604524&dwvar_25604524_size=038&dwvar_25604524_color=BLACKFB';

        var mock = toProductMock(tempMock);
        var attrs = new ProductAttributes(mock, ['size']);

        assert.equal(attrs[0].resetUrl, '?pid=25604524&dwvar_25604524_size=&dwvar_25604524_color=BLACKFB');
    });
});
