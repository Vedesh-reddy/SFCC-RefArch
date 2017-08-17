'use strict';

var assert = require('chai').assert;
var QueryString = require('../../../../cartridges/modules/server/querystring');

describe('querystring', function () {
    describe('options parsing', function () {
        var params = 'dwopt_microsoft-xbox360-console_consoleWarranty=002&' +
            'dwopt_microsoft-xbox360-console_gpsWarranty=003';
        var querystring = new QueryString(params);
        it('should parse product option query parameters', function () {
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
            var paramsOutput = querystring.toString();
            assert.equal(paramsOutput, 'dwopt_microsoft-xbox360-console_consoleWarranty=002&' +
                'dwopt_microsoft-xbox360-console_gpsWarranty=003');
        });
    });

    describe('search refinements preferences parsing', function () {
        var params = 'prefn1=pref1&prefv1=pref1Value&prefn2=pref2&prefv2=pref2Value';
        var result = new QueryString(params);

        it('should parse search refinement preference query parameters', function () {
            assert.deepEqual(result.preferences, {
                pref1: 'pref1Value',
                pref2: 'pref2Value'
            });
        });

        it('should output preferences query params', function () {
            var paramsOutput = result.toString();
            assert.equal(paramsOutput, 'prefn1=pref1&prefn2=pref2&prefv1=pref1Value&prefv2=pref2Value');
        });
    });

    describe('handling special characters', function () {
        var params = '?trackOrderNumber=01&trackOrderPostal=EC1A+1BB';
        var result = new QueryString(params);

        it('should handle the \'+\' with a \'%20\' which leads to a \' \'', function () {
            assert.equal(result.trackOrderPostal, 'EC1A 1BB');
        });
    });
});
