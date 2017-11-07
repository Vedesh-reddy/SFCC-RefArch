'use strict';

var assert = require('chai').assert;

var productMock = {
    custom: {
        isAvailableForInStorePickup: true
    }
};

var lineItemMock = {
    custom: {
        fromStoreId: 'someID'
    }
};

describe('product line item in store pick up decorator', function () {
    var inStorePickUp = require('../../../../../../cartridges/app_storefront_base/cartridge/models/productLineItem/decorators/inStorePickUp');

    it('should create isAvailableForInStorePickup property for passed in object', function () {
        var object = {};
        inStorePickUp(object, productMock, lineItemMock);

        assert.isTrue(object.isAvailableForInStorePickup);
    });

    it('should create isInStorePickup property for passed in object', function () {
        var object = {};
        inStorePickUp(object, productMock, lineItemMock);

        assert.isTrue(object.isInStorePickup);
    });
});
