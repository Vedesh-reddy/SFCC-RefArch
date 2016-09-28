var assert = require('chai').assert;
var request = require('request-promise');
var config = require('../it.config');
var jsonHelpers = require('../helpers/jsonUtils');

describe('Cart: Selecting Shipping Methods', function () {
    this.timeout(5000);

    var variantPid1 = '740357440196';
    var qty1 = 1;
    var variantPid2 = '013742335538';
    var qty2 = 1;

    var cookieJar = request.jar();
    var myRequest = {
        url: '',
        method: 'POST',
        rejectUnauthorized: false,
        resolveWithFullResponse: true,
        jar: cookieJar
    };

    var cookieString;
    var hostname = config.baseUrl.split('/')[2];

    // This is not a complete expected response as properties "totals", "selectedShippingMethod" have different
    // values depending on on the selected shipping method and thus they are not included here.
    // Leaving the commented out 'src' property here for reference because it should be included in the
    // 'image' property in the response but the string can not be used for comparison as it because
    // the path has radomly generated code.
    var expectedResponseCommon = {
        'locale': {
            'countryCode': 'US',
            'name': 'United States',
            'continent': 'northamerica',
            'availableLocales': [
                'en_US'
            ],
            'currencyCode': 'USD',
            'tax': 'net'
        },
        'actionUrls': {
            'removeProductLineItemUrl': '/on/demandware.store/Sites-SiteGenesis-Site/en_US/Cart-RemoveProductLineItem',
            'updateQuantityUrl': '/on/demandware.store/Sites-SiteGenesis-Site/en_US/Cart-UpdateQuantity',
            'selectShippingUrl': '/on/demandware.store/Sites-SiteGenesis-Site/en_US/Cart-SelectShippingMethod'
        },
        'numOfShipments': 1,
        'shippingMethods': [
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
            },
            {
                'description': 'Orders shipped outside continental US received in 2-3 business days',
                'displayName': 'Express',
                'ID': '012',
                'shippingCost': '$22.99',
                'estimatedArrivalTime': '2-3 Business Days'
            },
            {
                'description': 'Order shipped by USPS received within 7-10 business days',
                'displayName': 'USPS',
                'ID': '021',
                'shippingCost': '$7.99',
                'estimatedArrivalTime': '7-10 Business Days'
            }
        ],
        'items': [
            {
                'type': 'Product',
                'url': 'http://' + hostname + '/s/SiteGenesis/prancer/' + variantPid1 + '.html?lang=en_US',
                'variationAttributes': [
                    {
                        'displayName': 'Color',
                        'displayValue': 'Pink'
                    },
                    {
                        'displayName': 'Size',
                        'displayValue': '7.5'
                    },
                    {
                        'displayName': 'Width',
                        'displayValue': 'M'
                    }
                ],
                'quantity': 1,
                'quantityOptions': {
                    'minOrderQuantity': 1,
                    'maxOrderQuantity': 10
                },
                'priceModelPricing': {
                    'value': 99,
                    'currency': 'USD',
                    'formatted': '$99.00',
                    'type': 'standard'
                },
                'priceTotal': '$99.00',
                'name': 'Prancer',
                'isBundle': false,
                'isMaster': false,
                'isProductSet': false,
                'isVariant': true,
                'isBonusProductLineItem': false,
                'isGift': false,
                'isOrderable': true,
                'productID': '740357440196',
                'UUID': '',
                'image': {
                    // 'src': '/on/demandware.static/-/Sites-apparel-catalog/default/dwd56b7098/images/small/PG.CJPRANCER.LPNKMPA.PZ.jpg',
                    'alt': 'Prancer, Pink, small',
                    'title': 'Prancer, Pink'
                }
            },
            {
                'type': 'Product',
                'url': 'http://' + hostname + '/s/SiteGenesis/light-hematite-bracelet/' + variantPid2 + '.html?lang=en_US',
                'variationAttributes': [
                    {
                        'displayName': 'Color',
                        'displayValue': 'Hematite'
                    }
                ],
                'quantity': 1,
                'quantityOptions': {
                    'minOrderQuantity': 1,
                    'maxOrderQuantity': 10
                },
                'priceModelPricing': {
                    'value': 40,
                    'currency': 'USD',
                    'formatted': '$40.00',
                    'type': 'standard'
                },
                'priceTotal': '$40.00',
                'name': 'Light Hematite Bracelet',
                'isBundle': false,
                'isMaster': false,
                'isProductSet': false,
                'isVariant': true,
                'isBonusProductLineItem': false,
                'isGift': false,
                'isOrderable': true,
                'productID': '013742335538',
                'UUID': '',
                'image': {
                    // 'src': '/on/demandware.static/-/Sites-apparel-catalog/default/dw2351fe8c/images/small/PG.54055310VC.HEMATML.PZ.jpg',
                    'alt': 'Light Hematite Bracelet, Hematite, small',
                    'title': 'Light Hematite Bracelet, Hematite'
                }
            }
        ],
        'numItems': 2,
        'resources': {
            'numberOfItems': '2 Items',
            'emptyCartMsg': 'Your Shopping Cart is Empty'
        }
    };

    before(function () {
        // ----- adding product #1:
        myRequest.url = config.baseUrl + '/Cart-AddProduct?pid=' + variantPid1 + '&quantity=' + qty1;

        return request(myRequest)
            .then(function () {
                cookieString = cookieJar.getCookieString(myRequest.url);
            })

            // ----- adding product #2, a different variant of same product 1:
            .then(function () {
                myRequest.url = config.baseUrl + '/Cart-AddProduct?pid=' + variantPid2 + '&quantity=' + qty2;

                var cookie = request.cookie(cookieString);
                cookieJar.setCookie(cookie, myRequest.url);

                return request(myRequest);
            })

            // ----- select a shipping method in order to get cart content to obtain UUID of the product line item:
            .then(function () {
                var shipMethodId = '001';   // 001 = Ground

                myRequest.method = 'GET';
                myRequest.url = config.baseUrl + '/Cart-SelectShippingMethod?methodID=' + shipMethodId;
                return request(myRequest);
            })

            // ----- Get UUID information
            .then(function (response4) {
                var bodyAsJson = JSON.parse(response4.body);

                expectedResponseCommon.items[0].UUID = bodyAsJson.items[0].UUID;
                expectedResponseCommon.items[1].UUID = bodyAsJson.items[1].UUID;
            });
    });

    it('should set the shipping method to Overnight', function () {
        var expectTotals = {
            'subTotal': '$139.00',
            'grandTotal': '$166.94',
            'totalTax': '$7.95',
            'totalShippingCost': '$19.99'
        };

        var shipMethodId = '003';   // 003 = Overnight

        myRequest.method = 'GET';
        myRequest.url = config.baseUrl + '/Cart-SelectShippingMethod?methodID=' + shipMethodId;

        return request(myRequest)
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');

                var bodyAsJson = JSON.parse(response.body);

                // ----- strip out all "totals", "selectedShippingMethod" properties from the actual response
                var actualRespBodyStripped = jsonHelpers.deleteProperties(bodyAsJson, ['src', 'totals', 'selectedShippingMethod']);

                assert.deepEqual(actualRespBodyStripped, expectedResponseCommon, 'Actual response not as expected.');
                assert.deepEqual(bodyAsJson.totals, expectTotals, 'Actual response total not as expected.');
                assert.equal(bodyAsJson.selectedShippingMethod, shipMethodId, 'Actual response selectedShippingMethod not as expected.');
            });
    });

    it('should set the shipping method to Ground', function () {
        var expectTotals = {
            'subTotal': '$139.00',
            'grandTotal': '$164.84',
            'totalTax': '$7.85',
            'totalShippingCost': '$17.99'
        };

        var shipMethodId = '001';   // 001 = Ground

        myRequest.method = 'GET';
        myRequest.url = config.baseUrl + '/Cart-SelectShippingMethod?methodID=' + shipMethodId;

        return request(myRequest)
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');

                var bodyAsJson = JSON.parse(response.body);

                // ----- strip out all "totals", "selectedShippingMethod" properties from the actual response
                var actualRespBodyStripped = jsonHelpers.deleteProperties(bodyAsJson, ['src', 'totals', 'selectedShippingMethod']);

                assert.deepEqual(actualRespBodyStripped, expectedResponseCommon, 'Actual response not as expected.');
                assert.deepEqual(bodyAsJson.totals, expectTotals, 'Actual response total not as expected.');
                assert.equal(bodyAsJson.selectedShippingMethod, shipMethodId, 'Actual response selectedShippingMethod not as expected.');
            });
    });

    it('should set the shipping method to 2-Day Express', function () {
        var expectTotals = {
            'subTotal': '$139.00',
            'grandTotal': '$158.54',
            'totalTax': '$7.55',
            'totalShippingCost': '$11.99'
        };

        var shipMethodId = '002';   // 002 = 2-Day Express

        myRequest.method = 'GET';
        myRequest.url = config.baseUrl + '/Cart-SelectShippingMethod?methodID=' + shipMethodId;

        return request(myRequest)
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');

                var bodyAsJson = JSON.parse(response.body);

                assert.deepEqual(bodyAsJson.totals, expectTotals, 'Actual response not as expected.');
                assert.deepEqual(bodyAsJson.shippingMethods, expectedResponseCommon.shippingMethods, 'Actual response not as expected.');
                assert.equal(bodyAsJson.selectedShippingMethod, shipMethodId, 'Actual response not as expected.');
            });
    });

    it('should set the shipping method to Store Pickup', function () {
        var expectTotals = {
            'subTotal': '$139.00',
            'grandTotal': '$145.95',
            'totalTax': '$6.95',
            'totalShippingCost': '$0.00'
        };

        var shipMethodId = '005';   // 001 = Store Pickup

        myRequest.method = 'GET';
        myRequest.url = config.baseUrl + '/Cart-SelectShippingMethod?methodID=' + shipMethodId;

        return request(myRequest)
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');

                var bodyAsJson = JSON.parse(response.body);

                // ----- strip out all "totals", "selectedShippingMethod" properties from the actual response
                var actualRespBodyStripped = jsonHelpers.deleteProperties(bodyAsJson, ['src', 'totals', 'selectedShippingMethod']);

                assert.deepEqual(actualRespBodyStripped, expectedResponseCommon, 'Actual response not as expected.');
                assert.deepEqual(bodyAsJson.totals, expectTotals, 'Actual response total not as expected.');
                assert.equal(bodyAsJson.selectedShippingMethod, shipMethodId, 'Actual response selectedShippingMethod not as expected.');
            });
    });

    it('should set the shipping method to Express', function () {
        var expectTotals = {
            'subTotal': '$139.00',
            'grandTotal': '$170.09',
            'totalTax': '$8.10',
            'totalShippingCost': '$22.99'
        };

        var shipMethodId = '012';   // 012 = Express

        myRequest.method = 'GET';
        myRequest.url = config.baseUrl + '/Cart-SelectShippingMethod?methodID=' + shipMethodId;

        return request(myRequest)
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');

                var bodyAsJson = JSON.parse(response.body);

                // ----- strip out all "totals", "selectedShippingMethod" properties from the actual response
                var actualRespBodyStripped = jsonHelpers.deleteProperties(bodyAsJson, ['src', 'totals', 'selectedShippingMethod']);

                assert.deepEqual(actualRespBodyStripped, expectedResponseCommon, 'Actual response not as expected.');
                assert.deepEqual(bodyAsJson.totals, expectTotals, 'Actual response total not as expected.');
                assert.equal(bodyAsJson.selectedShippingMethod, shipMethodId, 'Actual response selectedShippingMethod not as expected.');
            });
    });

    it('should set the shipping method to USPS', function () {
        var expectTotals = {
            'subTotal': '$139.00',
            'grandTotal': '$154.34',
            'totalTax': '$7.35',
            'totalShippingCost': '$7.99'
        };

        var shipMethodId = '021';   // 021 = USPS

        myRequest.method = 'GET';
        myRequest.url = config.baseUrl + '/Cart-SelectShippingMethod?methodID=' + shipMethodId;

        return request(myRequest)
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');

                var bodyAsJson = JSON.parse(response.body);

                // ----- strip out all "totals", "selectedShippingMethod" properties from the actual response
                var actualRespBodyStripped = jsonHelpers.deleteProperties(bodyAsJson, ['src', 'totals', 'selectedShippingMethod']);

                assert.deepEqual(actualRespBodyStripped, expectedResponseCommon, 'Actual response not as expected.');
                assert.deepEqual(bodyAsJson.totals, expectTotals, 'Actual response total not as expected.');
                assert.equal(bodyAsJson.selectedShippingMethod, shipMethodId, 'Actual response selectedShippingMethod not as expected.');
            });
    });

    it('should default to default shipping method for method with excluded Products', function () {
        var expectTotals = {
            'subTotal': '$139.00',
            'grandTotal': '$164.84',
            'totalTax': '$7.85',
            'totalShippingCost': '$17.99'
        };

        var shipMethodId = '004';   // 004 = Super Saver, has excluded Products
        var groundShipMethodId = '001';

        myRequest.method = 'GET';
        myRequest.url = config.baseUrl + '/Cart-SelectShippingMethod?methodID=' + shipMethodId;

        return request(myRequest)
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');

                var bodyAsJson = JSON.parse(response.body);

                // ----- strip out all "totals", "selectedShippingMethod" properties from the actual response
                var actualRespBodyStripped = jsonHelpers.deleteProperties(bodyAsJson, ['src', 'totals', 'selectedShippingMethod']);

                assert.deepEqual(actualRespBodyStripped, expectedResponseCommon, 'Actual response not as expected.');
                assert.deepEqual(bodyAsJson.totals, expectTotals, 'Actual response total not as expected.');
                assert.equal(bodyAsJson.selectedShippingMethod, groundShipMethodId, 'Actual response selectedShippingMethod not as expected.');
            });
    });

    it('should default to default shipping method for non-exist method', function () {
        var expectTotals = {
            'subTotal': '$139.00',
            'grandTotal': '$164.84',
            'totalTax': '$7.85',
            'totalShippingCost': '$17.99'
        };

        var shipMethodId = '9999';
        var groundShipMethodId = '001';

        myRequest.method = 'GET';
        myRequest.url = config.baseUrl + '/Cart-SelectShippingMethod?methodID=' + shipMethodId;

        return request(myRequest)
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');

                var bodyAsJson = JSON.parse(response.body);

                // ----- strip out all "totals", "selectedShippingMethod" properties from the actual response
                var actualRespBodyStripped = jsonHelpers.deleteProperties(bodyAsJson, ['src', 'totals', 'selectedShippingMethod']);

                assert.deepEqual(actualRespBodyStripped, expectedResponseCommon, 'Actual response not as expected.');
                assert.deepEqual(bodyAsJson.totals, expectTotals, 'Actual response total not as expected.');
                assert.equal(bodyAsJson.selectedShippingMethod, groundShipMethodId, 'Actual response selectedShippingMethod not as expected.');
            });
    });
});
