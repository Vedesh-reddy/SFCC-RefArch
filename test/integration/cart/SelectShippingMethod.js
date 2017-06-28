var assert = require('chai').assert;
var request = require('request-promise');
var config = require('../it.config');
var jsonHelpers = require('../helpers/jsonUtils');

describe('Cart: Selecting Shipping Methods', function () {
    this.timeout(5000);

    var variantPid1 = '740357440196';
    var qty1 = '1';
    var variantPid2 = '013742335538';
    var qty2 = '1';

    var cookieJar = request.jar();
    var myRequest = {
        url: '',
        method: 'POST',
        form: {},
        rejectUnauthorized: false,
        resolveWithFullResponse: true,
        jar: cookieJar
    };

    var cookieString;

    // This is not a complete expected response as properties 'totals', 'selectedShippingMethod' have different
    // values depending on on the selected shipping method and thus they are not included here.
    // Leaving the commented out 'src' property here for reference because it should be included in the
    // 'image' property in the response but the string can not be used for comparison as it because
    // the path has randomly generated code.
    var expectedResponseCommon = {
        'action': 'Cart-SelectShippingMethod',
        'valid': {
            'error': false,
            'message': null
        },
        'actionUrls': {
            'removeCouponLineItem': '/on/demandware.store/Sites-SiteGenesis-Site/en_US/Cart-RemoveCouponLineItem',
            'removeProductLineItemUrl': '/on/demandware.store/Sites-SiteGenesis-Site/en_US/Cart-RemoveProductLineItem',
            'updateQuantityUrl': '/on/demandware.store/Sites-SiteGenesis-Site/en_US/Cart-UpdateQuantity',
            'submitCouponCodeUrl': '/on/demandware.store/Sites-SiteGenesis-Site/en_US/Cart-AddCoupon',
            'selectShippingUrl': '/on/demandware.store/Sites-SiteGenesis-Site/en_US/Cart-SelectShippingMethod'
        },
        'approachingDiscounts': [],
        'numOfShipments': 1,
        'shipments': [
            {
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
                ]
            }
        ],
        'items': [
            {
                'id': '740357440196',
                'productName': 'Prancer',
                'price': {
                    'list': null,
                    'sales': {
                        'currency': 'USD',
                        'formatted': '$99.00',
                        'value': 99
                    }
                },
                'productType': 'variant',
                'images': {
                    'small': [{
                        'alt': 'Prancer, Pink, small',
                        'title': 'Prancer, Pink',
                        'url': '/on/demandware.static/-/Sites-apparel-catalog/default/dwd56b7098/images/small/PG.CJPRANCER.LPNKMPA.PZ.jpg'
                    }]
                },
                'rating': 1,
                'renderedPromotions': '',
                'variationAttributes': [
                    {
                        'attributeId': 'color',
                        'displayName': 'Color',
                        'displayValue': 'Pink',
                        'id': 'color'
                    },
                    {
                        'attributeId': 'size',
                        'displayName': 'Size',
                        'displayValue': '7.5',
                        'id': 'size'
                    },
                    {
                        'attributeId': 'width',
                        'displayName': 'Width',
                        'displayValue': 'M',
                        'id': 'width'
                    }
                ],
                'quantityOptions': {
                    'minOrderQuantity': 1,
                    'maxOrderQuantity': 10
                },

                'priceTotal': {
                    'price': '$99.00',
                    'renderedPrice': '\n\n\n<div class="strike-through\nnon-adjusted-price"\n>\n    null\n</div>\n<div class="pricing line-item-total-price-amount item-total-null">$99.00</div>\n\n'
                },
                'promotions': null,
                'isBonusProductLineItem': false,
                'isGift': false,
                'UUID': '',
                'attributes': null,
                'availability': {
                    'inStockDate': null,
                    'messages': ['In Stock']
                },
                'quantity': 1,
                'isOrderable': true,
                'options': [],
                'isAvailableForInStorePickup': false
            },
            {
                'id': '013742335538',
                'productName': 'Light Hematite Bracelet',
                'price': {
                    'list': null,
                    'sales': {
                        'currency': 'USD',
                        'formatted': '$40.00',
                        'value': 40
                    }
                },
                'productType': 'variant',
                'images': {
                    'small': [{
                        'alt': 'Light Hematite Bracelet, Hematite, small',
                        'title': 'Light Hematite Bracelet, Hematite',
                        'url': '/on/demandware.static/-/Sites-apparel-catalog/default/dw2351fe8c/images/small/PG.54055310VC.HEMATML.PZ.jpg'
                    }]
                },
                'rating': 0,
                'renderedPromotions': '',
                'variationAttributes': [
                    {
                        'attributeId': 'color',
                        'displayName': 'Color',
                        'displayValue': 'Hematite',
                        'id': 'color'
                    }
                ],
                'quantityOptions': {
                    'minOrderQuantity': 1,
                    'maxOrderQuantity': 10
                },
                'priceTotal': {
                    'price': '$40.00',
                    'renderedPrice': '\n\n\n<div class="strike-through\nnon-adjusted-price"\n>\n    null\n</div>\n<div class="pricing line-item-total-price-amount item-total-null">$40.00</div>\n\n'
                },
                'promotions': null,
                'isBonusProductLineItem': false,
                'isGift': false,
                'UUID': '',
                'attributes': null,
                'availability': {
                    'inStockDate': null,
                    'messages': ['In Stock']
                },
                'quantity': 1,
                'isOrderable': true,
                'options': [],
                'isAvailableForInStorePickup': false
            }
        ],
        'numItems': 2,
        'locale': 'en_US',
        'resources': {
            'numberOfItems': '2 Items',
            'emptyCartMsg': 'Your Shopping Cart is Empty'
        }
    };

    before(function () {
        // ----- adding product #1:
        myRequest.url = config.baseUrl + '/Cart-AddProduct';
        myRequest.form = {
            pid: variantPid1,
            childProducts: [],
            quantity: qty1
        };

        return request(myRequest)
            .then(function () {
                cookieString = cookieJar.getCookieString(myRequest.url);
            })

            // ----- adding product #2, a different variant of same product 1:
            .then(function () {
                myRequest.form = {
                    pid: variantPid2,
                    childProducts: [],
                    quantity: qty2
                };

                var cookie = request.cookie(cookieString);
                cookieJar.setCookie(cookie, myRequest.url);

                return request(myRequest);
            })

            // ----- Get UUID information
            .then(function (response) {
                var bodyAsJson = JSON.parse(response.body);

                expectedResponseCommon.items[0].UUID = bodyAsJson.cart.items[0].UUID;
                expectedResponseCommon.items[1].UUID = bodyAsJson.cart.items[1].UUID;
            });
    });

    it('should set the shipping method to Overnight', function () {
        var expectTotals = {
            'subTotal': '$139.00',
            'grandTotal': '$166.94',
            'totalTax': '$7.95',
            'totalShippingCost': '$19.99',
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
        };

        var shipMethodId = '003';   // 003 = Overnight

        myRequest.method = 'POST';
        myRequest.url = config.baseUrl + '/Cart-SelectShippingMethod?methodID=' + shipMethodId;

        return request(myRequest)
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');

                var bodyAsJson = JSON.parse(response.body);

                // ----- strip out all 'totals', 'selectedShippingMethod' properties from the actual response
                var actualRespBodyStripped = jsonHelpers.deleteProperties(bodyAsJson, ['src', 'totals', 'selectedShippingMethod', 'selected', 'default', 'queryString']);

                assert.deepEqual(actualRespBodyStripped, expectedResponseCommon, 'Actual response not as expected.');
                assert.deepEqual(bodyAsJson.totals, expectTotals, 'Actual response total not as expected.');
                assert.equal(bodyAsJson.shipments[0].selectedShippingMethod, shipMethodId, 'Actual response selectedShippingMethod not as expected.');
            });
    });

    it('should set the shipping method to Ground', function () {
        var expectTotals = {
            'subTotal': '$139.00',
            'grandTotal': '$164.84',
            'totalTax': '$7.85',
            'totalShippingCost': '$17.99',
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
        };

        var shipMethodId = '001';   // 001 = Ground

        myRequest.method = 'POST';
        myRequest.url = config.baseUrl + '/Cart-SelectShippingMethod?methodID=' + shipMethodId;

        return request(myRequest)
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');

                var bodyAsJson = JSON.parse(response.body);

                // ----- strip out all 'totals', 'selectedShippingMethod' properties from the actual response
                var actualRespBodyStripped = jsonHelpers.deleteProperties(bodyAsJson, ['src', 'totals', 'selectedShippingMethod', 'selected', 'default', 'queryString']);

                assert.deepEqual(actualRespBodyStripped, expectedResponseCommon, 'Actual response not as expected.');
                assert.deepEqual(bodyAsJson.totals, expectTotals, 'Actual response total not as expected.');
                assert.equal(bodyAsJson.shipments[0].selectedShippingMethod, shipMethodId, 'Actual response selectedShippingMethod not as expected.');
            });
    });

    it('should set the shipping method to 2-Day Express', function () {
        var expectTotals = {
            'subTotal': '$139.00',
            'grandTotal': '$158.54',
            'totalTax': '$7.55',
            'totalShippingCost': '$11.99',
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
        };

        var shipMethodId = '002';   // 002 = 2-Day Express

        myRequest.method = 'POST';
        myRequest.url = config.baseUrl + '/Cart-SelectShippingMethod?methodID=' + shipMethodId;

        return request(myRequest)
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');

                var bodyAsJson = JSON.parse(response.body);

                assert.deepEqual(bodyAsJson.totals, expectTotals, 'Actual response not as expected.');
                assert.deepEqual(bodyAsJson.shippingMethods, expectedResponseCommon.shippingMethods, 'Actual response not as expected.');
                assert.equal(bodyAsJson.shipments[0].selectedShippingMethod, shipMethodId, 'Actual response not as expected.');
            });
    });

    it('should set to default method Ground when shipping method is set to Store Pickup', function () {
        var expectTotals = {
            'subTotal': '$139.00',
            'grandTotal': '$145.95',
            'totalTax': '$6.95',
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
        };

        var shipMethodId = '005';   // 005 = Store Pickup

        myRequest.method = 'POST';
        myRequest.url = config.baseUrl + '/Cart-SelectShippingMethod?methodID=' + shipMethodId;

        return request(myRequest)
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');

                var bodyAsJson = JSON.parse(response.body);

                // ----- strip out all 'totals', 'selectedShippingMethod' properties from the actual response
                var actualRespBodyStripped = jsonHelpers.deleteProperties(bodyAsJson, ['src', 'totals', 'selectedShippingMethod', 'selected', 'default', 'queryString']);

                assert.deepEqual(actualRespBodyStripped, expectedResponseCommon, 'Actual response not as expected.');
                assert.deepEqual(bodyAsJson.totals, expectTotals, 'Actual response total not as expected.');
                assert.equal(bodyAsJson.shipments[0].selectedShippingMethod, shipMethodId, 'Actual response selectedShippingMethod not as expected.');
            });
    });

    it('should set the shipping method to Express', function () {
        var expectTotals = {
            'subTotal': '$139.00',
            'grandTotal': '$170.09',
            'totalTax': '$8.10',
            'totalShippingCost': '$22.99',
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
        };

        var shipMethodId = '012';   // 012 = Express

        myRequest.method = 'POST';
        myRequest.url = config.baseUrl + '/Cart-SelectShippingMethod?methodID=' + shipMethodId;

        return request(myRequest)
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');

                var bodyAsJson = JSON.parse(response.body);

                // ----- strip out all 'totals', 'selectedShippingMethod' properties from the actual response
                var actualRespBodyStripped = jsonHelpers.deleteProperties(bodyAsJson, ['src', 'totals', 'selectedShippingMethod', 'selected', 'default', 'queryString']);

                assert.deepEqual(actualRespBodyStripped, expectedResponseCommon, 'Actual response not as expected.');
                assert.deepEqual(bodyAsJson.totals, expectTotals, 'Actual response total not as expected.');
                assert.equal(bodyAsJson.shipments[0].selectedShippingMethod, shipMethodId, 'Actual response selectedShippingMethod not as expected.');
            });
    });

    it('should set the shipping method to USPS', function () {
        var expectTotals = {
            'subTotal': '$139.00',
            'grandTotal': '$154.34',
            'totalTax': '$7.35',
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
        };

        var shipMethodId = '021';   // 021 = USPS

        myRequest.method = 'POST';
        myRequest.url = config.baseUrl + '/Cart-SelectShippingMethod?methodID=' + shipMethodId;

        return request(myRequest)
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');

                var bodyAsJson = JSON.parse(response.body);

                // ----- strip out all 'totals', 'selectedShippingMethod' properties from the actual response
                var actualRespBodyStripped = jsonHelpers.deleteProperties(bodyAsJson, ['src', 'totals', 'selectedShippingMethod', 'selected', 'default', 'queryString']);

                assert.deepEqual(actualRespBodyStripped, expectedResponseCommon, 'Actual response not as expected.');
                assert.deepEqual(bodyAsJson.totals, expectTotals, 'Actual response total not as expected.');
                assert.equal(bodyAsJson.shipments[0].selectedShippingMethod, shipMethodId, 'Actual response selectedShippingMethod not as expected.');
            });
    });

    it('should default to default shipping method for method with excluded Products', function () {
        var expectTotals = {
            'subTotal': '$139.00',
            'grandTotal': '$164.84',
            'totalTax': '$7.85',
            'totalShippingCost': '$17.99',
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
        };

        var shipMethodId = '004';   // 004 = Super Saver, has excluded Products
        var groundShipMethodId = '001';

        myRequest.method = 'POST';
        myRequest.url = config.baseUrl + '/Cart-SelectShippingMethod?methodID=' + shipMethodId;

        return request(myRequest)
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');

                var bodyAsJson = JSON.parse(response.body);

                // ----- strip out all 'totals', 'selectedShippingMethod' properties from the actual response
                var actualRespBodyStripped = jsonHelpers.deleteProperties(bodyAsJson, ['src', 'totals', 'selectedShippingMethod', 'selected', 'default', 'queryString']);

                assert.deepEqual(actualRespBodyStripped, expectedResponseCommon, 'Actual response not as expected.');
                assert.deepEqual(bodyAsJson.totals, expectTotals, 'Actual response total not as expected.');
                assert.equal(bodyAsJson.shipments[0].selectedShippingMethod, groundShipMethodId, 'Actual response selectedShippingMethod not as expected.');
            });
    });

    it('should default to default shipping method for non-exist method', function () {
        var expectTotals = {
            'subTotal': '$139.00',
            'grandTotal': '$164.84',
            'totalTax': '$7.85',
            'totalShippingCost': '$17.99',
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
        };

        var shipMethodId = '9999';
        var groundShipMethodId = '001';

        myRequest.method = 'POST';
        myRequest.url = config.baseUrl + '/Cart-SelectShippingMethod?methodID=' + shipMethodId;

        return request(myRequest)
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');

                var bodyAsJson = JSON.parse(response.body);

                // ----- strip out all 'totals', 'selectedShippingMethod' properties from the actual response
                var actualRespBodyStripped = jsonHelpers.deleteProperties(bodyAsJson, ['src', 'totals', 'selectedShippingMethod', 'selected', 'default', 'queryString']);

                assert.deepEqual(actualRespBodyStripped, expectedResponseCommon, 'Actual response not as expected.');
                assert.deepEqual(bodyAsJson.totals, expectTotals, 'Actual response total not as expected.');
                assert.equal(bodyAsJson.shipments[0].selectedShippingMethod, groundShipMethodId, 'Actual response selectedShippingMethod not as expected.');
            });
    });
});
