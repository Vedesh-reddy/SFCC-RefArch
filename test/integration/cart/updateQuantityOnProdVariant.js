var assert = require('chai').assert;
var request = require('request-promise');
var config = require('../it.config');
var jsonHelpers = require('../helpers/jsonUtils');

describe('Update quantity for product variant', function () {
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

               prodIdUuidMap[bodyAsJson.items[0].productID] = bodyAsJson.items[0].UUID;
               prodIdUuidMap[bodyAsJson.items[1].productID] = bodyAsJson.items[1].UUID;
               prodIdUuidMap[bodyAsJson.items[2].productID] = bodyAsJson.items[2].UUID;
           });
    });

    it('should update line item quantity', function () {
        // updating quantity of poduct variant 2

        var newQty2 = 5;
        var newTotal = qty1 + newQty2 + qty3;
        var expectQty1 = qty1;
        var expectQty2 = newQty2;
        var expectQty3 = qty3;

        var variantUuid1 = prodIdUuidMap[variantPid1];
        var variantUuid2 = prodIdUuidMap[variantPid2];
        var variantUuid3 = prodIdUuidMap[variantPid3];

        var hostname = config.baseUrl.split('/')[2];

        var expectedUpdateRep = {
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
            'totals': {
                'subTotal': '$257.97',
                'grandTotal': '$281.36',
                'totalTax': '$13.40',
                'totalShippingCost': '$9.99'
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
                    'type': 'Product',
                    'url': 'http://' + hostname + '/s/SiteGenesis/3/4-sleeve-v-neck-top/' + variantPid1 + '.html?lang=en_US',
                    'variationAttributes': [
                        {
                            'displayName': 'Color',
                            'displayValue': 'Icy Mint'
                        },
                        {
                            'displayName': 'Size',
                            'displayValue': 'XS'
                        }
                    ],
                    'quantity': expectQty1,
                    'quantityOptions': {
                        'minOrderQuantity': 1,
                        'maxOrderQuantity': 10
                    },
                    'priceModelPricing': {
                        'value': 24,
                        'currency': 'USD',
                        'formatted': '$24.00',
                        'type': 'standard'
                    },
                    'priceTotal': '$48.00',
                    'name': '3/4 Sleeve V-Neck Top',
                    'isBundle': false,
                    'isMaster': false,
                    'isProductSet': false,
                    'isVariant': true,
                    'isBonusProductLineItem': false,
                    'isGift': false,
                    'isOrderable': true,
                    'productID': variantPid1,
                    'UUID': variantUuid1,
                    'image': {
                        'src': '/on/demandware.static/-/Sites-apparel-catalog/default/dwb2c2588a/images/small/PG.10221714.JJ8UTXX.PZ.jpg',
                        'alt': '3/4 Sleeve V-Neck Top, Icy Mint, small',
                        'title': '3/4 Sleeve V-Neck Top, Icy Mint'
                    }
                },
                {
                    'type': 'Product',
                    'url': 'http://' + hostname + '/s/SiteGenesis/3/4-sleeve-v-neck-top/' + variantPid2 + '.html?lang=en_US',
                    'variationAttributes': [
                        {
                            'displayName': 'Color',
                            'displayValue': 'Butter'
                        },
                        {
                            'displayName': 'Size',
                            'displayValue': 'M'
                        }
                    ],
                    'quantity': expectQty2,
                    'quantityOptions': {
                        'minOrderQuantity': 1,
                        'maxOrderQuantity': 10
                    },
                    'priceModelPricing': {
                        'value': 24,
                        'currency': 'USD',
                        'formatted': '$24.00',
                        'type': 'standard'
                    },
                    'priceTotal': '$120.00',
                    'name': '3/4 Sleeve V-Neck Top',
                    'isBundle': false,
                    'isMaster': false,
                    'isProductSet': false,
                    'isVariant': true,
                    'isBonusProductLineItem': false,
                    'isGift': false,
                    'isOrderable': true,
                    'productID': variantPid2,
                    'UUID': variantUuid2,
                    'image': {
                        'src': '/on/demandware.static/-/Sites-apparel-catalog/default/dwef3c390f/images/small/PG.10221714.JJ370XX.PZ.jpg',
                        'alt': '3/4 Sleeve V-Neck Top, Butter, small',
                        'title': '3/4 Sleeve V-Neck Top, Butter'
                    }
                },
                {
                    'type': 'Product',
                    'url': 'http://' + hostname + '/s/SiteGenesis/solid-silk-tie/' + variantPid3 + '.html?lang=en_US',
                    'variationAttributes': [
                        {
                            'displayName': 'Color',
                            'displayValue': 'Red'
                        }
                    ],
                    'quantity': expectQty3,
                    'quantityOptions': {
                        'minOrderQuantity': 1,
                        'maxOrderQuantity': 10
                    },
                    'priceModelPricing': {
                        'value': 29.99,
                        'currency': 'USD',
                        'formatted': '$29.99',
                        'type': 'standard'
                    },
                    'priceTotal': '$89.97',
                    'name': 'Solid Silk Tie',
                    'isBundle': false,
                    'isMaster': false,
                    'isProductSet': false,
                    'isVariant': true,
                    'isBonusProductLineItem': false,
                    'isGift': false,
                    'isOrderable': true,
                    'productID': variantPid3,
                    'UUID': variantUuid3,
                    'image': {
                        'src': '/on/demandware.static/-/Sites-apparel-catalog/default/dw00caafab/images/small/PG.949432114S.REDSI.PZ.jpg',
                        'alt': 'Solid Silk Tie, Red, small',
                        'title': 'Solid Silk Tie, Red'
                    }
                }
            ],
            'numItems': newTotal,
            'resources': {
                'numberOfItems': newTotal + ' Items',
                'emptyCartMsg': 'Your Shopping Cart is Empty'
            }
        };

        // ----- strip out all "src" properties from the expected response
        var expectedUpdateRepStripped = jsonHelpers.deleteProperties(expectedUpdateRep, ['src']);

        myRequest.method = 'GET';
        myRequest.url = config.baseUrl + '/Cart-UpdateQuantity?pid=' + variantPid2 + '&uuid=' + variantUuid2 + '&quantity=' + newQty2;

        return request(myRequest)
            .then(function (updateRsp) {
                assert.equal(updateRsp.statusCode, 200, 'Expected statusCode to be 200.');

                var bodyAsJson = JSON.parse(updateRsp.body);

                // ----- strip out all "src" properties from the actual response
                var actualRespBodyStripped = jsonHelpers.deleteProperties(bodyAsJson, ['src']);

                assert.deepEqual(actualRespBodyStripped, expectedUpdateRepStripped, 'Actual response not as expected.');

                // Verify path to image source
                var prodImageSrc1 = bodyAsJson.items[0].image.src;
                var prodImageSrc2 = bodyAsJson.items[1].image.src;
                var prodImageSrc3 = bodyAsJson.items[2].image.src;
                assert.isTrue(prodImageSrc1.endsWith('/images/small/PG.10221714.JJ8UTXX.PZ.jpg'), 'product 1 item image: src not end with /images/small/PG.10221714.JJ8UTXX.PZ.jpg.');
                assert.isTrue(prodImageSrc2.endsWith('/images/small/PG.10221714.JJ370XX.PZ.jpg'), 'product 2 item image: src not end with /images/small/PG.10221714.JJ370XX.PZ.jpg.');
                assert.isTrue(prodImageSrc3.endsWith('/images/small/PG.949432114S.REDSI.PZ.jpg'), 'product 3 item image: src not end with /images/small/PG.949432114S.REDSI.PZ.jpg.');
            });
    });

    it('should return error if update line item quantity is 0', function () {
        var variantUuid1 = prodIdUuidMap[variantPid1];

        myRequest.method = 'GET';
        myRequest.url = config.baseUrl + '/Cart-UpdateQuantity?pid=' + variantPid1 + '&uuid=' + variantUuid1 + '&quantity=0';

        return request(myRequest)
            .then(function (updateRsp) {
                assert.equal(updateRsp.statusCode, 500, 'Expected request to fail for quantity = 0.');
            })
            .catch(function (err) {
                assert.equal(err.statusCode, 500, 'Expected statusCode to be 500 for 0 quantity.');
            });
    });

    it('should return error if update line item quantity is negative', function () {
        var variantUuid1 = prodIdUuidMap[variantPid1];

        myRequest.method = 'GET';
        myRequest.url = config.baseUrl + '/Cart-UpdateQuantity?pid=' + variantPid1 + '&uuid=' + variantUuid1 + '&quantity=-1';

        return request(myRequest)
            .then(function (updateRsp) {
                assert.equal(updateRsp.statusCode, 500, 'Expected request to fail for negative quantity.');
            })
            .catch(function (err) {
                assert.equal(err.statusCode, 500, 'Expected statusCode to be 500 for 0 quantity.');
            });
    });
});
