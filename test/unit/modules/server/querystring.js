'use strict';

var assert = require('chai').assert;
var QueryString = require('../../../../cartridges/modules/server/queryString');

describe('querystring', function () {
    describe('options parsing', function () {
        it('should parse product option query parameters', function () {
            var params = 'dwopt_microsoft-xbox360-console_consoleWarranty=002&' +
            'dwopt_microsoft-xbox360-console_gpsWarranty=003';
            var querystring = new QueryString(params);
            var expected = {
                options: [{
                    optionId: 'gpsWarranty',
                    productId: 'microsoft-xbox360-console',
                    selectedValueId: '003'
                }, {
                    optionId: 'consoleWarranty',
                    productId: 'microsoft-xbox360-console',
                    selectedValueId: '002'
                }]
            };
            assert.deepEqual(expected[0], querystring[0]);
            assert.deepEqual(expected[1], querystring[1]);
        });

        it('should output options query params', function () {
            var params = 'dwopt_microsoft-xbox360-console_consoleWarranty=002&' +
            'dwopt_microsoft-xbox360-console_gpsWarranty=003';
            var querystring = new QueryString(params);
            var paramsOutput = querystring.toString();
            assert.equal(paramsOutput, 'dwopt_microsoft-xbox360-console_consoleWarranty=002&' +
                'dwopt_microsoft-xbox360-console_gpsWarranty=003');
        });
    });

    describe('search refinements preferences parsing', function () {
        it('should parse search refinement preference query parameters', function () {
            var params = 'prefn1=pref1&prefv1=pref1Value&prefn2=pref2&prefv2=pref2Value';
            var result = new QueryString(params);
            assert.deepEqual(result.preferences, {
                pref1: 'pref1Value',
                pref2: 'pref2Value'
            });
        });

        it('should output preferences query params', function () {
            var params = 'prefn1=pref1&prefv1=pref1Value&prefn2=pref2&prefv2=pref2Value';
            var result = new QueryString(params);
            var paramsOutput = result.toString();
            assert.equal(paramsOutput, 'prefn1=pref1&prefn2=pref2&prefv1=pref1Value&prefv2=pref2Value');
        });

        it('should parse search refinement preference range query parameters', function () {
            var rangeParams = 'prefn1=prefName&prefmin1=0&prefmax1=100';
            var rangeResult = new QueryString(rangeParams);
            assert.deepEqual(rangeResult.preferences, {
                prefName: {
                    min: '0',
                    max: '100'
                }
            });
        });
        it('should output range preference query params', function () {
            var rangeParams = 'prefn1=prefName&prefmin1=0&prefmax1=100';
            var rangeResult = new QueryString(rangeParams);
            var paramsOutput = rangeResult.toString();
            assert.deepEqual(paramsOutput, 'prefmax1=100&prefmin1=0&prefn1=prefName');
        });
    });

    describe('handling special characters', function () {
        it('should handle the \'+\' with a \'%20\' which leads to a \' \'', function () {
            var params = '?trackOrderNumber=01&trackOrderPostal=EC1A+1BB';
            var result = new QueryString(params);

            assert.equal(result.trackOrderPostal, 'EC1A 1BB');
        });
    });
    describe('handling url encoding of querystring', function () {
        it('should handle encoding properly', function () {
            var params = '?dwvar_P12345_Maat=37%2B&pid=P12345';
            var result = new QueryString(params);
            assert.equal(result.toString(), 'dwvar_P12345_Maat=37%2B&pid=P12345');
        });
    });
});
