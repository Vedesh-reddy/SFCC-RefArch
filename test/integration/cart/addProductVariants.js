var assert = require('chai').assert;
var request = require('request-promise');
var config = require('../it.config');


describe('Add Product variants to cart', function () {
    // Currently the Cart-AddProduct service call only returns 'quantityTotal' property
    // and there is no service call to get cart that returns JSON. In the future when
    // Cart-AddProduct is enhanced to return mini-cart, this test will need to be enhanced
    // to accomodate the change.
    it('should add variants of different and same products, returns total quantity of added items', function () {
        // The postRequest object will be reused through out this file. The 'jar' property will be set once.
        // The 'url' property will be updated on every request to set the product ID (pid) and quantity.
        // All other properties remained unchanged.
        var postRequest = {
            url: '',
            method: 'POST',
            rejectUnauthorized: false,
            resolveWithFullResponse: true,
            jar: true
        };

        var totalQty;

        // ----- adding product #1:
        var variantPid = '701643421084';
        var qty1 = 2;
        totalQty = qty1;
        postRequest.url = config.baseUrl + '/Cart-AddProduct?pid=' + variantPid + '&quantity=' + qty1;

        var expectedResBody = {
            'quantityTotal': totalQty
        };

        return request(postRequest)
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');

                var bodyAsJson = JSON.parse(response.body);
                assert.deepEqual(bodyAsJson, expectedResBody, 'Actual response body from adding product 1 not as expected.');
            })

            // ----- adding product #2, a different variant of same product 1:
            .then(function () {
                var variantPid2 = '701642923459';
                var qty2 = 1;
                totalQty += qty2;

                postRequest.url = config.baseUrl + '/Cart-AddProduct?pid=' + variantPid2 + '&quantity=' + qty2;

                return request(postRequest);
            })

            // Handle response from request #2
            .then(function (response2) {
                assert.equal(response2.statusCode, 200, 'Expected statusCode to be 200.');

                var expectedResBody2 = {
                    'quantityTotal': totalQty
                };

                var bodyAsJson2 = JSON.parse(response2.body);
                assert.deepEqual(bodyAsJson2, expectedResBody2, 'Actual response body from adding product 2 not as expected.');
            })

            // ----- adding product #3:
            .then(function () {
                var variantPid3 = '013742000252';
                var qty3 = 11;
                totalQty += qty3;

                postRequest.url = config.baseUrl + '/Cart-AddProduct?pid=' + variantPid3 + '&quantity=' + qty3;
                return request(postRequest);
            })

            // Handle response from request #3
            .then(function (response3) {
                assert.equal(response3.statusCode, 200, 'Expected statusCode to be 200.');

                var expectedResBody3 = {
                    'quantityTotal': totalQty
                };

                var bodyAsJson3 = JSON.parse(response3.body);
                assert.deepEqual(bodyAsJson3, expectedResBody3, 'Actual response body from adding product 3 not as expected.');
            })

            // ----- adding product #4:
            .then(function () {
                var variantPid4 = '029407331258';
                var qty4 = 3;
                totalQty += qty4;

                postRequest.url = config.baseUrl + '/Cart-AddProduct?pid=' + variantPid4 + '&quantity=' + qty4;
                return request(postRequest);
            })

            // Handle response from request #4
            .then(function (response4) {
                assert.equal(response4.statusCode, 200, 'Expected statusCode to be 200.');

                var expectedResBody4 = {
                    'quantityTotal': totalQty
                };

                var bodyAsJson4 = JSON.parse(response4.body);
                assert.deepEqual(bodyAsJson4, expectedResBody4, 'Actual response body from adding product 4 not as expected.');
            });
    });
});
