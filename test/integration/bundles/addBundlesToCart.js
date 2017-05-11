var assert = require('chai').assert;
var request = require('request-promise');
var config = require('../it.config');

describe('Add bundles to cart', function () {
    this.timeout(5000);

    it('should be able to add a bundle to Cart', function () {
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

        var bundlePid = 'womens-jewelry-bundle';
        var qty = 1;
        var childPids = '013742002836,013742002805,013742002799';

        myRequest.url = config.baseUrl + '/Cart-AddProduct';
        myRequest.form = {
            pid: bundlePid,
            childPids: childPids,
            quantity: qty
        };
        return request(myRequest, function (error, response) {
            var bodyAsJson = JSON.parse(response.body);
            assert.equal(response.statusCode, 200, 'Expected Cart-AddProduct bundles statusCode to be 200.');
            assert.equal(bodyAsJson.cart.items[0].productName,  'Turquoise Jewelry Bundle');
            assert.equal(bodyAsJson.cart.items[0].productType, 'bundle');
            assert.equal(bodyAsJson.cart.items[0].priceTotal.price, '$113.00');
            assert.equal(bodyAsJson.cart.items[0].bundledProductLineItems[0].id, '013742002836');
            assert.equal(bodyAsJson.cart.items[0].bundledProductLineItems[0].productName, 'Turquoise and Gold Bracelet');
            assert.equal(bodyAsJson.cart.items[0].bundledProductLineItems[1].id, '013742002805');
            assert.equal(bodyAsJson.cart.items[0].bundledProductLineItems[1].productName, 'Turquoise and Gold Necklace');
            assert.equal(bodyAsJson.cart.items[0].bundledProductLineItems[2].id, '013742002799');
            assert.equal(bodyAsJson.cart.items[0].bundledProductLineItems[2].productName, 'Turquoise and Gold Hoop Earring');
            UUID = bodyAsJson.cart.items[0].UUID;
            cookieString = cookieJar.getCookieString(myRequest.url);
        })
    })
})

