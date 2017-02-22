var assert = require('chai').assert;
var request = require('request-promise');
var config = require('../it.config');
var jsonHelpers = require('../helpers/jsonUtils');

describe('Remove product variant from line item', function () {
    this.timeout(5000);

    var variantPid1 = '701643421084';
    var qty1 = 2;
    var variantPid2 = '701642923459';
    var qty2 = 1;
    var variantPid3 = '029407331258';
    var qty3 = 3;

    var prodIdUuidMap = {};

    var cookieJar = request.jar();
    var myRequest = {
        url: '',
        method: 'POST',
        rejectUnauthorized: false,
        resolveWithFullResponse: true,
        jar: cookieJar
    };

    var cookieString;

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

            // ----- adding product #3:
            .then(function () {
                myRequest.url = config.baseUrl + '/Cart-AddProduct?pid=' + variantPid3 + '&quantity=' + qty3;
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

                prodIdUuidMap[bodyAsJson.items[0].id] = bodyAsJson.items[0].UUID;
                prodIdUuidMap[bodyAsJson.items[1].id] = bodyAsJson.items[1].UUID;
                prodIdUuidMap[bodyAsJson.items[2].id] = bodyAsJson.items[2].UUID;
            });
    });

    it('should remove line item', function () {
        // removing product variant on line item 2

        var newTotal = qty1 + qty3;
        var expectQty1 = qty1;
        var expectQty3 = qty3;

        var variantUuid1 = prodIdUuidMap[variantPid1];
        var variantUuid2 = prodIdUuidMap[variantPid2];
        var variantUuid3 = prodIdUuidMap[variantPid3];

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
                'subTotal': '$137.97',
                'grandTotal': '$153.26',
                'totalTax': '$7.30',
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
                            'url': '/on/demandware.static/-/Sites-apparel-catalog/default/dwb2c2588a/images/small/PG.10221714.JJ8UTXX.PZ.jpg',
                            'alt': '3/4 Sleeve V-Neck Top, Icy Mint, small',
                            'title': '3/4 Sleeve V-Neck Top, Icy Mint'
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
                    'UUID': variantUuid1,
                    'quantity': expectQty1,
                    'isOrderable': true
                },
                {
                    'id': variantPid3,
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
                            'url': '/on/demandware.static/-/Sites-apparel-catalog/default/dw00caafab/images/small/PG.949432114S.REDSI.PZ.jpg',
                            'alt': 'Solid Silk Tie, Red, small',
                            'title': 'Solid Silk Tie, Red'
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
                    'UUID': variantUuid3,
                    'quantity': expectQty3,
                    'isOrderable': true
                }
            ],
            'numItems': newTotal,
            'resources': {
                'numberOfItems': newTotal + ' Items',
                'emptyCartMsg': 'Your Shopping Cart is Empty'
            }
        };

        // ----- strip out all 'src' properties from the expected response
        var expectedRespStripped = jsonHelpers.deleteProperties(expectedResponse, ['src']);

        myRequest.method = 'GET';
        myRequest.url = config.baseUrl + '/Cart-RemoveProductLineItem?pid=' + variantPid2 + '&uuid=' + variantUuid2;

        return request(myRequest)
            .then(function (removedItemResponse) {
                assert.equal(removedItemResponse.statusCode, 200, 'Expected statusCode to be 200.');

                var bodyAsJson = JSON.parse(removedItemResponse.body);

                // ----- strip out all 'src' properties from the actual response
                var actualRespBodyStripped = jsonHelpers.deleteProperties(bodyAsJson, ['src']);

                assert.deepEqual(actualRespBodyStripped, expectedRespStripped, 'Actual response not as expected.');

                // Verify path to image source
                var prodImageSrc1 = bodyAsJson.items[0].images.small[0].url;
                var prodImageSrc2 = bodyAsJson.items[1].images.small[0].url;
                assert.isTrue(prodImageSrc1.endsWith('/images/small/PG.10221714.JJ8UTXX.PZ.jpg'), 'product 1 item image: src not end with /images/small/PG.10221714.JJ8UTXX.PZ.jpg.');
                assert.isTrue(prodImageSrc2.endsWith('/images/small/PG.949432114S.REDSI.PZ.jpg'), 'product 2 item image: src not end with /images/small/PG.949432114S.REDSI.PZ.jpg.');
            });
    });


    it('should return error if PID and UUID does not match', function () {
        var variantUuid3 = prodIdUuidMap[variantPid3];

        myRequest.url = config.baseUrl + '/Cart-RemoveProductLineItem?pid=' + variantPid1 + '&uuid=' + variantUuid3;

        return request(myRequest)
            .then(function (response) {
                assert.equal(response.statusCode, 500, 'Expected request to fail when PID and UUID do not match.');
            })
            .catch(function (err) {
                assert.equal(err.statusCode, 500, 'Expected statusCode to be 500 for removing product item with non-matching PID and UUID.');

                var bodyAsJson = JSON.parse(err.response.body);

                assert.equal(bodyAsJson.errorMessage,
                    'Unable to remove item from the cart. Please try again! If the issue continues please contact customer service.',
                    'Actual error message from removing  product item with non-matching PID and UUID  not as expected');
            });
    });

    it('should remove all line items', function () {
        var expectedRemoveAllResp = {
            'actionUrls': {
                'removeCouponLineItem': '/on/demandware.store/Sites-SiteGenesis-Site/en_US/Cart-RemoveCouponLineItem',
                'removeProductLineItemUrl': '/on/demandware.store/Sites-SiteGenesis-Site/en_US/Cart-RemoveProductLineItem',
                'updateQuantityUrl': '/on/demandware.store/Sites-SiteGenesis-Site/en_US/Cart-UpdateQuantity',
                'submitCouponCodeUrl': '/on/demandware.store/Sites-SiteGenesis-Site/en_US/Cart-AddCoupon',
                'selectShippingUrl': '/on/demandware.store/Sites-SiteGenesis-Site/en_US/Cart-SelectShippingMethod'
            },
            'numOfShipments': 1,
            'totals': {
                'subTotal': '$0.00',
                'grandTotal': '$0.00',
                'totalTax': '$0.00',
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
            'shippingMethods': [
                {
                    'description': 'Order received within 7-10 business days',
                    'displayName': 'Ground',
                    'ID': '001',
                    'shippingCost': '$0.00',
                    'estimatedArrivalTime': '7-10 Business Days'
                },
                {
                    'description': 'Order received in 2 business days',
                    'displayName': '2-Day Express',
                    'ID': '002',
                    'shippingCost': '$0.00',
                    'estimatedArrivalTime': '2 Business Days'
                },
                {
                    'description': 'Order received the next business day',
                    'displayName': 'Overnight',
                    'ID': '003',
                    'shippingCost': '$0.00',
                    'estimatedArrivalTime': 'Next Day'
                },
                {
                    'description': 'Super Saver Delivery (arrives in 3-7 business days)',
                    'displayName': 'Super Saver',
                    'ID': '004',
                    'shippingCost': '$0.00',
                    'estimatedArrivalTime': '3-7 Business Days'
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
                    'shippingCost': '$0.00',
                    'estimatedArrivalTime': '2-3 Business Days'
                },
                {
                    'description': 'Order shipped by USPS received within 7-10 business days',
                    'displayName': 'USPS',
                    'ID': '021',
                    'shippingCost': '$0.00',
                    'estimatedArrivalTime': '7-10 Business Days'
                }
            ],
            'selectedShippingMethod': '001',
            'items': [],
            'numItems': 0,
            'resources': {
                'numberOfItems': '0 Items',
                'emptyCartMsg': 'Your Shopping Cart is Empty'
            }
        };

        var variantUuid1 = prodIdUuidMap[variantPid1];
        var variantUuid3 = prodIdUuidMap[variantPid3];

        myRequest.method = 'GET';
        myRequest.url = config.baseUrl + '/Cart-RemoveProductLineItem?pid=' + variantPid1 + '&uuid=' + variantUuid1;

        return request(myRequest)
            .then(function () {
                myRequest.url = config.baseUrl + '/Cart-RemoveProductLineItem?pid=' + variantPid3 + '&uuid=' + variantUuid3;
                return request(myRequest);
            })

            // Handle response
            .then(function (response2) {
                assert.equal(response2.statusCode, 200, 'Expected statusCode from remove all product line item to be 200.');

                var bodyAsJson2 = JSON.parse(response2.body);
                assert.deepEqual(bodyAsJson2, expectedRemoveAllResp, 'Actual response from removing all items not as expected.');
            });
    });

    it('should return error if product does not exist in cart', function () {
        var variantPidNotExist = '701643421084abc';
        var variantUuidNotExist = '529f59ef63a0d238b8575c4f8fabc';
        myRequest.url = config.baseUrl + '/Cart-RemoveProductLineItem?pid=' + variantPidNotExist + '&uuid=' + variantUuidNotExist;

        return request(myRequest)
            .then(function (response3) {
                assert.equal(response3.statusCode, 500, 'Expected request to fail when product does not exist.');
            })
            .catch(function (err) {
                assert.equal(err.statusCode, 500, 'Expected statusCode to be 500 for removing product item not in cart.');

                var bodyAsJson = JSON.parse(err.response.body);

                assert.equal(bodyAsJson.errorMessage,
                    'Unable to remove item from the cart. Please try again! If the issue continues please contact customer service.',
                    'Actual error message of removing non-existing product item not as expected');
            });
    });
});
