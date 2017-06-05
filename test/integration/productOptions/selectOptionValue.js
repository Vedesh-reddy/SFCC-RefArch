var assert = require('chai').assert;
var request = require('request-promise');
var config = require('../it.config');
var cheerio = require('cheerio');

describe('Select productOption value', function () {
    this.timeout(5000);

    it('should be able to select a productOption Value for simple product', function () {
        var pid = 'mitsubishi-wd-73736';
        var optionValue = '001';

        var myRequest = {
            url: config.baseUrl + '/Product-Option?pid=' + pid + '&dwopt_mitsubishi-wd-73736_tvWarranty=' + optionValue,
            method: 'POST',
            rejectUnauthorized: false,
            resolveWithFullResponse: true
        };

        return request(myRequest, function (error, response) {
            var bodyAsJson = JSON.parse(response.body);
            assert.equal(response.statusCode, 200, 'Expected Product-Option call statusCode to be 200');
            assert.equal(bodyAsJson.options[0].selectedValueId, '001', 'selectedValueId should be 001');
            var $ = cheerio.load(bodyAsJson.priceHtml);
            var value = $('.value').text();
            assert.equal(value, '$2,299.98', 'expected unit price is $2,299.98');
            assert.equal(bodyAsJson.options[0].values[0].id, '000');
            assert.equal(bodyAsJson.options[0].values[0].displayValue, 'None');
            assert.equal(bodyAsJson.options[0].values[0].price, '$0.00');
            assert.equal(bodyAsJson.options[0].values[1].id, '001');
            assert.equal(bodyAsJson.options[0].values[1].displayValue, '1 Year Warranty');
            assert.equal(bodyAsJson.options[0].values[1].price, '$49.99');
            assert.equal(bodyAsJson.options[0].values[2].id, '002');
            assert.equal(bodyAsJson.options[0].values[2].displayValue, '3 Year Warranty');
            assert.equal(bodyAsJson.options[0].values[2].price, '$99.99');
            assert.equal(bodyAsJson.options[0].values[3].id, '003');
            assert.equal(bodyAsJson.options[0].values[3].displayValue, '5 Year Warranty');
            assert.equal(bodyAsJson.options[0].values[3].price, '$129.99');
        });
    });
});
