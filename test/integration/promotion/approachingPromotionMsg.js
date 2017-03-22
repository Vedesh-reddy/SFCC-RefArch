
var assert = require('chai').assert;
var request = require('request-promise');
var config = require('../it.config');
var cheerio = require('cheerio');

// Test Case
// pid=799927767720
// 1. Product PDP page contains the promotional messages
// 2. Add 2 products to Cart, should return approaching order/shipping promotion messages
// 3. shipping cost and order discount
// 4. Shipping form updates

describe('Approaching order level promotion', function () {
    this.timeout(5000);

    var masterPid = '25594767';
    var variantPid = '799927767720';
    var qty = 2;
    var cookieString;
    var cookieJar = request.jar();
    var UUID;
    var myShippingMethodForm = {
        methodID: '001'
    };
    var myNewShippingMethodForm = {
        methodID: '021'
    };
    var myRequest = {
        url: '',
        method: 'GET',
        rejectUnauthorized: false,
        resolveWithFullResponse: true,
        jar: cookieJar
    };
    var myNewRequest = {
        url: '',
        method: 'GET',
        rejectUnauthorized: false,
        resolveWithFullResponse: true,
        jar: cookieJar
    };
    var orderDiscountMsg = 'Purchase $24.00 or more and receive 20% off on your order';
    var shippingDiscountMsg = 'Purchase $24.00 or more and receive Free Shipping with USPS (7-10 Business Days)';

    it('1. should return a response containing promotional messages for the order and shipping discounts on PDP', function (done) {
        myRequest.url = config.baseUrl + '/Product-Variation?pid='
            + masterPid + '&dwvar_' + masterPid + '_color=BLUJEFB&quantity=1';
        return request(myRequest, function (error, response) {
            var bodyAsJson = JSON.parse(response.body);
            assert.equal(response.statusCode, 200, 'Expected GET Product-Variation statusCode to be 200.');
            assert.isTrue(bodyAsJson.product.promotions[0].calloutMsg === '20% off on your order');
            assert.isTrue(bodyAsJson.product.promotions[1].calloutMsg === 'Free Shipping with USPS (7-10 Business Days)');
            done();
        });
    });
    it('2. should return a response containing approaching promotional call out messages', function (done) {
        // add 2 product to Cart
        myRequest.url = config.baseUrl + '/Cart-AddProduct?pid=' + variantPid + '&quantity=' + qty;
        myRequest.method = 'POST';
        return request(myRequest)
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'expected add variant to Cart call to return status code 200');
                var bodyAsJson = JSON.parse(response.body);
                assert.isTrue(bodyAsJson.quantityTotal === 2, 'should have 2 items added to Cart');
                assert.isTrue(bodyAsJson.message === 'Product added to basket');
                cookieString = cookieJar.getCookieString(myRequest.url);
            })
            // select a shipping method with Form is required before going to Cart
            .then(function () {
                myRequest.form = myShippingMethodForm; // Ground Shipping method
                myRequest.method = 'POST';
                myRequest.url = config.baseUrl + '/Cart-SelectShippingMethod';
                var cookie = request.cookie(cookieString);
                cookieJar.setCookie(cookie, myRequest.url);
                return request(myRequest);
            })
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'expected add shipping method to return status code 200');
            })
            // go to Cart
            .then(function () {
                // needs to update the URL to use pretty url
                var NewUrl = config.baseUrl.replace('on/demandware.store/Sites-SiteGenesis-Site/', 's/SiteGenesis/cart?lang=');
                myNewRequest.url = NewUrl;
                var cookie = request.cookie(cookieString);
                cookieJar.setCookie(cookie, myNewRequest.url);
                return request(myNewRequest);
            })
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'expected cart page to return status code 200');
                var $ = cheerio.load(response.body);
                var discount = $('.single-approaching-discount');
                UUID = $('.custom-select.quantity').attr('data-uuid');
                assert.equal(discount.get(0).children[0].data.trim(), orderDiscountMsg);
                assert.equal(discount.get(1).children[0].data.trim(), shippingDiscountMsg);
                done();
            });
    });
    it('3. should return a response containing actual order level discount in Cart', function(done) {
        // update the quantity to 4 to trigger the order level discount
        myNewRequest.url = config.baseUrl + '/Cart-UpdateQuantity?pid=' + variantPid + '&quantity=4&uuid='+ UUID;
        return request(myNewRequest)
            .then(function(response) {
                assert.equal(response.statusCode, 200, 'expected update quantity call to return status code 200');
                var bodyAsJson = JSON.parse(response.body);
                assert.equal(bodyAsJson.totals.orderLevelDiscountTotal.formatted, '$30.40');
                assert.equal(bodyAsJson.totals.discounts[0].lineItemText, 'Approaching Order Discount Test');
                assert.equal(bodyAsJson.totals.discounts[0].price, '-$30.40');
                assert.equal(bodyAsJson.totals.discounts[0].type, 'promotion');
                done();
            })
    })
    it('4. should return a response containing actual shipping order discount in Cart', function(done) {
        // update the shipping methods to be USPS to meet the promotion requirement
        myNewRequest.form = myNewShippingMethodForm; // Ground Shipping method
        myNewRequest.method = 'POST';
        myNewRequest.url = config.baseUrl + '/Cart-SelectShippingMethod';
        return request(myRequest)
            .then(function(response) {
                assert.equal(response.statusCode, 200, 'expected selectShippingMethod call to return status code 200');
                var bodyAsJson = JSON.parse(response.body);
                console.log('bodyAsJson is ', bodyAsJson.totals);
                done();
            })
    })
});
