'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var sinon = require('sinon');

var ArrayList = require('../../../mocks/dw.util.Collection');
var getMockMoney = require('../../../mocks/dw.value.Money');

var createShipmentShippingModel = function () {
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
};

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

var defaultShipment = {
    setShippingMethod: function (shippingMethod) {
        return shippingMethod;
    },
    shippingMethod: {
        ID: '001',
        displayName: 'Ground',
        description: 'Order received within 7-10 business days',
        custom: {
            estimatedArrivalTime: '7-10 Business Days'
        }
    }
};

describe('Shipping', function () {
    var ShippingModel = null;
    var helper = proxyquire('../../../../app_storefront_base/cartridge/scripts/dwHelpers', {
        'dw/util/ArrayList': ArrayList
    });
    ShippingModel = proxyquire('../../../../app_storefront_base/cartridge/models/shipping', {
        '~/cartridge/scripts/dwHelpers': helper,
        'dw/util/StringUtils': {
            formatMoney: function () {
                return 'formattedMoney';
            }
        },
        'dw/value/Money': getMockMoney,
        'dw/order/ShippingMgr': {
            getDefaultShippingMethod: function () {
                return defaultShippingMethod;
            },
            getShipmentShippingModel: function () {
                return createShipmentShippingModel();
            }
        }
    });

    it('should receive object with null properties ', function () {
        var result = new ShippingModel(null, null);
        assert.deepEqual(result, {
            applicableShippingMethods: null,
            shippingAddress: null,
            selectedShippingMethod: null
        });
    });

    it('should get the selected shipping method information', function () {
        var result = new ShippingModel(defaultShipment, createShipmentShippingModel(), {});

        assert.equal(result.selectedShippingMethod.ID, '001');
        assert.equal(result.selectedShippingMethod.displayName, 'Ground');
        assert.equal(
            result.selectedShippingMethod.description,
            'Order received within 7-10 business days'
        );
    });

    it('should get shipping methods and convert to a plain object', function () {
        var result = new ShippingModel(null, createShipmentShippingModel(), {});
        assert.equal(
            result.applicableShippingMethods[0].description,
            'Order received within 7-10 business days'
        );
        assert.equal(result.applicableShippingMethods[0].displayName, 'Ground');
        assert.equal(result.applicableShippingMethods[0].ID, '001');
        assert.equal(result.applicableShippingMethods[0].estimatedArrivalTime, '7-10 Business Days');
    });

    it('should set default shipping method when shippingMethodID is supplied', function () {
        var shippingMethodID = '002';
        var shippingMethod = {
            description: 'Order received in 2 business days',
            displayName: '2-Day Express',
            ID: '002',
            shippingCost: '$0.00',
            custom: {
                estimatedArrivalTime: '2 Business Days'
            }
        };
        var spy = sinon.spy(defaultShipment, 'setShippingMethod');
        spy.withArgs(shippingMethod);

        ShippingModel.selectShippingMethod(defaultShipment, shippingMethodID);

        assert.isTrue(spy.calledOnce);
        assert.isTrue(spy.withArgs(shippingMethod).calledOnce);
        defaultShipment.setShippingMethod.restore();
    });

    it('should set default shipping method when shippingMethodID is not supplied', function () {
        var shippingMethodID = null;
        var spy = sinon.spy(defaultShipment, 'setShippingMethod');
        spy.withArgs(null);

        ShippingModel.selectShippingMethod(defaultShipment, shippingMethodID);

        assert.isTrue(spy.calledOnce);
        assert.isTrue(spy.withArgs(null).calledOnce);
        defaultShipment.setShippingMethod.restore();
    });

    it('should set default shipping method when shippingMethods are supplied', function () {
        var shippingMethodID = '001';
        var shippingMethods = new ArrayList([
            {
                description: 'Order received within 7-10 business days',
                displayName: 'Ground',
                ID: '001',
                custom: {
                    estimatedArrivalTime: '7-10 Business Days'
                }
            }
        ]);
        var shippingMethod = {
            description: 'Order received within 7-10 business days',
            displayName: 'Ground',
            ID: '001',
            custom: {
                estimatedArrivalTime: '7-10 Business Days'
            }
        };
        var spy = sinon.spy(defaultShipment, 'setShippingMethod');
        spy.withArgs(shippingMethod);

        ShippingModel.selectShippingMethod(defaultShipment, shippingMethodID, shippingMethods);

        assert.isTrue(spy.calledOnce);
        assert.isTrue(spy.withArgs(shippingMethod).calledOnce);
        defaultShipment.setShippingMethod.restore();
    });
});

