var assert = require('chai').assert;
var request = require('request-promise');
var config = require('../it.config');

describe('Add Product variants to cart', function () {
    this.timeout(5000);

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
        myRequest.url = config.baseUrl + '/Cart-AddProduct';
        myRequest.form = {
            pid: variantPid1,
            quantity: qty1
        };

        return request(myRequest)
            .then(function (response) {
                assert.equal(response.statusCode, 200);

                var expectedResBody = {
                    'quantityTotal': totalQty,
                    'action': 'Cart-AddProduct',
                    'message': 'Product added to basket'
                };

                var bodyAsJson = JSON.parse(response.body);
                assert.equal(bodyAsJson.quantityTotal, expectedResBody.quantityTotal);

                cookieString = cookieJar.getCookieString(myRequest.url);
            })

            // ----- adding product #2, a different variant of same product 1:
            .then(function () {
                totalQty += qty2;
                myRequest.url = config.baseUrl + '/Cart-AddProduct';
                myRequest.form = {
                    pid: variantPid2,
                    quantity: qty2
                };

                var cookie = request.cookie(cookieString);
                cookieJar.setCookie(cookie, myRequest.url);

                return request(myRequest);
            })

            // Handle response from request #2
            .then(function (response2) {
                assert.equal(response2.statusCode, 200);

                var expectedResBody2 = {
                    'action': 'Cart-AddProduct',
                    'quantityTotal': totalQty,
                    'message': 'Product added to basket'

                };

                var bodyAsJson2 = JSON.parse(response2.body);
                assert.equal(bodyAsJson2.quantityTotal, expectedResBody2.quantityTotal);
            })

            // ----- adding product #3:
            .then(function () {
                totalQty += qty3;
                myRequest.url = config.baseUrl + '/Cart-AddProduct';
                myRequest.form = {
                    pid: variantPid3,
                    quantity: qty3
                };
                return request(myRequest);
            })

            // Handle response from request #3
            .then(function (response3) {
                assert.equal(response3.statusCode, 200);

                var expectedResBody3 = {
                    'action': 'Cart-AddProduct',
                    'quantityTotal': totalQty,
                    'message': 'Product added to basket'
                };

                var bodyAsJson3 = JSON.parse(response3.body);
                assert.equal(bodyAsJson3.quantityTotal, expectedResBody3.quantityTotal);
            })

            // ----- adding product #4:
            .then(function () {
                totalQty += qty4;
                myRequest.url = config.baseUrl + '/Cart-AddProduct';
                myRequest.form = {
                    pid: variantPid4,
                    quantity: qty4
                };
                return request(myRequest);
            })

            // Handle response from request #4
            .then(function (response4) {
                assert.equal(response4.statusCode, 200);

                var bodyAsJson = JSON.parse(response4.body);

                // Leaving the commented out 'UUID' properties here for reference because it should
                // be including the response but the string can not be used for comparison as it because
                // the path has randomly generated code.
                var expectedResponse = {
                    'quantityTotal': totalQty,
                    'valid': {
                        'error': false,
                        'message': null
                    },
                    'message': 'Product added to basket',
                    'action': 'Cart-AddProduct',
                    'cart': {
                        'actionUrls': {
                            'removeCouponLineItem': '/on/demandware.store/Sites-SiteGenesis-Site/en_US/Cart-RemoveCouponLineItem',
                            'removeProductLineItemUrl': '/on/demandware.store/Sites-SiteGenesis-Site/en_US/Cart-RemoveProductLineItem',
                            'updateQuantityUrl': '/on/demandware.store/Sites-SiteGenesis-Site/en_US/Cart-UpdateQuantity',
                            'submitCouponCodeUrl': '/on/demandware.store/Sites-SiteGenesis-Site/en_US/Cart-AddCoupon',
                            'selectShippingUrl': '/on/demandware.store/Sites-SiteGenesis-Site/en_US/Cart-SelectShippingMethod'
                        },
                        'approachingDiscounts': [],
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
                        'shipments': [
                            {
                                'selectedShippingMethod': '001',
                                'shippingMethods': [
                                    {
                                        'description': 'Order received within 7-10 business days',
                                        'displayName': 'Ground',
                                        'ID': '001',
                                        'estimatedArrivalTime': '7-10 Business Days',
                                        'default': true,
                                        'selected': true,
                                        'shippingCost': '$9.99'
                                    },
                                    {
                                        'description': 'Order received in 2 business days',
                                        'displayName': '2-Day Express',
                                        'ID': '002',
                                        'estimatedArrivalTime': '2 Business Days',
                                        'default': false,
                                        'selected': false,
                                        'shippingCost': '$15.99'
                                    },
                                    {
                                        'description': 'Order received the next business day',
                                        'displayName': 'Overnight',
                                        'estimatedArrivalTime': 'Next Day',
                                        'ID': '003',
                                        'default': false,
                                        'selected': false,
                                        'shippingCost': '$21.99'
                                    },
                                    {
                                        'description': 'Store Pickup',
                                        'displayName': 'Store Pickup',
                                        'ID': '005',
                                        'estimatedArrivalTime': null,
                                        'default': false,
                                        'selected': false,
                                        'shippingCost': '$0.00'
                                    },
                                    {
                                        'description': 'Orders shipped outside continental US received in 2-3 business days',
                                        'displayName': 'Express',
                                        'ID': '012',
                                        'estimatedArrivalTime': '2-3 Business Days',
                                        'default': false,
                                        'selected': false,
                                        'shippingCost': '$28.99'
                                    },
                                    {
                                        'description': 'Order shipped by USPS received within 7-10 business days',
                                        'displayName': 'USPS',
                                        'ID': '021',
                                        'estimatedArrivalTime': '7-10 Business Days',
                                        'default': false,
                                        'selected': false,
                                        'shippingCost': '$9.99'
                                    }
                                ]
                            }
                        ],
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
                                'renderedPromotions': '',
                                'variationAttributes': [
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
                                'priceTotal': {
                                    'price': '$48.00',
                                    'renderedPrice': '\n\n\n<div class="strike-through\nnon-adjusted-price"\n>\n    null\n</div>\n<div class="pricing line-item-total-price-amount item-total-null">$48.00</div>\n\n'
                                },
                                'promotions': null,
                                'isBonusProductLineItem': false,
                                'isGift': false,
                                // 'UUID': 'some UUID',
                                'attributes': null,
                                'quantity': qty1,
                                'isOrderable': true,
                                'isAvailableForInStorePickup': false
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
                                'renderedPromotions': '',
                                'variationAttributes': [
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
                                'priceTotal': {
                                    'price': '$24.00',
                                    'renderedPrice': '\n\n\n<div class="strike-through\nnon-adjusted-price"\n>\n    null\n</div>\n<div class="pricing line-item-total-price-amount item-total-null">$24.00</div>\n\n'
                                },
                                'isBonusProductLineItem': false,
                                'promotions': null,
                                'isGift': false,
                                // 'UUID': 'some UUID',
                                'attributes': null,
                                'quantity': qty2,
                                'isOrderable': true,
                                'isAvailableForInStorePickup': false
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
                                'renderedPromotions': '',
                                'variationAttributes': [
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
                                'priceTotal': {
                                    'price': '$220.00',
                                    'renderedPrice': '\n\n\n<div class="strike-through\nnon-adjusted-price"\n>\n    null\n</div>\n<div class="pricing line-item-total-price-amount item-total-null">$220.00</div>\n\n'
                                },
                                'promotions': null,
                                'isBonusProductLineItem': false,
                                'isGift': false,
                                // 'UUID': 'some UUID',
                                'attributes': null,
                                'quantity': qty3,
                                'isOrderable': true,
                                'isAvailableForInStorePickup': false
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
                                'renderedPromotions': '',
                                'variationAttributes': [
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
                                'priceTotal': {
                                    'price': '$89.97',
                                    'renderedPrice': '\n\n\n<div class="strike-through\nnon-adjusted-price"\n>\n    null\n</div>\n<div class="pricing line-item-total-price-amount item-total-null">$89.97</div>\n\n'
                                },
                                'promotions': null,
                                'isBonusProductLineItem': false,
                                'isGift': false,
                                // 'UUID': 'some UUID',
                                'attributes': null,
                                'quantity': qty4,
                                'isOrderable': true,
                                'isAvailableForInStorePickup': false
                            }
                        ],
                        'numItems': 17,
                        'resources': {
                            'numberOfItems': '17 Items',
                            'emptyCartMsg': 'Your Shopping Cart is Empty'
                        }
                    }
                };

                function verifyShippingMethods(shipMethod, ExpectedShipMethod) {
                    assert.equal(shipMethod.description, ExpectedShipMethod.description);
                    assert.equal(shipMethod.displayName, ExpectedShipMethod.displayName);
                    assert.equal(shipMethod.ID, ExpectedShipMethod.ID);
                    assert.equal(shipMethod.estimatedArrivalTime, ExpectedShipMethod.estimatedArrivalTime);
                    assert.equal(shipMethod.isDefault, ExpectedShipMethod.isDefault);
                    assert.equal(shipMethod.isSelected, ExpectedShipMethod.isSelected);
                    assert.equal(shipMethod.shippingCost, ExpectedShipMethod.shippingCost);
                }

                function verifyItemCommonProperties(item, expectedItem) {
                    assert.equal(item.id, expectedItem.id);
                    assert.equal(item.productName, expectedItem.productName);
                    assert.equal(item.price.sales.value, expectedItem.price.sales.value);
                    assert.equal(item.price.sales.currency, expectedItem.price.sales.currency);
                    assert.equal(item.price.sales.formatted, expectedItem.price.sales.formatted);

                    assert.equal(item.productType, expectedItem.productType);
                    assert.equal(item.images.small[0].alt, expectedItem.images.small[0].alt);
                    assert.isTrue(item.images.small[0].url.endsWith(expectedItem.images.small[0].url));
                    assert.equal(item.images.small[0].title, expectedItem.images.small[0].title);
                    assert.equal(item.rating, expectedItem.rating);
                    assert.equal(item.variationAttributes[0].displayName, expectedItem.variationAttributes[0].displayName);
                    assert.equal(item.variationAttributes[0].displayValue, expectedItem.variationAttributes[0].displayValue);
                    assert.equal(item.variationAttributes[0].attributeId, expectedItem.variationAttributes[0].attributeId);
                    assert.equal(item.variationAttributes[0].id, expectedItem.variationAttributes[0].id);

                    assert.equal(item.quantityOptions.minOrderQuantity, expectedItem.quantityOptions.minOrderQuantity);
                    assert.equal(item.quantityOptions.maxOrderQuantity, expectedItem.quantityOptions.maxOrderQuantity);
                    assert.equal(item.priceTotal.price, expectedItem.priceTotal.price);
                    assert.equal(item.priceTotal.renderedPrice, expectedItem.priceTotal.renderedPrice);
                    assert.equal(item.isBonusProductLineItem, expectedItem.isBonusProductLineItem);
                    assert.equal(item.isGift, expectedItem.isGift);
                    assert.isNotNull(item.UUID);
                    assert.equal(item.quantity, expectedItem.quantity);
                    assert.equal(item.isOrderable, expectedItem.isOrderable);
                    assert.equal(item.promotions, expectedItem.promotions);
                    assert.equal(item.renderedPromotions, expectedItem.renderedPromotions);
                    assert.equal(item.attributes, expectedItem.attributes);
                }

                // ----- Verify quantityTotal, message, action, queryString
                assert.equal(bodyAsJson.quantityTotal, expectedResponse.quantityTotal);
                assert.equal(bodyAsJson.message, expectedResponse.message);
                assert.equal(bodyAsJson.action, expectedResponse.action);

                // ----- Verify actionUrls
                var actionUrls = bodyAsJson.cart.actionUrls;
                var expectedActionUrls = expectedResponse.cart.actionUrls;
                assert.equal(actionUrls.removeProductLineItemUrl, expectedActionUrls.removeProductLineItemUrl);
                assert.equal(actionUrls.updateQuantityUrl, expectedActionUrls.updateQuantityUrl);
                assert.equal(actionUrls.selectShippingUrl, expectedActionUrls.selectShippingUrl);
                assert.equal(actionUrls.submitCouponCodeUrl, expectedActionUrls.submitCouponCodeUrl);
                assert.equal(actionUrls.removeCouponLineItem, expectedActionUrls.removeCouponLineItem);

                // ----- Verify approaching discounts
                assert.lengthOf(bodyAsJson.cart.approachingDiscounts, 0);

                // ----- Verify numOfShipments
                assert.equal(bodyAsJson.cart.numOfShipments, expectedResponse.cart.numOfShipments);

                // ----- Verify totals
                var totals = bodyAsJson.cart.totals;
                var expectedTotals = expectedResponse.cart.totals;
                assert.equal(totals.subTotal, expectedTotals.subTotal);
                assert.equal(totals.grandTotal, expectedTotals.grandTotal);
                assert.equal(totals.totalTax, expectedTotals.totalTax);
                assert.equal(totals.totalShippingCost, expectedTotals.totalShippingCost);
                assert.equal(totals.orderLevelDiscountTotal.value, expectedTotals.orderLevelDiscountTotal.value);
                assert.equal(totals.orderLevelDiscountTotal.formatted, expectedTotals.orderLevelDiscountTotal.formatted);
                assert.equal(totals.shippingLevelDiscountTotal.value, expectedTotals.shippingLevelDiscountTotal.value);
                assert.equal(totals.shippingLevelDiscountTotal.formatted, expectedTotals.shippingLevelDiscountTotal.formatted);
                assert.lengthOf(totals.discounts, 0);

                // ----- Verify Shipments
                var shipMethods = bodyAsJson.cart.shipments[0].shippingMethods;
                var ExpectedShipMethods = expectedResponse.cart.shipments[0].shippingMethods;
                for (var i = 0; i < ExpectedShipMethods.length; i++) {
                    verifyShippingMethods(shipMethods[i], ExpectedShipMethods[i]);
                }

                assert.equal(bodyAsJson.cart.shipments[0].selectedShippingMethod, expectedResponse.cart.shipments[0].selectedShippingMethod);

                // ----- Verify product line items in cart
                assert.lengthOf(bodyAsJson.cart.items, 4);

                // Verify items in cart - item 1
                var itemIdx = 0;
                var item = bodyAsJson.cart.items[itemIdx];
                var expectedItem = expectedResponse.cart.items[itemIdx];

                verifyItemCommonProperties(item, expectedItem);

                assert.equal(item.price.list, expectedItem.price.list);
                assert.equal(item.variationAttributes[1].displayName, expectedItem.variationAttributes[1].displayName);
                assert.equal(item.variationAttributes[1].displayValue, expectedItem.variationAttributes[1].displayValue);
                assert.equal(item.variationAttributes[1].attributeId, expectedItem.variationAttributes[1].attributeId);
                assert.equal(item.variationAttributes[1].id, expectedItem.variationAttributes[1].id);

                // Verify items in cart - item 2
                itemIdx = 1;
                item = bodyAsJson.cart.items[itemIdx];
                expectedItem = expectedResponse.cart.items[itemIdx];

                verifyItemCommonProperties(item, expectedItem);

                assert.equal(item.price.list, expectedItem.price.list);
                assert.equal(item.variationAttributes[1].displayName, expectedItem.variationAttributes[1].displayName);
                assert.equal(item.variationAttributes[1].displayValue, expectedItem.variationAttributes[1].displayValue);
                assert.equal(item.variationAttributes[1].attributeId, expectedItem.variationAttributes[1].attributeId);
                assert.equal(item.variationAttributes[1].id, expectedItem.variationAttributes[1].id);

                // Verify items in cart - item 3
                itemIdx = 2;
                item = bodyAsJson.cart.items[itemIdx];
                expectedItem = expectedResponse.cart.items[itemIdx];

                verifyItemCommonProperties(item, expectedItem);

                assert.equal(item.price.list, expectedItem.price.list);

                // Verify items in cart - item 4
                itemIdx = 3;
                item = bodyAsJson.cart.items[itemIdx];
                expectedItem = expectedResponse.cart.items[itemIdx];

                verifyItemCommonProperties(item, expectedItem);

                assert.equal(item.price.list.value, expectedItem.price.list.value);
                assert.equal(item.price.list.currency, expectedItem.price.list.currency);
                assert.equal(item.price.list.formatted, expectedItem.price.list.formatted);

                // ----- Verify number of items
                assert.equal(bodyAsJson.cart.numItems, expectedResponse.cart.numItems);

                // ----- Verify resource
                assert.equal(bodyAsJson.cart.resources.numberOfItems, expectedResponse.cart.resources.numberOfItems);
                assert.equal(bodyAsJson.cart.resources.emptyCartMsg, expectedResponse.cart.resources.emptyCartMsg);
            });
    });
});
