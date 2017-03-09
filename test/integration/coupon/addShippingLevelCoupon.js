var assert = require('chai').assert;
var request = require('request-promise');
var config = require('../it.config');

describe('Shipping Level Coupon', function () {
    this.timeout(5000);

    var variantId = '740357377119';
    var quantity = 5;
    var couponCode = 'shipping';
    var cookieJar = request.jar();
    var cookieString;
    var UUID;

    var myRequest = {
        url: '',
        method: 'POST',
        rejectUnauthorized: false,
        resolveWithFullResponse: true,
        jar: cookieJar
    };

    myRequest.url = config.baseUrl + '/Cart-AddProduct?pid=' + variantId + '&quantity=' + quantity;

    before(function () {
        // adding 5 products to Cart
        return request(myRequest)
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'Expected add to Cart request statusCode to be 200.');
                cookieString = cookieJar.getCookieString(myRequest.url);
            })
            // select a shipping method in order to get cart content
            .then(function () {
                var shipMethodId = '001';   // 001 = Ground
                myRequest.method = 'GET';
                myRequest.url = config.baseUrl + '/Cart-SelectShippingMethod?methodID=' + shipMethodId;
                var cookie = request.cookie(cookieString);
                cookieJar.setCookie(cookie, myRequest.url);
                return request(myRequest);
            })
            .then(function () {
                myRequest.method = 'GET';
                myRequest.url = config.baseUrl + '/Cart-AddCoupon?couponCode=' + couponCode;
            })
    });

    it('should be applied when coupon code is provided', function (done) {
        var expectedResBody = {
            "totals": {
                "subTotal": "$550.00",
                "grandTotal": "$585.89",
                "totalTax": "$27.90",
                "totalShippingCost": "$15.99",
                "orderLevelDiscountTotal": {
                    "value": 0,
                    "formatted": "$0.00"
                },
                "shippingLevelDiscountTotal": {
                    "value": 8,
                    "formatted": "$8.00"
                },
                "discounts": [
                    {
                        "type": "coupon",
                        "UUID": "dfa81b8a911192fb6bf82def45",
                        "couponCode": "shipping",
                        "applied": true,
                        "valid": true,
                        "relationship": [
                            {
                                "callOutMsg": {}
                            }
                        ]
                    }
                ],
                "discountsHtml": "\n    \n        <div class=\"coupon-price-adjustment coupon-uuid-dfa81b8a911192fb6bf82def45\"\n             data-uuid=\"dfa81b8a911192fb6bf82def45\">\n            <div class=\"coupon-code\">shipping -\n                \n                    <span class=\"coupon-applied\">Applied</span>\n                \n                <button type=\"button\" class=\"float-right remove-coupon\"\n                        data-code=\"shipping\"\n                        aria-label=\"Close\"\n                        data-toggle=\"modal\"\n                        data-target=\"#removeCouponModal\"\n                        data-uuid=\"dfa81b8a911192fb6bf82def45\">\n                    <span aria-hidden=\"true\">&times;</span>\n                </button>\n            </div>\n            <ul class=\"coupon-promotion-relationship\">\n                \n                    <li>Spend 500 and receive 50% off shipping</li>\n                \n            </ul>\n        </div>\n    \n\n"
            },
        };
        return request(myRequest)
            .then(function (response) {
            assert.equal(response.statusCode, 200, 'Expected add coupon request statusCode to be 200.');
            var bodyAsJson = JSON.parse(response.body);
            assert.deepEqual(bodyAsJson.totals.shippingLevelDiscountTotal, expectedResBody.totals.shippingLevelDiscountTotal, 'actual shipping level discount is not as expected' );
            assert.deepEqual(bodyAsJson.totals.orderLevelDiscountTotal, expectedResBody.totals.orderLevelDiscountTotal, 'actual order level discount is not as expected');
            assert.deepEqual(bodyAsJson.totals.discounts.type, expectedResBody.totals.discounts.type, 'actual coupon type should be coupon');
            assert.deepEqual(bodyAsJson.totals.discounts.applied, expectedResBody.totals.discounts.applied, 'coupon discounts should be applied');
            assert.include(bodyAsJson.totals.discountsHtml, 'Spend 500 and receive 50% off shipping', 'actual promotion call out message is correct');
            done();
        })
    })

})
