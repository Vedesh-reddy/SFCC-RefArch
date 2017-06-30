'use strict';

var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var collections = require('../util/collections');

var AddressModel = require('./address');
var ProductLineItemsModel = require('./productLineItems');
var ShippingMethodModel = require('./shippingMethod');

var ShippingMgr = require('../dw/order/ShippingMgr');

function proxyModel() {
    return proxyquire('../../../cartridges/app_storefront_base/cartridge/models/shipping', {
        '*/cartridge/models/address': AddressModel,
        '*/cartridge/models/productLineItems': ProductLineItemsModel,
        '*/cartridge/models/shipping/shippingMethod': ShippingMethodModel,
        '*/cartridge/scripts/util/collections': collections,
        '*/cartridge/scripts/util/formatting': {},
        'dw/util/StringUtils': {
            formatMoney: function () {
                return 'formattedMoney';
            }
        },
        'dw/value/Money': require('../dw.value.Money'),
        'dw/order/ShippingMgr': ShippingMgr
    });
}

module.exports = proxyModel();
