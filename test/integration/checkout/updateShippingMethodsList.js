var assert = require('chai').assert;
var request = require('request-promise');
var config = require('../it.config');

/**
 * Test cases :
 * 1. ProductSurchargeCost : Add Jewelery to cart with MA should show surcharge cost
 * 2. When shipping to AK state, should return 2 applicableShipping methods only
 * 3. When shipping to MA state, should return 4 applicableShipping methods
 * 3. When Cart has over $100 product, shipping cost should be more for the same shipping method as #3 case
 * 4. When State 'State' = 'AA' and 'AE' and 'AP' should output UPS as a shipping method
 */

describe('Select different State in Shipping Form', function () {
    this.timeout(5000);

    describe('productSurchargeCost with below $100 order', function () {
        var cookieJar = request.jar();
        var cookie;
        before(function () {
            var qty1 = 1;
            var variantPid1 = '013742000443';
            var cookieString;

            var myRequest = {
                url: '',
                method: 'POST',
                rejectUnauthorized: false,
                resolveWithFullResponse: true,
                jar: cookieJar
            };
            myRequest.url = config.baseUrl + '/Cart-AddProduct?pid=' + variantPid1 + '&quantity=' + qty1;

            return request(myRequest)
                .then(function (response) {
                    assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');
                    cookieString = cookieJar.getCookieString(myRequest.url);
                })
                .then(function () {
                    cookie = request.cookie(cookieString);
                    cookieJar.setCookie(cookie, myRequest.url);
                });
        });

        it('should add surcharge to the Ground Shipping cost for jewelery', function (done) {
            var ExpectedResBody = {
                'totals': {
                    'subTotal': '$38.00',
                    'grandTotal': '$56.69',
                    'totalTax': '$2.70',
                    'totalShippingCost': '$15.99',
                    'orderLevelDiscountTotal': {
                        'formatted': '$0.00',
                        'value': 0
                    },
                    'shippingLevelDiscountTotal': {
                        'formatted': '$0.00',
                        'value': 0
                    },
                    'discounts': [],
                    'discountsHtml': '\n'
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
            var myRequest = {
                url: '',
                method: 'GET',
                rejectUnauthorized: false,
                resolveWithFullResponse: true,
                jar: cookieJar
            };
            myRequest.url = config.baseUrl + '/Checkout-UpdateShippingMethodsList?state=MA&postal=09876';
            return request(myRequest)
            // Handle response from request
                .then(function (response) {
                    assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');
                    var bodyAsJson = JSON.parse(response.body);

                    assert.deepEqual(bodyAsJson.totals, ExpectedResBody.totals, 'Actual response.totals not as expected.');
                    assert.deepEqual(bodyAsJson.shipping.applicableShippingMethods, ExpectedResBody.shipping.applicableShippingMethods, 'applicableShippingMethods not as expected.');
                    assert.deepEqual(bodyAsJson.shipping.shippingAddress, ExpectedResBody.shipping.shippingAddress, 'shippingAddress is not as expected');
                    assert.deepEqual(bodyAsJson.shipping.selectedShippingMethod, ExpectedResBody.shipping.selectedShippingMethod, 'selectedShippingMethod is not as expected');
                    done();
                });
        });
    });

    describe('productSurchargeCost with over $100 order', function () {
        var cookieJar = request.jar();
        var cookie;
        before(function () {
            var qty1 = 3;
            var variantPid1 = '013742000443';
            var cookieString;

            var myRequest = {
                url: '',
                method: 'POST',
                rejectUnauthorized: false,
                resolveWithFullResponse: true,
                jar: cookieJar
            };
            myRequest.url = config.baseUrl + '/Cart-AddProduct?pid=' + variantPid1 + '&quantity=' + qty1;

            return request(myRequest)
                .then(function (response) {
                    assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');
                    cookieString = cookieJar.getCookieString(myRequest.url);
                })
                .then(function () {
                    cookie = request.cookie(cookieString);
                    cookieJar.setCookie(cookie, myRequest.url);
                });
        });
        it('should add surcharge to the Ground Shipping cost for each jewelery item', function (done) {
            var ExpectedResBody = {
                'totals': {
                    'subTotal': '$114.00',
                    'grandTotal': '$159.59',
                    'totalTax': '$7.60',
                    'totalShippingCost': '$37.99',
                    'orderLevelDiscountTotal': {
                        'formatted': '$0.00',
                        'value': 0
                    },
                    'shippingLevelDiscountTotal': {
                        'formatted': '$0.00',
                        'value': 0
                    },
                    'discounts': [],
                    'discountsHtml': '\n'
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
            var myRequest = {
                url: '',
                method: 'GET',
                rejectUnauthorized: false,
                resolveWithFullResponse: true,
                jar: cookieJar
            };
            myRequest.url = config.baseUrl + '/Checkout-UpdateShippingMethodsList?state=MA&postal=09876';
            return request(myRequest)
            // Handle response from request
                .then(function (response) {
                    assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');
                    var bodyAsJson = JSON.parse(response.body);

                    assert.deepEqual(bodyAsJson.totals, ExpectedResBody.totals, 'Actual response.totals not as expected.');
                    assert.deepEqual(bodyAsJson.shipping.applicableShippingMethods, ExpectedResBody.shipping.applicableShippingMethods, 'applicableShippingMethods not as expected.');
                    assert.deepEqual(bodyAsJson.shipping.shippingAddress, ExpectedResBody.shipping.shippingAddress, 'shippingAddress is not as expected');
                    assert.deepEqual(bodyAsJson.shipping.selectedShippingMethod, ExpectedResBody.shipping.selectedShippingMethod, 'selectedShippingMethod is not as expected');
                    done();
                });
        });
    });
    describe('select state=AK in Shipping Form', function () {
        var cookieJar = request.jar();
        var cookie;
        before(function () {
            var qty1 = 1;
            var variantPid1 = '708141677371';
            var cookieString;

            var myRequest = {
                url: '',
                method: 'POST',
                rejectUnauthorized: false,
                resolveWithFullResponse: true,
                jar: cookieJar
            };
            myRequest.url = config.baseUrl + '/Cart-AddProduct?pid=' + variantPid1 + '&quantity=' + qty1;

            return request(myRequest)
                .then(function (response) {
                    assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');
                    cookieString = cookieJar.getCookieString(myRequest.url);
                })
                .then(function () {
                    cookie = request.cookie(cookieString);
                    cookieJar.setCookie(cookie, myRequest.url);
                });
        });

        it('should return 2 applicableShippingMethods for AK state', function (done) {
            var ExpectedResBody = {
                'totals': {
                    'subTotal': '$49.99',
                    'grandTotal': '$52.49',
                    'totalTax': '$2.50',
                    'totalShippingCost': '$0.00',
                    'orderLevelDiscountTotal': {
                        'formatted': '$0.00',
                        'value': 0
                    },
                    'shippingLevelDiscountTotal': {
                        'formatted': '$0.00',
                        'value': 0
                    },
                    'discounts': [],
                    'discountsHtml': '\n'
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
            var myRequest = {
                url: '',
                method: 'GET',
                rejectUnauthorized: false,
                resolveWithFullResponse: true,
                jar: cookieJar
            };
            myRequest.url = config.baseUrl + '/Checkout-UpdateShippingMethodsList?state=AK&postal=09876';
            return request(myRequest)
            // Handle response from request
                .then(function (response) {
                    assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');
                    var bodyAsJson = JSON.parse(response.body);

                    assert.deepEqual(bodyAsJson.totals, ExpectedResBody.totals, 'Actual response.totals not as expected.');
                    assert.deepEqual(bodyAsJson.shipping.applicableShippingMethods, ExpectedResBody.shipping.applicableShippingMethods, 'applicableShippingMethods not as expected.');
                    assert.deepEqual(bodyAsJson.shipping.shippingAddress, ExpectedResBody.shipping.shippingAddress, 'shippingAddress is not as expected');
                    assert.deepEqual(bodyAsJson.shipping.selectedShippingMethod, ExpectedResBody.shipping.selectedShippingMethod, 'selectedShippingMethod is not as expected');
                    done();
                });
        });
    });

    describe('select state=MA in Shipping Form', function () {
        var cookieJar = request.jar();
        var cookie;
        before(function () {
            var qty1 = 1;
            var variantPid1 = '708141677371';
            var cookieString;

            var myRequest = {
                url: '',
                method: 'POST',
                rejectUnauthorized: false,
                resolveWithFullResponse: true,
                jar: cookieJar
            };
            myRequest.url = config.baseUrl + '/Cart-AddProduct?pid=' + variantPid1 + '&quantity=' + qty1;

            return request(myRequest)
                .then(function (response) {
                    assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');
                    cookieString = cookieJar.getCookieString(myRequest.url);
                })
                .then(function () {
                    cookie = request.cookie(cookieString);
                    cookieJar.setCookie(cookie, myRequest.url);
                });
        });

        it('should return 4 applicableShippingMethods for MA state', function (done) {
            var ExpectedResBody = {
                'totals': {
                    'subTotal': '$49.99',
                    'grandTotal': '$58.78',
                    'totalTax': '$2.80',
                    'totalShippingCost': '$5.99',
                    'orderLevelDiscountTotal': {
                        'formatted': '$0.00',
                        'value': 0
                    },
                    'shippingLevelDiscountTotal': {
                        'formatted': '$0.00',
                        'value': 0
                    },
                    'discounts': [],
                    'discountsHtml': '\n'
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
            var myRequest = {
                url: '',
                method: 'GET',
                rejectUnauthorized: false,
                resolveWithFullResponse: true,
                jar: cookieJar
            };
            myRequest.url = config.baseUrl + '/Checkout-UpdateShippingMethodsList?state=MA&postal=09876';
            return request(myRequest)
            // Handle response from request
                .then(function (response) {
                    assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');
                    var bodyAsJson = JSON.parse(response.body);
                    assert.deepEqual(bodyAsJson.totals, ExpectedResBody.totals, 'Actual response.totals not as expected.');
                    assert.deepEqual(bodyAsJson.shipping.applicableShippingMethods, ExpectedResBody.shipping.applicableShippingMethods, 'applicableShippingMethods not as expected.');
                    assert.deepEqual(bodyAsJson.shipping.shippingAddress, ExpectedResBody.shipping.shippingAddress, 'shippingAddress is not as expected');
                    assert.deepEqual(bodyAsJson.shipping.selectedShippingMethod, ExpectedResBody.shipping.selectedShippingMethod, 'selectedShippingMethod is not as expected');
                    done();
                });
        });
    });
    describe('select State=MA with more than $100 order in Shipping Form', function () {
        var cookieJar = request.jar();
        var cookie;
        before(function () {
            var qty1 = 3;
            var variantPid1 = '708141677371';
            var cookieString;
            var myRequest = {
                url: '',
                method: 'POST',
                rejectUnauthorized: false,
                resolveWithFullResponse: true,
                jar: cookieJar
            };
            myRequest.url = config.baseUrl + '/Cart-AddProduct?pid=' + variantPid1 + '&quantity=' + qty1;
            return request(myRequest)
                .then(function (response) {
                    assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');
                    cookieString = cookieJar.getCookieString(myRequest.url);
                })
                .then(function () {
                    cookie = request.cookie(cookieString);
                    cookieJar.setCookie(cookie, myRequest.url);
                });
        });
        it('shipping cost should be increased for State=MA', function (done) {
            var ExpectedResBody = {
                'totals': {
                    'subTotal': '$149.97',
                    'grandTotal': '$165.86',
                    'totalTax': '$7.90',
                    'totalShippingCost': '$7.99',
                    'orderLevelDiscountTotal': {
                        'formatted': '$0.00',
                        'value': 0
                    },
                    'shippingLevelDiscountTotal': {
                        'formatted': '$0.00',
                        'value': 0
                    },
                    'discounts': [],
                    'discountsHtml': '\n'
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
            var myRequest = {
                url: '',
                method: 'GET',
                rejectUnauthorized: false,
                resolveWithFullResponse: true,
                jar: cookieJar
            };
            myRequest.url = config.baseUrl + '/Checkout-UpdateShippingMethodsList?state=MA&postal=09876';
            return request(myRequest)
            // Handle response from request
                .then(function (response) {
                    assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');
                    var bodyAsJson = JSON.parse(response.body);
                    assert.deepEqual(bodyAsJson.totals, ExpectedResBody.totals, 'Actual response.totals not as expected.');
                    assert.deepEqual(bodyAsJson.shipping.applicableShippingMethods, ExpectedResBody.shipping.applicableShippingMethods, 'applicableShippingMethods not as expected.');
                    assert.deepEqual(bodyAsJson.shipping.shippingAddress, ExpectedResBody.shipping.shippingAddress, 'shippingAddress is not as expected');
                    assert.deepEqual(bodyAsJson.shipping.selectedShippingMethod, ExpectedResBody.shipping.selectedShippingMethod, 'selectedShippingMethod is not as expected');
                    done();
                });
        });
    });

    describe('UPS as applicable shipping methods', function () {
        var cookieJar = request.jar();
        var cookie;
        before(function () {
            var qty1 = 1;
            var variantPid1 = '708141677371';
            var cookieString;

            var myRequest = {
                url: '',
                method: 'POST',
                rejectUnauthorized: false,
                resolveWithFullResponse: true,
                jar: cookieJar
            };
            myRequest.url = config.baseUrl + '/Cart-AddProduct?pid=' + variantPid1 + '&quantity=' + qty1;

            return request(myRequest)
                .then(function (response) {
                    assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');
                    cookieString = cookieJar.getCookieString(myRequest.url);
                })
                .then(function () {
                    cookie = request.cookie(cookieString);
                    cookieJar.setCookie(cookie, myRequest.url);
                });
        });
        it('should include UPS as an applicable shipping methods for AP state', function (done) {
            var ExpectedResBody = {
                'totals': {
                    'subTotal': '$49.99',
                    'grandTotal': '$52.49',
                    'totalTax': '$2.50',
                    'totalShippingCost': '$0.00',
                    'orderLevelDiscountTotal': {
                        'formatted': '$0.00',
                        'value': 0
                    },
                    'shippingLevelDiscountTotal': {
                        'formatted': '$0.00',
                        'value': 0
                    },
                    'discounts': [],
                    'discountsHtml': '\n'
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
                            'description': 'Order shipped by USPS received within 7-10 business days',
                            'displayName': 'USPS',
                            'ID': '021',
                            'shippingCost': '$5.99',
                            'estimatedArrivalTime': '7-10 Business Days'
                        }
                    ],
                    'shippingAddress': {
                        'ID': null,
                        'postalCode': '09876',
                        'stateCode': 'AP'
                    },
                    'selectedShippingMethod': {
                        'ID': '005',
                        'displayName': 'Store Pickup',
                        'description': 'Store Pickup',
                        'estimatedArrivalTime': null
                    }
                }
            };
            var myRequest = {
                url: '',
                method: 'GET',
                rejectUnauthorized: false,
                resolveWithFullResponse: true,
                jar: cookieJar
            };
            myRequest.url = config.baseUrl + '/Checkout-UpdateShippingMethodsList?state=AP&postal=09876';
            return request(myRequest)
            // Handle response from request
                .then(function (response) {
                    assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');
                    var bodyAsJson = JSON.parse(response.body);

                    assert.deepEqual(bodyAsJson.totals, ExpectedResBody.totals, 'Actual response.totals not as expected.');
                    assert.deepEqual(bodyAsJson.shipping.applicableShippingMethods, ExpectedResBody.shipping.applicableShippingMethods, 'applicableShippingMethods not as expected.');
                    assert.deepEqual(bodyAsJson.shipping.shippingAddress, ExpectedResBody.shipping.shippingAddress, 'shippingAddress is not as expected');
                    assert.deepEqual(bodyAsJson.shipping.selectedShippingMethod, ExpectedResBody.shipping.selectedShippingMethod, 'selectedShippingMethod is not as expected');
                    done();
                });
        });
    });
});
