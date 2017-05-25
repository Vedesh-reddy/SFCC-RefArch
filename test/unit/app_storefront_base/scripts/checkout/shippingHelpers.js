'use strict';

// shippingHelpers.js

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var sinon = require('sinon');
var ArrayList = require('../../../../mocks/dw.util.Collection');
var ShippingMethodModel = require('../../../../mocks/models/shippingMethod');

var shippingHelpers = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/checkout/shippingHelpers', {
    '~/cartridge/scripts/util/collections': proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/util/collections', {
         'dw/util/ArrayList': ArrayList
    }),

    'dw/order/ShippingMgr': require('../../../../mocks/dw/order/ShippingMgr'),

    '~/cartridge/models/shipping': require('../../../../mocks/models/shipping')
});


describe.only('shippingHelpers', function () {
    describe('getAddressFromRequest', function () {
        var request = {
            form: {
                firstName: 'Jane',
                lastName: 'Smith',
                address1: '5 Wall St.',
                address2: 'suite 10',
                city: 'Burlington',
                stateCode: 'MA',
                postalCode: '01803',
                countryCode: 'US',
                phone: '781-322-1010'
            }
        };

        it('should return the raw address JSON object from request.form', function () {
            var address = shippingHelpers.getAddressFromRequest(request);
            assert.equal(address.firstName, request.form.firstName);
            assert.equal(address.lastName, request.form.lastName);
            assert.equal(address.address1, request.form.address1);
            assert.equal(address.address2, request.form.address2);
            assert.equal(address.city, request.form.city);
            assert.equal(address.stateCode, request.form.stateCode);
            assert.equal(address.postalCode, request.form.postalCode);
            assert.equal(address.countryCode, request.form.countryCode);
            assert.equal(address.phone, request.form.phone);
        });

    });

    describe('getShipmentByUUID', function () {
        var basket = {
            shipments: new ArrayList([
                {
                    UUID: '00001'
                },
                {
                    UUID: '00002'
                },
                {
                    UUID: '00003'
                }
            ])
        };

        it('should return the existing shipment object', function () {
            var shipment = shippingHelpers.getShipmentByUUID(basket, '00002');
            assert.equal(shipment.UUID, '00002');
        });

        it('should return null when no shipment found', function () {
            var shipment = shippingHelpers.getShipmentByUUID(basket, '12345');
            assert.isNull(shipment);
        });
    });

    describe('selectShippingMethod', function () {

        var shipment = {
            UUID: '1234-1234-1234-1234',
            setShippingMethod: function (shippingMethod) {
                return shippingMethod;
            },
            shippingAddress: {
                stateCode: 'CA',
                postalCode: '97123'
            }
        };

        var shippingMethods = new ArrayList([
            {
                ID: '001',
                displayName: 'Ground',
                description: 'Order received within 7-10 business days',
                custom: {
                    estimatedArrivalTime: '7-10 Business Days'
                }
            },
            {
                ID: '002',
                displayName: '2-Day Express',
                description: 'Order received in 2 business days',
                custom: {
                    estimatedArrivalTime: '2 Business Days'
                }
            },
            {
                ID: '003',
                displayName: 'Overnight',
                description: 'Order received the next business day',
                custom: {
                    estimatedArrivalTime: 'Next Day'
                }
            }
        ]);

        var address = {
            stateCode: 'MA',
            postalCode: '01803'
        };

        it('should replace shipment.shippingAddress with the provided address', function () {
            var shippingMethodID = '002';

            shippingHelpers.selectShippingMethod(shipment, shippingMethodID, shippingMethods, address);

            assert.deepEqual(shipment.shippingAddress, address);
        });

        it('should make no change to shipment.shippingAddress when it is null', function () {
            var shippingMethodID = '002';

            var myShipment = {
                UUID: '1234-1234-1234-1234',
                setShippingMethod: function (shippingMethod) {
                    return shippingMethod;
                },
                shippingAddress: null
            };

            var expectedShippingAddress = null;

            shippingHelpers.selectShippingMethod(myShipment, shippingMethodID, shippingMethods, address);

            assert.equal(myShipment.shippingAddress, expectedShippingAddress);
        });


        it('should set shipping method when matching shippingMethodID is supplied', function () {
            var shippingMethodID = '002';
            var expectedShippingMethod = {
                ID: '002',
                displayName: '2-Day Express',
                description: 'Order received in 2 business days',
                custom: {
                    estimatedArrivalTime: '2 Business Days'
                }
            };

            var spy = sinon.spy(shipment, 'setShippingMethod');
            spy.withArgs(expectedShippingMethod);

            shippingHelpers.selectShippingMethod(shipment, shippingMethodID, shippingMethods, address);

            assert.isTrue(spy.calledOnce);
            assert.isTrue(spy.withArgs(expectedShippingMethod).calledOnce);

            shipment.setShippingMethod.restore();
        });

        it.only('should set default shipping method when no matching shippingMethodID found and applicable shipping methods contains default shipping method', function () {
            var shippingMethodID = 'IdNotExist';
            var expectedDefaultShipMethod = {
                ID: '001',
                displayName: 'Ground',
                description: 'Order received within 7-10 business days',
                custom: {
                    estimatedArrivalTime: '7-10 Business Days'
                }
            };

            var spy = sinon.spy(shipment, 'setShippingMethod');
            spy.withArgs(expectedDefaultShipMethod);

            shippingHelpers.selectShippingMethod(shipment, shippingMethodID, shippingMethods, address);

            assert.isTrue(spy.calledOnce);
            assert.isTrue(spy.withArgs(expectedDefaultShipMethod).calledOnce);
            shipment.setShippingMethod.restore();
        });

        it('should set first shipping method when no matching shippingMethodID found and applicable shipping methods exist but no default shipping method', function () {
            var shippingMethodID = 'IdNotExist';

            var shippingMethodList = new ArrayList([
                {
                    ID: '003',
                    displayName: 'Overnight',
                    description: 'Order received the next business day',
                    custom: {
                        estimatedArrivalTime: 'Next Day'
                    }
                },
                {
                    ID: '002',
                    displayName: '2-Day Express',
                    description: 'Order received in 2 business days',
                    custom: {
                        estimatedArrivalTime: '2 Business Days'
                    }
                }
            ]);

            var expectedShippingMethod = {
                ID: '003',
                displayName: 'Overnight',
                description: 'Order received the next business day',
                custom: {
                    estimatedArrivalTime: 'Next Day'
                }
            };

            var spy = sinon.spy(shipment, 'setShippingMethod');
            spy.withArgs(expectedShippingMethod);

            shippingHelpers.selectShippingMethod(shipment, shippingMethodID, shippingMethodList, address);

            assert.isTrue(spy.calledOnce);
            assert.isTrue(spy.withArgs(expectedShippingMethod).calledOnce);
            shipment.setShippingMethod.restore();
        });

        it('should set shipping method to null when no matching shippingMethodID found and applicable shipping methods not exist', function () {
            var shippingMethodID = 'IdNotExist';

            var shippingMethodList = new ArrayList([]);

            var spy = sinon.spy(shipment, 'setShippingMethod');
            spy.withArgs(null);

            shippingHelpers.selectShippingMethod(shipment, shippingMethodID, shippingMethodList, address);

            assert.isTrue(spy.calledOnce);
            assert.isTrue(spy.withArgs(null).calledOnce);
            shipment.setShippingMethod.restore();
        });

        it('should get shipping method from applicable shipping methods and given address that matched shippingMethodID', function () {
            var shippingMethodID = '002';

            var shippingMethodList = null;

            var expectedDefaultShipMethod = {
                ID: '002',
                displayName: '2-Day Express',
                description: 'Order received in 2 business days',
                shippingCost: '$0.00',
                custom: {
                    estimatedArrivalTime: '2 Business Days'
                }
            };

            var spy = sinon.spy(shipment, 'setShippingMethod');
            spy.withArgs(expectedDefaultShipMethod);

            shippingHelpers.selectShippingMethod(shipment, shippingMethodID, shippingMethodList, address);

            assert.isTrue(spy.calledOnce);
            assert.isTrue(spy.withArgs(expectedDefaultShipMethod).calledOnce);
            shipment.setShippingMethod.restore();
        });

        it('should set shipping method from applicable shipping methods when no address provided and matched shippingMethodID', function () {
            var shippingMethodID = '002';

            var shippingMethodList = null;
            var localAddress = null;

            var expectedDefaultShipMethod = {
                ID: '002',
                displayName: '2-Day Express',
                description: 'Order received in 2 business days',
                shippingCost: '$0.00',
                custom: {
                    estimatedArrivalTime: '2 Business Days'
                }
            };

            var spy = sinon.spy(shipment, 'setShippingMethod');
            spy.withArgs(expectedDefaultShipMethod);

            shippingHelpers.selectShippingMethod(shipment, shippingMethodID, shippingMethodList, localAddress);

            assert.isTrue(spy.calledOnce);
            assert.isTrue(spy.withArgs(expectedDefaultShipMethod).calledOnce);
            shipment.setShippingMethod.restore();
        });

        it('should not loop through the shipping methods to get shipping method when shipping method ID is not provided', function () {
            var shippingMethodID = null;
            var expectedDefaultShipMethod = {
                ID: '001',
                displayName: 'Ground',
                description: 'Order received within 7-10 business days',
                custom: {
                    estimatedArrivalTime: '7-10 Business Days'
                }
            };

            var spy = sinon.spy(shipment, 'setShippingMethod');
            spy.withArgs(expectedDefaultShipMethod);

            shippingHelpers.selectShippingMethod(shipment, shippingMethodID, shippingMethods, address);

            assert.isTrue(spy.calledOnce);
            assert.isTrue(spy.withArgs(expectedDefaultShipMethod).calledOnce);
            shipment.setShippingMethod.restore();
        });
    })
});
