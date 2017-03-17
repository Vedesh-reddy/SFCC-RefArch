var assert = require('chai').assert;
 var request = require('request-promise');
 var config = require('../it.config');

  /**  Test Case:  * product id : 799927767720  * Verify the following : 
   * 1. Navigate to this product PDP page, get promotion msg "20% of on your order" 
   * 2. approaching order level promotion message 
   * 3. shipping cost and order discount 
   * 4. shipping form update shipping method. 
   * */

  describe('Approaching order level promotion', function() { 
    this.timeout(5000);  
    var masterPid = '25594767'; 
    var variantPid = '799927767720';
    var qty = '2';
    var myRequest = { 
        url: '', 
        method: 'GET', 
        rejectUnauthorized: false 
    };      
    it('should return a response containing promotion message for the order', function(done) { 
        myRequest.url = config.baseUrl + '/Product-Variation?pid=' 
            + masterPid + '&dwvar_' + masterPid + '_color=BLUJEFB&quantity=1'; 
        request(myRequest, function (error, response) {
            var bodyAsJson = JSON.parse(response.body);
            assert.equal(response.statusCode, 200, 'Expected GET Product-Variation statusCode to be 200.');
            assert.isTrue(bodyAsJson.product.promotions[0].calloutMsg === '20% off on your order');
            assert.isTrue(bodyAsJson.product.promotions[1].calloutMsg === 'Free Shipping with USPS (7-10 Business Days)');
            done();
        }) 
    }) 
    it('should return a response containing promotion call out message', function(done) {
        var cookieJar = request.jar();
        var cookieString;
        myRequest.url = config.baseUrl + '/Cart-AddProduct?pid=' + variantPid + '&quantity=' + qty;
        console.log(myRequest.url);
        myRequest.method = 'POST';
        myRequest.resolveWithFullResponse = 'true';
        myRequest.rejectUnauthorized = 'false';
        myRequest.jar = 'cookieJar';
        return request(myRequest)
            .then(function(response) {
                assert.equal(response.statusCode, 200, 'expected add variant to Cart call to return status code 200');
                var bodyAdJson = JSON.parse(response.body);
                assert.isTrue(bodyAdJson.quantityTotal === '2', '2 items has been added to Cart');
                cookieString = cookieJar.getCookieString(myRequest.url);
                done();
            })
    })

}) 
