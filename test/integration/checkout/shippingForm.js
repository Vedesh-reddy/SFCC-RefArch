var assert = require('chai').assert;
var request = require('request-promise');
var config = require('../it.config');

/**
 * Test cases :
 * 1. ProductSurchargeCost : Add Jewelery to cart with MA should show surcharge cost (Phase2)
 * 2. When shipping to AK state, should return 2 applicableShipping methods only
 * 3. When shipping to MA state, should return 4 applicableShipping methods
 * 3. When Cart has over $100 product, shipping cost should be more for the same shipping method as #3 case
 */

describe('Shipping Form', function () {
    this.timeout(5000);

    describe('UpdateShippingMethodList', function () {
        it('should return 2 applicableShippingMethods for AK state', function (done) {
            var cookieJar = request.jar();
            var qty1 = 1;
            var variantPid1 = '708141677371';
            var cookieString;
            var myRequestAddProduct = {
                url: config.baseUrl + '/Cart-AddProduct?pid=' + variantPid1 + '&quantity=' + qty1,
                method: 'POST',
                rejectUnauthorized: false,
                resolveWithFullResponse: true,
                jar: cookieJar
            };
            var myRequestCheckout = {
                url: config.baseUrl + '/Checkout-UpdateShippingMethodsList?state=AK&postal=09876',
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
                    var bodyAsJson = JSON.parse(response2.body);

                    assert.deepEqual(bodyAsJson.totals, ExpectedResBody.totals, 'Actual response.totals not as expected.');
                    assert.deepEqual(bodyAsJson.shipping.applicableShippingMethods, ExpectedResBody.shipping.applicableShippingMethods, 'applicableShippingMethods not as expected.');
                    assert.deepEqual(bodyAsJson.shipping.shippingAddress, ExpectedResBody.shipping.shippingAddress, 'shippingAddress is not as expected');
                    assert.deepEqual(bodyAsJson.shipping.selectedShippingMethod, ExpectedResBody.shipping.selectedShippingMethod, 'selectedShippingMethod is not as expected');
                    done();
                });
        });

        it('should return 4 applicableShippingMethods for MA state', function (done) {
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
            var url = config.baseUrl + '/Checkout-UpdateShippingMethodsList?state=MA&postal=09876';
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
                    'grandTotal': '$58.78',
                    'totalTax': '$2.80',
                    'totalShippingCost': '$5.99'
                },
                'shipping': {
                    'applicableShippingMethods': [
                        {
                            'description': 'Order received within 7-10 business days',
                            'displayName': 'Ground',
                            'ID': '001',
                            'shippingCost': '$5.99',
                            'estimatedArrivalTime': '7-10 Business Days'
                        },
                        {
                            'description': 'Order received in 2 business days',
                            'displayName': '2-Day Express',
                            'ID': '002',
                            'shippingCost': '$9.99',
                            'estimatedArrivalTime': '2 Business Days'
                        },
                        {
                            'description': 'Order received the next business day',
                            'displayName': 'Overnight',
                            'ID': '003',
                            'shippingCost': '$15.99',
                            'estimatedArrivalTime': 'Next Day'
                        },
                        {
                            'description': 'Store Pickup',
                            'displayName': 'Store Pickup',
                            'ID': '005',
                            'shippingCost': '$0.00',
                            'estimatedArrivalTime': null
                        }
                    ],
                    'shippingAddress': {
                        'ID': null,
                        'postalCode': '09876',
                        'stateCode': 'MA'
                    },
                    'selectedShippingMethod': {
                        'ID': '001',
                        'displayName': 'Ground',
                        'description': 'Order received within 7-10 business days',
                        'estimatedArrivalTime': '7-10 Business Days'
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
                    var bodyAsJson = JSON.parse(response2.body);
                    assert.deepEqual(bodyAsJson.totals, ExpectedResBody.totals, 'Actual response.totals not as expected.');
                    assert.deepEqual(bodyAsJson.shipping.applicableShippingMethods, ExpectedResBody.shipping.applicableShippingMethods, 'applicableShippingMethods not as expected.');
                    assert.deepEqual(bodyAsJson.shipping.shippingAddress, ExpectedResBody.shipping.shippingAddress, 'shippingAddress is not as expected');
                    assert.deepEqual(bodyAsJson.shipping.selectedShippingMethod, ExpectedResBody.shipping.selectedShippingMethod, 'selectedShippingMethod is not as expected');
                    done();
                });
        });
        it('bigger order should cost more shipping for the same shipping method', function (done) {
            var cookieJar = request.jar();
            var qty1 = 3;
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
            var url = config.baseUrl + '/Checkout-UpdateShippingMethodsList?state=MA&postal=09876';
            var myRequestCheckout = {
                url: url,
                method: 'GET',
                rejectUnauthorized: false,
                resolveWithFullResponse: true,
                jar: cookieJar
            };
            var ExpectedResBody = {
                'totals': {
                    'subTotal': '$149.97',
                    'grandTotal': '$165.86',
                    'totalTax': '$7.90',
                    'totalShippingCost': '$7.99'
                },
                'shipping': {
                    'applicableShippingMethods': [
                        {
                            'description': 'Order received within 7-10 business days',
                            'displayName': 'Ground',
                            'ID': '001',
                            'shippingCost': '$7.99',
                            'estimatedArrivalTime': '7-10 Business Days'
                        },
                        {
                            'description': 'Order received in 2 business days',
                            'displayName': '2-Day Express',
                            'ID': '002',
                            'shippingCost': '$11.99',
                            'estimatedArrivalTime': '2 Business Days'
                        },
                        {
                            'description': 'Order received the next business day',
                            'displayName': 'Overnight',
                            'ID': '003',
                            'shippingCost': '$19.99',
                            'estimatedArrivalTime': 'Next Day'
                        },
                        {
                            'description': 'Store Pickup',
                            'displayName': 'Store Pickup',
                            'ID': '005',
                            'shippingCost': '$0.00',
                            'estimatedArrivalTime': null
                        }
                    ],
                    'shippingAddress': {
                        'ID': null,
                        'postalCode': '09876',
                        'stateCode': 'MA'
                    },
                    'selectedShippingMethod': {
                        'ID': '001',
                        'displayName': 'Ground',
                        'description': 'Order received within 7-10 business days',
                        'estimatedArrivalTime': '7-10 Business Days'
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
                    var bodyAsJson = JSON.parse(response2.body);
                    assert.deepEqual(bodyAsJson.totals, ExpectedResBody.totals, 'Actual response.totals not as expected.');
                    assert.deepEqual(bodyAsJson.shipping.applicableShippingMethods, ExpectedResBody.shipping.applicableShippingMethods, 'applicableShippingMethods not as expected.');
                    assert.deepEqual(bodyAsJson.shipping.shippingAddress, ExpectedResBody.shipping.shippingAddress, 'shippingAddress is not as expected');
                    assert.deepEqual(bodyAsJson.shipping.selectedShippingMethod, ExpectedResBody.shipping.selectedShippingMethod, 'selectedShippingMethod is not as expected');
                    done();
                });
        });
    });
});
