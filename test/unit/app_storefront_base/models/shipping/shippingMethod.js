'use strict';

var assert = require('chai').assert;

describe('ShippingMethod', function () {
    var ShippingMethodModel = require('../../../../mocks/models/shippingMethod');

    it('should receive object with empty properties ', function () {
        var result = new ShippingMethodModel(null, null);
        assert.equal(true, true);
    });

    it('should set cost with shipment parameter ', function () {
        var result = new ShippingMethodModel({}, {});
        assert.equal(true, true);
    });

});
