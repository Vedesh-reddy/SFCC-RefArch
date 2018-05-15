'use strict';

var assert = require('chai').assert;

var shippingAddress1 = {
    address1: '1 Drury Lane',
    address2: null,
    countryCode: {
        displayValue: 'United States',
        value: 'US'
    },
    firstName: 'The Muffin',
    lastName: 'Man',
    city: 'Far Far Away',
    phone: '333-333-3333',
    postalCode: '04330',
    stateCode: 'ME'
};

var shippingAddress2 = {
    address1: '5 Wall Street',
    address2: null,
    countryCode: {
        displayValue: 'United States',
        value: 'US'
    },
    firstName: 'SF',
    lastName: '',
    city: 'Burlington',
    phone: '333-333-3333',
    postalCode: '01803',
    stateCode: 'MA'
};

var shipment1 = {
    UUID: '001',
    custom: {},
    shippingMethod: {
        ID: '001',
        displayName: 'Ground',
        description: 'Order received within 7-10 business days'
    },
    shippingAddress: shippingAddress1,
    isDefault: function () { return true; }
};

var shipment2 = {
    UUID: '002',
    custom: {
        fromStoreId: '005'
    },
    shippingMethod: {
        ID: '005',
        displayName: 'Store Pickup',
        description: 'Order pick up from store'
    },
    shippingAddress: shippingAddress2,
    isDefault: function () { return false; }
};

var customerAddress = {
    ID: 'Office',
    address1: '5 Wall Street',
    address2: null,
    countryCode: {
        displayValue: 'United States',
        value: 'US'
    },
    firstName: 'James',
    lastName: 'Bond',
    city: 'Burlington',
    phone: '333-333-3333',
    postalCode: '01803',
    stateCode: 'MA',
    isEquivalentAddress: function () { return false; }
};

var apiBasket = {
    shipments: []
};

var apiCustomer = {
    addressBook: {
        addresses: [customerAddress],
        preferredAddress: customerAddress
    }
};

describe('addressSelector', function () {
    var AddressSelectorModel = require('../../../mocks/models/addressSelector');

    it('should create address selector object for logged in user with saved address', function () {
        var basket = apiBasket;
        basket.shipments = [shipment1];
        var addressSelectorModel = new AddressSelectorModel(basket, apiCustomer);
        var expectedResult = {
            addresses: {
                shipmentAddresses: [
                    {
                        UUID: '001',
                        address: shippingAddress1,
                        isDefaultShipment: true,
                        isStore: false,
                        selectedCustomerAddressUUID: false,
                        shippingMethod: shipment1.shippingMethod
                    }
                ],
                customerAddresses: [
                    {
                        address: customerAddress,
                        isPreferredAddress: true
                    }
                ]
            }
        };

        assert.equal(addressSelectorModel.addresses.customerAddresses[0].address.ID, expectedResult.addresses.customerAddresses[0].address.ID);
        assert.equal(addressSelectorModel.addresses.customerAddresses[0].address.address1, expectedResult.addresses.customerAddresses[0].address.address1);
        assert.equal(addressSelectorModel.addresses.customerAddresses[0].isPreferredAddress, expectedResult.addresses.customerAddresses[0].isPreferredAddress);

        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].UUID, expectedResult.addresses.shipmentAddresses[0].UUID);
        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].address.address1, expectedResult.addresses.shipmentAddresses[0].address.address1);
        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].isDefaultShipment, expectedResult.addresses.shipmentAddresses[0].isDefaultShipment);
        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].isStore, expectedResult.addresses.shipmentAddresses[0].isStore);
        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].selectedCustomerAddressUUID, expectedResult.addresses.shipmentAddresses[0].selectedCustomerAddressUUID);
        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].selectedShippingMethod.ID, expectedResult.addresses.shipmentAddresses[0].shippingMethod.ID);
    });

    it('should create address selector object for logged in user with PDP store selected address', function () {
        var basket = apiBasket;
        basket.shipments = [shipment2];
        var addressSelectorModel = new AddressSelectorModel(basket, apiCustomer);
        var expectedResult = {
            addresses: {
                shipmentAddresses: [
                    {
                        UUID: '002',
                        address: shippingAddress2,
                        isDefaultShipment: false,
                        isStore: '005',
                        selectedCustomerAddressUUID: false,
                        shippingMethod: shipment2.shippingMethod
                    }
                ],
                customerAddresses: [
                    {
                        address: customerAddress,
                        isPreferredAddress: true
                    }
                ]
            }
        };

        assert.equal(addressSelectorModel.addresses.customerAddresses[0].address.ID, expectedResult.addresses.customerAddresses[0].address.ID);
        assert.equal(addressSelectorModel.addresses.customerAddresses[0].address.address1, expectedResult.addresses.customerAddresses[0].address.address1);
        assert.equal(addressSelectorModel.addresses.customerAddresses[0].isPreferredAddress, expectedResult.addresses.customerAddresses[0].isPreferredAddress);

        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].UUID, expectedResult.addresses.shipmentAddresses[0].UUID);
        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].address.address1, expectedResult.addresses.shipmentAddresses[0].address.address1);
        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].isDefaultShipment, expectedResult.addresses.shipmentAddresses[0].isDefaultShipment);
        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].isStore, expectedResult.addresses.shipmentAddresses[0].isStore);
        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].selectedCustomerAddressUUID, expectedResult.addresses.shipmentAddresses[0].selectedCustomerAddressUUID);
        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].selectedShippingMethod.ID, expectedResult.addresses.shipmentAddresses[0].shippingMethod.ID);
    });

    it('should create address selector object for guest user with empty shipment address', function () {
        var basket = apiBasket;
        basket.shipments = [];
        var customer = apiCustomer;
        customer.addressBook = null;
        var addressSelectorModel = new AddressSelectorModel(basket, customer);
        var expectedResult = {
            addresses: {
                shipmentAddresses: [],
                customerAddresses: []
            }
        };

        assert.deepEqual(addressSelectorModel, expectedResult);
    });

    it('should create address selector object for guest user with shipment address', function () {
        var customer = apiCustomer;
        customer.addressBook = null;
        var basket = apiBasket;
        basket.shipments = [shipment1];
        var addressSelectorModel = new AddressSelectorModel(basket, customer);
        var expectedResult = {
            addresses: {
                shipmentAddresses: [
                    {
                        UUID: '001',
                        address: shippingAddress1,
                        isDefaultShipment: true,
                        isStore: false,
                        selectedCustomerAddressUUID: false,
                        shippingMethod: shipment1.shippingMethod
                    }
                ],
                customerAddresses: []
            }
        };

        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].UUID, expectedResult.addresses.shipmentAddresses[0].UUID);
        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].address.address1, expectedResult.addresses.shipmentAddresses[0].address.address1);
        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].isDefaultShipment, expectedResult.addresses.shipmentAddresses[0].isDefaultShipment);
        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].isStore, expectedResult.addresses.shipmentAddresses[0].isStore);
        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].selectedCustomerAddressUUID, expectedResult.addresses.shipmentAddresses[0].selectedCustomerAddressUUID);
        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].selectedShippingMethod.ID, expectedResult.addresses.shipmentAddresses[0].shippingMethod.ID);
        assert.equal(addressSelectorModel.addresses.customerAddresses[0], expectedResult.addresses.customerAddresses[0]);
    });

    it('should create address selector object for guest user with PDP store selected address', function () {
        var customer = apiCustomer;
        customer.addressBook = null;
        var basket = apiBasket;
        basket.shipments = [shipment2];
        var addressSelectorModel = new AddressSelectorModel(basket, customer);
        var expectedResult = {
            addresses: {
                shipmentAddresses: [
                    {
                        UUID: '002',
                        address: shippingAddress2,
                        isDefaultShipment: false,
                        isStore: '005',
                        selectedCustomerAddressUUID: false,
                        shippingMethod: shipment2.shippingMethod
                    }
                ],
                customerAddresses: []
            }
        };

        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].UUID, expectedResult.addresses.shipmentAddresses[0].UUID);
        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].address.address1, expectedResult.addresses.shipmentAddresses[0].address.address1);
        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].isDefaultShipment, expectedResult.addresses.shipmentAddresses[0].isDefaultShipment);
        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].isStore, expectedResult.addresses.shipmentAddresses[0].isStore);
        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].selectedCustomerAddressUUID, expectedResult.addresses.shipmentAddresses[0].selectedCustomerAddressUUID);
        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].selectedShippingMethod.ID, expectedResult.addresses.shipmentAddresses[0].shippingMethod.ID);
        assert.equal(addressSelectorModel.addresses.shipmentAddresses[0].UUID, expectedResult.addresses.shipmentAddresses[0].UUID);
    });
});
