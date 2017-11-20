'use strict';

var assert = require('chai').assert;

var productMock = {
    availabilityModel: {
        inventoryRecord: {
            ATS: {
                value: 5
            }
        }
    },
    minOrderQuantity: {
        value: 1
    }
};

describe('product line item quantity options decorator', function () {
    var quantityOptions = require('../../../../../../cartridges/app_storefront_base/cartridge/models/productLineItem/decorators/quantityOptions');

    it('should create quantityOptions property for passed in object', function () {
        var object = {};
        quantityOptions(object, productMock, 1);

        assert.equal(object.quantityOptions.minOrderQuantity, 1);
        assert.equal(object.quantityOptions.maxOrderQuantity, 5);
    });

    it('should handle no minOrderQuantity on the product', function () {
        var object = {};
        productMock.minOrderQuantity.value = null;
        quantityOptions(object, productMock, 1);

        assert.equal(object.quantityOptions.minOrderQuantity, 1);
        assert.equal(object.quantityOptions.maxOrderQuantity, 5);
    });
});
