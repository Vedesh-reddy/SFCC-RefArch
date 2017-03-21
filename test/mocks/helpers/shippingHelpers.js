'use strict';

var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var dwHelpers = require('../dwHelpers');

var ShippingModel = require('../models/shipping');

var ShippingMgr = require('../dw/order/ShippingMgr');


function proxyModel() {
    return proxyquire('../../../cartridges/app_storefront_base/cartridge/scripts/checkout/shippingHelpers', {
        '~/cartridge/scripts/dwHelpers': dwHelpers,
        '~/cartridge/scripts/util/collections': dwHelpers,
        '~/cartridge/models/shipping': ShippingModel,
        'dw/order/ShippingMgr': ShippingMgr
    });
}

module.exports = proxyModel();
