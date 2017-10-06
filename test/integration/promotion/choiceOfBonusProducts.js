var assert = require('chai').assert;
var chai = require('chai');
var chaiSubset = require('chai-subset');
chai.use(chaiSubset);

var request = require('request-promise');
var config = require('../it.config');


describe('Test Choice of bonus Products promotion Mini cart response.', function () {
    this.timeout(50000);
    var VARIANT_PID = '013742002454';
    var QTY = 3;
    var UUID;

    var cookieJar = request.jar();
    var myRequest = {
        url: '',
        method: 'POST',
        rejectUnauthorized: false,
        resolveWithFullResponse: true,
        jar: cookieJar,
        headers: {
            'X-Requested-With': 'XMLHttpRequest'
        }
    };

    it('should  not return the bonus products, if qty is too low.', function () {
        myRequest.url = config.baseUrl + '/Cart-AddProduct';
        myRequest.form = {
            pid: VARIANT_PID,
            quantity: QTY
        };

        var expectedResponse = {};

        return request(myRequest)
            .then(function (myResponse) {
                assert.equal(myResponse.statusCode, 200);
                var bodyAsJson = JSON.parse(myResponse.body);
                assert.equal(
                    JSON.stringify(bodyAsJson.newBonusDiscountLineItem),
                    JSON.stringify(expectedResponse));
            });
    });

    it('should return the bonus products, if qty is sufficient.', function () {
        // ----- adding product item #1:
        myRequest.url = config.baseUrl + '/Cart-AddProduct';
        myRequest.form = {
            pid: VARIANT_PID,
            quantity: QTY
        };

        var expectedPidArray = [
            '008885004540',
            '008884304047',
            '883360390116',
            'pioneer-pdp-6010fd'];
        var expectedLabels = {
            'selectbonus': 'label.choiceofbonus.selectbonus',
            'close': 'Close',
            'selectattrs': 'Select Product Attributes',
            'selectprods': 'Select 2 Bonus Products'
        };

        return request(myRequest)
        .then(function (myResponse) {
            var bodyAsJson = JSON.parse(myResponse.body);
            UUID = bodyAsJson.newBonusDiscountLineItem.uuid;
            assert.equal(myResponse.statusCode, 200);
            assert.equal(bodyAsJson.newBonusDiscountLineItem.bonuspids.length, expectedPidArray.length);
            assert.containSubset(bodyAsJson.newBonusDiscountLineItem.bonuspids, expectedPidArray);
            assert.containSubset(bodyAsJson.newBonusDiscountLineItem.maxBonusItems, 2);
            assert.containSubset(bodyAsJson.newBonusDiscountLineItem.labels, expectedLabels);
        });
    });

    it('should return an error if too many bonus products are added to the cart', function () {
        // ----- adding product item #1:
        var urlQuerystring = '?pids=' +
            JSON.stringify({
                'bonusProducts':
                [{
                    'pid': '008885004540',
                    'qty': 3,
                    'options': [null]
                }],
                'totalQty': 2 });
        urlQuerystring += '&uuid=' + UUID;
        myRequest.url = config.baseUrl + '/Cart-AddBonusProducts' + urlQuerystring;

        var expectedSubSet = {
            'errorMessage': 'You are able to choose 2 products, but you have selected 3 products.',
            'error': true,
            'success': false
        };

        return request(myRequest)
        .then(function (myResponse) {
            var bodyAsJson = JSON.parse(myResponse.body);
            assert.equal(myResponse.statusCode, 200);
            assert.containSubset(bodyAsJson, expectedSubSet);
        });
    });

    it('should return successful result if the number bonus products are allowed by the promotion', function () {
        // ----- adding product item #1:
        var urlQuerystring = '?pids=' +
            JSON.stringify({
                'bonusProducts':
                [{
                    'pid': '008885004540',
                    'qty': 2,
                    'options': [null]
                }],
                'totalQty': 2 });
        urlQuerystring += '&uuid=' + UUID;
        myRequest.url = config.baseUrl + '/Cart-AddBonusProducts' + urlQuerystring;

        var expectedSubSet = {
            'totalQty': 8,
            'msgSuccess': 'Bonus Products added to your cart',
            'error': false,
            'success': true
        };

        return request(myRequest)
        .then(function (myResponse) {
            var bodyAsJson = JSON.parse(myResponse.body);
            assert.equal(myResponse.statusCode, 200);
            assert.containSubset(bodyAsJson, expectedSubSet);
        });
    });
});
