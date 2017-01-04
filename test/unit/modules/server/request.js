'use strict';

var Request = require('../../../../cartridges/modules/server/request');
var assert = require('chai').assert;

var ArrayList = require('../../../mocks/dw.util.Collection');

function createFakeRequest(overrides) {
    overrides = overrides || {}; // eslint-disable-line no-param-reassign
    var globalRequest = {
        httpMethod: 'GET',
        httpHost: 'localhost',
        httpPath: '/Product-Show',
        httpQueryString: '',
        isHttpSecure: function () {
            return false;
        },
        geolocation: {
            countryCode: 'US',
            latitude: 42.4019,
            longitude: -71.1193
        },
        customer: {
            profile: {
                firstName: 'John',
                lastName: 'Snow',
                email: 'jsnow@starks.com',
                phoneHome: '1234567890',
                wallet: {
                    paymentInstruments: new ArrayList([
                        {
                            creditCardExpirationMonth: '3',
                            creditCardExpirationYear: '2019',
                            maskedCreditCardNumber: '***********4215',
                            creditCardType: 'Visa'
                        }
                    ])
                }
            },
            addressBook: {
                preferredAddress: {
                    address1: '15 South Point Drive',
                    address2: null,
                    city: 'Boston',
                    countryCode: {
                        displayValue: 'United States',
                        value: 'US'
                    },
                    firstName: 'John',
                    lastName: 'Snow',
                    ID: 'Home',
                    postalCode: '02125',
                    stateCode: 'MA'
                }
            }
        }
    };
    Object.keys(overrides).forEach(function (key) {
        globalRequest[key] = overrides[key];
    });
    return globalRequest;
}

describe('request', function () {
    it('should parse empty query string', function () {
        var req = new Request(createFakeRequest(), createFakeRequest().customer);
        assert.isObject(req.querystring);
        assert.equal(Object.keys(req.querystring).length, 0);
    });
    it('should parse simple query string', function () {
        var req = new Request(createFakeRequest({ httpQueryString: 'id=22&name=foo' }), createFakeRequest().customer);
        assert.isObject(req.querystring);
        assert.equal(req.querystring.id, 22);
        assert.equal(req.querystring.name, 'foo');
    });
    it('should parse query string with variables', function () {
        var req = new Request(createFakeRequest({
            httpQueryString: 'dwvar_foo_color=1111&dwvar_bar_size=32'
        }), createFakeRequest().customer);
        assert.equal(req.querystring.variables.color.id, 'foo');
        assert.equal(req.querystring.variables.color.value, '1111');
        assert.equal(req.querystring.variables.size.id, 'bar');
        assert.equal(req.querystring.variables.size.value, '32');
        assert.notProperty(req.querystring, 'dwvar_foo_color');
        assert.notProperty(req.querystring, 'dwvar_bar_size');
    });
    it('should parse query string with incorrectly formatted variables', function () {
        var req = new Request(createFakeRequest({
            httpQueryString: 'dwvar_color=1111&dwvar_size=32'
        }), createFakeRequest().customer);
        assert.equal(req.querystring.dwvar_color, '1111');
        assert.equal(req.querystring.dwvar_size, '32');
        assert.notProperty(req.querystring, 'variables');
    });
    it('should contain correct geolocation object and properties', function () {
        var req = new Request(createFakeRequest(), createFakeRequest().customer);
        assert.equal(req.geolocation.countryCode, 'US');
        assert.equal(req.geolocation.latitude, 42.4019);
        assert.equal(req.geolocation.longitude, -71.1193);
    });
    it('should contain correct current customer profile and properties', function () {
        var req = new Request(createFakeRequest(), createFakeRequest().customer);
        assert.equal(req.currentCustomer.profile.firstName, 'John');
        assert.equal(req.currentCustomer.profile.lastName, 'Snow');
        assert.equal(req.currentCustomer.profile.email, 'jsnow@starks.com');
        assert.equal(req.currentCustomer.profile.phone, '1234567890');
    });
    it('should contain correct current customer address book and properties', function () {
        var req = new Request(createFakeRequest(), createFakeRequest().customer);
        assert.equal(
            req.currentCustomer.addressBook.preferredAddress.address1,
            '15 South Point Drive'
        );
        assert.equal(
            req.currentCustomer.addressBook.preferredAddress.address2,
            null
        );
        assert.equal(
            req.currentCustomer.addressBook.preferredAddress.city,
            'Boston'
        );
        assert.equal(
            req.currentCustomer.addressBook.preferredAddress.countryCode.displayValue,
            'United States'
        );
        assert.equal(
            req.currentCustomer.addressBook.preferredAddress.countryCode.value,
            'US'
        );
        assert.equal(
            req.currentCustomer.addressBook.preferredAddress.firstName,
            'John'
        );
        assert.equal(
            req.currentCustomer.addressBook.preferredAddress.lastName,
            'Snow'
        );
        assert.equal(
            req.currentCustomer.addressBook.preferredAddress.ID,
            'Home'
        );
        assert.equal(
            req.currentCustomer.addressBook.preferredAddress.postalCode,
            '02125'
        );
        assert.equal(
            req.currentCustomer.addressBook.preferredAddress.stateCode,
            'MA'
        );
    });
    it('should contain correct current customer wallet and properties', function () {
        var req = new Request(createFakeRequest(), createFakeRequest().customer);
        var expectedResult = createFakeRequest();
        assert.deepEqual(
            req.currentCustomer.wallet.paymentInstrument,
            expectedResult.customer.profile.wallet.paymentInstruments[0]
        );
    });
    it('should not fail if customer doesn not exist', function () {
        var req = new Request(createFakeRequest({ customer: null }), null);
        assert.equal(req.host, 'localhost');
    });
    it('should not fail if customer does not have a profile', function () {
        var req = new Request(createFakeRequest({ customer: { profile: null } }), { profile: null });
        assert.equal(req.currentCustomer.raw.profile, null);
    });
    it('should retrieve form properties', function () {
        var items = {
            one: { rawValue: 1 },
            two: { rawValue: 2 },
            three: { rawValue: 3 },
            submitted: { },
            id: { rawValue: 22 },
            name: { rawValue: 'foo' }
        };
        var httpParamMap = {
            parameterNames: {
                iterator: function () {
                    var index = 0;
                    return {
                        hasNext: function () {
                            return index < Object.keys(items).length - 1;
                        },
                        next: function () {
                            var value = Object.keys(items)[index];
                            index++;
                            return value;
                        }
                    };
                },
                length: Object.keys(items).length
            },
            get: function (name) {
                return items[name];
            }
        };
        var req = new Request(createFakeRequest({ httpParameterMap: httpParamMap, httpQueryString: 'id=22&name=foo' }));
        assert.equal(req.form.one, 1);
        assert.equal(req.form.two, 2);
        assert.equal(req.form.three, 3);
        assert.isUndefined(req.form.submitted);
        assert.isUndefined(req.form.id);
    });
});
