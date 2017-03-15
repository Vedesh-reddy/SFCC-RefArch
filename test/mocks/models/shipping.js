'use strict';

var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var ArrayList = require('../dw.util.Collection');

var AddressModel = require('./address');
var ProductLineItemsModel = require('./productLineItems');
var ShippingMethodModel = require('./shippingMethod');

var defaultShippingMethod = new ArrayList([
    {
        description: 'Order received within 7-10 business days',
        displayName: 'Ground',
        ID: '001',
        custom: {
            estimatedArrivalTime: '7-10 Business Days'
        }
    }
]);

function createShipmentShippingModel() {
    return {
        applicableShippingMethods: new ArrayList([
            {
                description: 'Order received within 7-10 business days',
                displayName: 'Ground',
                ID: '001',
                custom: {
                    estimatedArrivalTime: '7-10 Business Days'
                }
            },
            {
                description: 'Order received in 2 business days',
                displayName: '2-Day Express',
                ID: '002',
                shippingCost: '$0.00',
                custom: {
                    estimatedArrivalTime: '2 Business Days'
                }
            }
        ]),
        getShippingCost: function () {
            return {
                amount: {
                    valueOrNull: 7.99
                }
            };
        }
    };
}

function proxyModel() {
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

module.exports = proxyModel();
