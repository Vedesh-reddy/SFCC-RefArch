'use strict';

var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var collections = require('../util/collections');
var AddressModel = require('./address');
var ShippingMethodModel = require('./shippingMethod');

function proxyModel() {
    return proxyquire('../../../cartridges/app_storefront_base/cartridge/models/addressSelector', {
        '*/cartridge/models/address': AddressModel,
        '*/cartridge/models/shipping/shippingMethod': ShippingMethodModel,
        '*/cartridge/scripts/util/collections': collections
    });
}

module.exports = proxyModel();
