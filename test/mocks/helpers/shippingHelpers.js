'use strict';

var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var collections = require('../util/collections');

var ShippingModel = require('../models/shipping');

var ShippingMgr = require('../dw/order/ShippingMgr');

var ShippingMethodModel = require('../models/shippingMethod');

function proxyModel() {
    return proxyquire('../../../cartridges/app_storefront_base/cartridge/scripts/checkout/shippingHelpers', {
        '*/cartridge/scripts/util/collections': collections,
        '*/cartridge/models/shipping': ShippingModel,
        'dw/order/ShippingMgr': ShippingMgr,
        '*/cartridge/models/shipping/shippingMethod': ShippingMethodModel
    });
}

module.exports = proxyModel();
