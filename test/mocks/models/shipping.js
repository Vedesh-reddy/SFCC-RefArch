'use strict';

var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var AddressModel = require('./address');
var ProductLineItemsModel = require('./productLineItems');
var ShippingMethodModel = require('./shippingMethod');

function ProxyModel(){
	return proxyquire('../../../cartridges/app_storefront_base/cartridge/models/shipping', {
	    '~/cartridge/models/address': AddressModel,
	    '~/cartridge/models/productLineItems': ProductLineItemsModel,
	    '~/cartridge/models/shipping/shippingMethod': ShippingMethodModel,
	    '~/cartridge/scripts/dwHelpers': {},
        '~/cartridge/scripts/util/collections': {},
        'dw/util/StringUtils': {
            formatMoney: function () {
                return 'formattedMoney';
            }
        },
        'dw/value/Money': require('../dw.value.Money'),
        'dw/order/ShippingMgr': {
            getDefaultShippingMethod: function () {
                return defaultShippingMethod;
            },
            getShipmentShippingModel: function () {
                return createShipmentShippingModel();
            }
        }
	});
}

module.exports = ProxyModel();