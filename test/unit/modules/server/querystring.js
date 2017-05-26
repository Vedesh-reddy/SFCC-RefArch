'use strict';

var assert = require('chai').assert;
var QueryString = require('../../../../cartridges/modules/server/querystring');

describe('querystring', function () {
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
});
