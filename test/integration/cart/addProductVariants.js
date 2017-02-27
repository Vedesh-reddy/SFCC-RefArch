var assert = require('chai').assert;
var request = require('request-promise');
var config = require('../it.config');
var jsonHelpers = require('../helpers/jsonUtils');

describe('Add Product variants to cart', function () {
    this.timeout(5000);

    // Currently the Cart-AddProduct service call only returns 'quantityTotal' property
    // and there is no service call to get cart that returns JSON. In the future when
    // Cart-AddProduct is enhanced to return mini-cart, this test will need to be enhanced
    // to accomodate the change.
    // For now, use Cart-SelectShippingMethod te the cart content back.
    it('should add variants of different and same products, returns total quantity of added items', function () {
        var cookieJar = request.jar();

        // The myRequest object will be reused through out this file. The 'jar' property will be set once.
        // The 'url' property will be updated on every request to set the product ID (pid) and quantity.
        // All other properties remained unchanged.
        var myRequest = {
            url: '',
            method: 'POST',
            rejectUnauthorized: false,
            resolveWithFullResponse: true,
            jar: cookieJar
        };

        var cookieString;

        var totalQty;

        var variantPid1 = '701643421084';
        var qty1 = 2;
        var variantPid2 = '701642923459';
        var qty2 = 1;
        var variantPid3 = '013742000252';
        var qty3 = 11;
        var variantPid4 = '029407331258';
        var qty4 = 3;

        // ----- adding product #1:
        totalQty = qty1;
        myRequest.url = config.baseUrl + '/Cart-AddProduct?pid=' + variantPid1 + '&quantity=' + qty1;

        var expectedResBody = {
            'quantityTotal': totalQty,
            'message': 'Product added to basket'
        };

        return request(myRequest)
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');

                var bodyAsJson = JSON.parse(response.body);
                assert.deepEqual(bodyAsJson, expectedResBody, 'Actual response body from adding product 1 not as expected.');

                cookieString = cookieJar.getCookieString(myRequest.url);
            })

            // ----- adding product #2, a different variant of same product 1:
            .then(function () {
                totalQty += qty2;
                myRequest.url = config.baseUrl + '/Cart-AddProduct?pid=' + variantPid2 + '&quantity=' + qty2;

                var cookie = request.cookie(cookieString);
                cookieJar.setCookie(cookie, myRequest.url);

                return request(myRequest);
            })

            // Handle response from request #2
            .then(function (response2) {
                assert.equal(response2.statusCode, 200, 'Expected statusCode to be 200.');

                var expectedResBody2 = {
                    'quantityTotal': totalQty,
                    'message': 'Product added to basket'
                };

                var bodyAsJson2 = JSON.parse(response2.body);
                assert.deepEqual(bodyAsJson2, expectedResBody2, 'Actual response body from adding product 2 not as expected.');
            })

            // ----- adding product #3:
            .then(function () {
                totalQty += qty3;
                myRequest.url = config.baseUrl + '/Cart-AddProduct?pid=' + variantPid3 + '&quantity=' + qty3;
                return request(myRequest);
            })

            // Handle response from request #3
            .then(function (response3) {
                assert.equal(response3.statusCode, 200, 'Expected statusCode to be 200.');

                var expectedResBody3 = {
                    'quantityTotal': totalQty,
                    'message': 'Product added to basket'
                };

                var bodyAsJson3 = JSON.parse(response3.body);
                assert.deepEqual(bodyAsJson3, expectedResBody3, 'Actual response body from adding product 3 not as expected.');
            })

            // ----- adding product #4:
            .then(function () {
                totalQty += qty4;
                myRequest.url = config.baseUrl + '/Cart-AddProduct?pid=' + variantPid4 + '&quantity=' + qty4;
                return request(myRequest);
            })

            // Handle response from request #4
            .then(function (response4) {
                assert.equal(response4.statusCode, 200, 'Expected statusCode to be 200.');

                var expectedResBody4 = {
                    'quantityTotal': totalQty,
                    'message': 'Product added to basket'
                };

                var bodyAsJson4 = JSON.parse(response4.body);
                assert.deepEqual(bodyAsJson4, expectedResBody4, 'Actual response body from adding product 4 not as expected.');
            })

            // ----- select a shipping method in order to verify cart content. Currently this is no direct way
            // ----- to get cart content.
            .then(function () {
                var shipMethodId = '001';   // 001 = Ground

                myRequest.method = 'GET';
                myRequest.url = config.baseUrl + '/Cart-SelectShippingMethod?methodID=' + shipMethodId;
                return request(myRequest);
            })

            // ----- Verify cart content
                .then(function (response5) {
                    assert.equal(response5.statusCode, 200, 'Expected statusCode to be 200 for getting cart content.');

                    var bodyAsJson = JSON.parse(response5.body);

                    // Leaving the commented out 'src' and 'UUID' properties here for reference because it should
                    // be includedin the response but the string can not be used for comparison as it because
                    // the path has radomly generated code.
                    var expectedResponse = {
                        'actionUrls': {
                            'removeCouponLineItem': '/on/demandware.store/Sites-SiteGenesis-Site/en_US/Cart-RemoveCouponLineItem',
                            'removeProductLineItemUrl': '/on/demandware.store/Sites-SiteGenesis-Site/en_US/Cart-RemoveProductLineItem',
                            'updateQuantityUrl': '/on/demandware.store/Sites-SiteGenesis-Site/en_US/Cart-UpdateQuantity',
                            'submitCouponCodeUrl': '/on/demandware.store/Sites-SiteGenesis-Site/en_US/Cart-AddCoupon',
                            'selectShippingUrl': '/on/demandware.store/Sites-SiteGenesis-Site/en_US/Cart-SelectShippingMethod'
                        },
                        'numOfShipments': 1,
                        'totals': {
                            'subTotal': '$381.97',
                            'grandTotal': '$527.06',
                            'totalTax': '$25.10',
                            'totalShippingCost': '$119.99',
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
                        'shippingMethods': [
                            {
                                'description': 'Order received within 7-10 business days',
                                'displayName': 'Ground',
                                'ID': '001',
                                'shippingCost': '$9.99',
                                'estimatedArrivalTime': '7-10 Business Days'
                            },
                            {
                                'description': 'Order received in 2 business days',
                                'displayName': '2-Day Express',
                                'ID': '002',
                                'shippingCost': '$15.99',
                                'estimatedArrivalTime': '2 Business Days'
                            },
                            {
                                'description': 'Order received the next business day',
                                'displayName': 'Overnight',
                                'ID': '003',
                                'shippingCost': '$21.99',
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
                                'shippingCost': '$28.99',
                                'estimatedArrivalTime': '2-3 Business Days'
                            },
                            {
                                'description': 'Order shipped by USPS received within 7-10 business days',
                                'displayName': 'USPS',
                                'ID': '021',
                                'shippingCost': '$9.99',
                                'estimatedArrivalTime': '7-10 Business Days'
                            }
                        ],
                        'selectedShippingMethod': '001',
                        'items': [
                            {
                                'id': variantPid1,
                                'productName': '3/4 Sleeve V-Neck Top',
                                'price': {
                                    'list': null,
                                    'sales': {
                                        'currency': 'USD',
                                        'formatted': '$24.00',
                                        'value': 24
                                    }
                                },
                                'productType': 'variant',
                                'images': {
                                    'small': [{
                                        'alt': '3/4 Sleeve V-Neck Top, Icy Mint, small',
                                        'title': '3/4 Sleeve V-Neck Top, Icy Mint',
                                        'url': '/on/demandware.static/-/Sites-apparel-catalog/default/dwb2c2588a/images/small/PG.10221714.JJ8UTXX.PZ.jpg'
                                    }]
                                },
                                'rating': 1,
                                'attributes': [
                                    {
                                        'attributeId': 'color',
                                        'displayName': 'Color',
                                        'displayValue': 'Icy Mint',
                                        'id': 'color'
                                    },
                                    {
                                        'attributeId': 'size',
                                        'displayName': 'Size',
                                        'displayValue': 'XS',
                                        'id': 'size'
                                    }
                                ],
                                'quantityOptions': {
                                    'minOrderQuantity': 1,
                                    'maxOrderQuantity': 10
                                },
                                'priceTotal': '$48.00',
                                'isBonusProductLineItem': false,
                                'isGift': false,
                                // 'UUID': 'some UUID',
                                'quantity': qty1,
                                'isOrderable': true
                            },
                            {
                                'id': variantPid2,
                                'productName': '3/4 Sleeve V-Neck Top',
                                'price': {
                                    'list': null,
                                    'sales': {
                                        'currency': 'USD',
                                        'formatted': '$24.00',
                                        'value': 24
                                    }
                                },
                                'productType': 'variant',
                                'images': {
                                    'small': [{
                                        'alt': '3/4 Sleeve V-Neck Top, Butter, small',
                                        'title': '3/4 Sleeve V-Neck Top, Butter',
                                        'url': '/on/demandware.static/-/Sites-apparel-catalog/default/dwef3c390f/images/small/PG.10221714.JJ370XX.PZ.jpg'
                                    }]
                                },
                                'rating': 3,
                                'attributes': [
                                    {
                                        'attributeId': 'color',
                                        'displayName': 'Color',
                                        'displayValue': 'Butter',
                                        'id': 'color'
                                    },
                                    {
                                        'attributeId': 'size',
                                        'displayName': 'Size',
                                        'displayValue': 'M',
                                        'id': 'size'
                                    }
                                ],
                                'quantityOptions': {
                                    'minOrderQuantity': 1,
                                    'maxOrderQuantity': 10
                                },
                                'priceTotal': '$24.00',
                                'isBonusProductLineItem': false,
                                'isGift': false,
                                // 'UUID': 'some UUID',
                                'quantity': qty2,
                                'isOrderable': true
                            },
                            {
                                'id': variantPid3,
                                'productName': 'Bronze Clip On Button Earring',
                                'price': {
                                    'list': null,
                                    'sales': {
                                        'currency': 'USD',
                                        'formatted': '$20.00',
                                        'value': 20
                                    }
                                },
                                'productType': 'variant',
                                'images': {
                                    'small': [{
                                        'alt': 'Bronze Clip On Button Earring, Silver Ox, small',
                                        'title': 'Bronze Clip On Button Earring, Silver Ox',
                                        'url': '/on/demandware.static/-/Sites-apparel-catalog/default/dw9cbea184/images/small/PG.60108563.JJNY2XX.PZ.jpg'
                                    }]
                                },
                                'rating': 2,
                                'attributes': [
                                    {
                                        'attributeId': 'color',
                                        'displayName': 'Color',
                                        'displayValue': 'Silver Ox',
                                        'id': 'color'
                                    }
                                ],
                                'quantityOptions': {
                                    'minOrderQuantity': 1,
                                    'maxOrderQuantity': 11
                                },
                                'priceTotal': '$220.00',
                                'isBonusProductLineItem': false,
                                'isGift': false,
                                // 'UUID': 'some UUID',
                                'quantity': qty3,
                                'isOrderable': true
                            },
                            {
                                'id': variantPid4,
                                'productName': 'Solid Silk Tie',
                                'price': {
                                    'list': {
                                        'currency': 'USD',
                                        'formatted': '$39.50',
                                        'value': 39.5
                                    },
                                    'sales': {
                                        'currency': 'USD',
                                        'formatted': '$29.99',
                                        'value': 29.99
                                    }
                                },
                                'productType': 'variant',
                                'images': {
                                    'small': [{
                                        'alt': 'Solid Silk Tie, Red, small',
                                        'title': 'Solid Silk Tie, Red',
                                        'url': '/on/demandware.static/-/Sites-apparel-catalog/default/dw00caafab/images/small/PG.949432114S.REDSI.PZ.jpg'
                                    }]
                                },
                                'rating': 0,
                                'attributes': [
                                    {
                                        'attributeId': 'color',
                                        'displayName': 'Color',
                                        'displayValue': 'Red',
                                        'id': 'color'
                                    }
                                ],
                                'quantityOptions': {
                                    'minOrderQuantity': 1,
                                    'maxOrderQuantity': 10
                                },
                                'priceTotal': '$89.97',
                                'isBonusProductLineItem': false,
                                'isGift': false,
                                // 'UUID': 'some UUID',
                                'quantity': qty4,
                                'isOrderable': true
                            }
                        ],
                        'numItems': 17,
                        'resources': {
                            'numberOfItems': '17 Items',
                            'emptyCartMsg': 'Your Shopping Cart is Empty'
                        }
                    };

                    // ----- strip out all 'UUID', 'src' properties from the actual response
                    var actualRespBodyStripped = jsonHelpers.deleteProperties(bodyAsJson, ['src', 'UUID']);
                    assert.deepEqual(actualRespBodyStripped, expectedResponse, 'Actual response not as expected.');

                    // verify UUID exist
                    assert.isNotNull(bodyAsJson.items[0].UUID, 'product 1 does not have UUID in response');
                    assert.isNotNull(bodyAsJson.items[1].UUID, 'product 2 does not have UUID in response');
                    assert.isNotNull(bodyAsJson.items[2].UUID, 'product 3 does not have UUID in response');
                    assert.isNotNull(bodyAsJson.items[3].UUID, 'product 4 does not have UUID in response');

                    // Verify path to image source
                    var prodImageSrc1 = bodyAsJson.items[0].images.small[0].url;
                    var prodImageSrc2 = bodyAsJson.items[1].images.small[0].url;
                    var prodImageSrc3 = bodyAsJson.items[2].images.small[0].url;
                    var prodImageSrc4 = bodyAsJson.items[3].images.small[0].url;
                    assert.isTrue(prodImageSrc1.endsWith('/images/small/PG.10221714.JJ8UTXX.PZ.jpg'), 'product 1 item image: src not end with /images/small/PG.10221714.JJ8UTXX.PZ.jpg.');
                    assert.isTrue(prodImageSrc2.endsWith('/images/small/PG.10221714.JJ370XX.PZ.jpg'), 'product 2 item image: src not end with /images/small/PG.10221714.JJ370XX.PZ.jpg.');
                    assert.isTrue(prodImageSrc3.endsWith('/images/small/PG.60108563.JJNY2XX.PZ.jpg'), 'product 3 item image: src not end with /images/small/PG.60108563.JJNY2XX.PZ.jpg.');
                    assert.isTrue(prodImageSrc4.endsWith('/images/small/PG.949432114S.REDSI.PZ.jpg'), 'product 4 item image: src not end with /images/small/PG.949432114S.REDSI.PZ.jpg.');
                });
    });
});
