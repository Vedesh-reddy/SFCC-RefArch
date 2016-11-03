var assert = require('chai').assert;
var request = require('request-promise');
var config = require('../it.config');
//1. Jewelery to cart with MA should show sur charge
//2. AK state, ground shipping is not available.


describe('Shipping Form', function () {
    this.timeout(5000);

    describe('UpdateShippingMethodList', function () {
        it('should return 2 shippingMethods', function (done) {
            var cookieJar = request.jar();
            var qty1 = 1;
            var variantPid1 = '708141677371';
            var cookieString;
            var myRequestAddProduct = {
                url: '',
                method: 'POST',
                rejectUnauthorized: false,
                resolveWithFullResponse: true,
                jar: cookieJar
            };
            myRequestAddProduct.url = config.baseUrl + '/Cart-AddProduct?pid=' + variantPid1 + '&quantity=' + qty1;
            var url = config.baseUrl + '/Checkout-UpdateShippingMethodsList?state=AK&postal=09876';
            var myRequestCheckout = {
                url: url,
                method: 'GET',
                rejectUnauthorized: false,
                resolveWithFullResponse: true,
                jar: cookieJar
            };
            var ExpectedResBody = {
                'totals': {
                    'subTotal': '$49.99',
                    'grandTotal': '$52.49',
                    'totalTax': '$2.50',
                    'totalShippingCost': '$0.00'
                },
                'shipping': {
                    'applicableShippingMethods': [
                        {
                            'description': 'Store Pickup',
                            'displayName': 'Store Pickup',
                            'ID': '005',
                            'shippingCost': '$0.00',
                            'estimatedArrivalTime': null
                        },
                        {
                            'description': 'Orders shipped outside continental US received in 2-3 business days',
                            'displayName': 'Express',
                            'ID': '012',
                            'shippingCost': '$16.99',
                            'estimatedArrivalTime': '2-3 Business Days'
                        }
                    ],
                    'shippingAddress': {
                        'ID': null,
                        'postalCode': '09876',
                        'stateCode': 'AK'
                    },
                    'selectedShippingMethod': {
                        'ID': '005',
                        'displayName': 'Store Pickup',
                        'description': 'Store Pickup',
                        'estimatedArrivalTime': null
                    }
                }
            };

            return request(myRequestAddProduct)
                .then(function (response) {
                    assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');
                    cookieString = cookieJar.getCookieString(myRequestAddProduct.url);
                })
                .then(function () {
                    var cookie = request.cookie(cookieString);
                    cookieJar.setCookie(cookie, myRequestCheckout.url);

                    return request(myRequestCheckout);
                })

                // Handle response from request #2
                .then(function (response2) {
                    assert.equal(response2.statusCode, 200, 'Expected statusCode to be 200.');
                    //console.log('response2 body = ' + response2.body);
                    var bodyAsJson = JSON.parse(response2.body);

                    assert.deepEqual(bodyAsJson.totals, ExpectedResBody.totals, 'Actual response.totals not as expected.');
                    assert.deepEqual(bodyAsJson.shipping, ExpectedResBody.shipping, 'Actual response.shipping not as expected.');
                    done();
                })

        });
    })
})
