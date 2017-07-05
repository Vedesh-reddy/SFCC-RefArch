var assert = require('chai').assert;
var chai = require('chai');
var chaiSubset = require('chai-subset');
chai.use(chaiSubset);

var request = require('request-promise');
var config = require('../it.config');


describe('Find available stores for products', function () {
    this.timeout(50000);

    describe('products with different quantity', function () {
        var variantPid1 = '883360352077';
        var qty1 = 2;
        var variantPid2 = '883360390192';
        var qty2 = 1;
        var variantPid3 = '883360520155';
        var qty3 = 3;

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

        var cookieString;

        before(function () {
            // ----- adding product item #1:
            myRequest.url = config.baseUrl + '/Cart-AddProduct';
            myRequest.form = {
                pid: variantPid1,
                quantity: qty1
            };

            return request(myRequest)
                .then(function () {
                    cookieString = cookieJar.getCookieString(myRequest.url);
                })

                // ----- adding product item #2:
                .then(function () {
                    myRequest.url = config.baseUrl + '/Cart-AddProduct';
                    myRequest.form = {
                        pid: variantPid2,
                        quantity: qty2
                    };

                    var cookie = request.cookie(cookieString);
                    cookieJar.setCookie(cookie, myRequest.url);

                    return request(myRequest);
                })

                // ----- adding product item #3:
                .then(function () {
                    myRequest.url = config.baseUrl + '/Cart-AddProduct';
                    myRequest.form = {
                        pid: variantPid3,
                        quantity: qty3
                    };
                    return request(myRequest);
                });
        });

        it('should returns 1 store for postalCode = 01803, radius = 30', function () {
            var postalCode = '01803';
            var radius = 30;

            var expectedAvailableStores = [
                {
                    'name': 'Demandware',
                    'address1': '10 Presidential Way',
                    'address2': null,
                    'city': 'Woburn',
                    'postalCode': '01801',
                    'stateCode': 'MA',
                    'storeHours': 'Mon - Sat: 10am - 9pm<br />\r\nSun: 12pm - 6pm',
                    'inventoryListId': 'inventory_store_store1'
                }
            ];

            myRequest.method = 'GET';
            myRequest.url = config.baseUrl + '/Stores-FindAvailableStores?postalCode=' + postalCode + '&radius=' + radius;

            return request(myRequest)
                .then(function (myResponse) {
                    assert.equal(myResponse.statusCode, 200);

                    var bodyAsJson = JSON.parse(myResponse.body);
                    assert.lengthOf(bodyAsJson.availableStores, 1);
                    assert.containSubset(bodyAsJson.availableStores, expectedAvailableStores);
                });
        });
    });

    describe('products with same quantity, different zip code and radius', function () {
        var variantPid1 = '883360352077';
        var qty1 = 1;
        var variantPid2 = '883360390192';
        var qty2 = 1;
        var variantPid3 = '883360352091';
        var qty3 = 1;

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

        var cookieString;

        before(function () {
            // ----- adding product item #1:
            myRequest.url = config.baseUrl + '/Cart-AddProduct';
            myRequest.form = {
                pid: variantPid1,
                quantity: qty1
            };

            return request(myRequest)
                .then(function () {
                    cookieString = cookieJar.getCookieString(myRequest.url);
                })

                // ----- adding product item #2:
                .then(function () {
                    myRequest.url = config.baseUrl + '/Cart-AddProduct';
                    myRequest.form = {
                        pid: variantPid2,
                        quantity: qty2
                    };

                    var cookie = request.cookie(cookieString);
                    cookieJar.setCookie(cookie, myRequest.url);

                    return request(myRequest);
                })

                // ----- adding product item #3:
                .then(function () {
                    myRequest.url = config.baseUrl + '/Cart-AddProduct';
                    myRequest.form = {
                        pid: variantPid3,
                        quantity: qty3
                    };
                    return request(myRequest);
                });
        });

        it('should returns 2 stores for postalCode = 04101, radius = 100', function () {
            var postalCode = '04101';
            var radius = 100;

            var expectedAvailableStores = [
                {
                    'name': 'Khale Street Electronics',
                    'address1': '150 Winthrop Ave',
                    'address2': null,
                    'city': 'Lawrence',
                    'postalCode': '01843',
                    'phone': '+1-978-580-2704',
                    'stateCode': 'MA',
                    'inventoryListId': 'inventory_store_store6'
                },
                {
                    'name': 'Champaign Electronic Shop',
                    'address1': '1001 Cambridge St',
                    'address2': null,
                    'city': 'Cambridge',
                    'postalCode': '02141',
                    'phone': '+1-617-714-2640',
                    'stateCode': 'MA',
                    'inventoryListId': 'inventory_store_store4'
                }
            ];

            myRequest.method = 'GET';
            myRequest.url = config.baseUrl + '/Stores-FindAvailableStores?postalCode=' + postalCode + '&radius=' + radius;

            return request(myRequest)
                .then(function (myResponse) {
                    assert.equal(myResponse.statusCode, 200);

                    var bodyAsJson = JSON.parse(myResponse.body);
                    assert.lengthOf(bodyAsJson.availableStores, 2);
                    assert.containSubset(bodyAsJson.availableStores, expectedAvailableStores);
                });
        });
    });

    describe('No store has inventory for all products', function () {
        var variantPid1 = '883360352077';
        var qty1 = 1;
        var variantPid2 = '883360520155';
        var qty2 = 1;
        var variantPid3 = '883360520889';
        var qty3 = 1;
        var variantPid4 = '883360352381';
        var qty4 = 1;

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

        var cookieString;

        before(function () {
            // ----- adding product item #1:
            myRequest.url = config.baseUrl + '/Cart-AddProduct';
            myRequest.form = {
                pid: variantPid1,
                quantity: qty1
            };

            return request(myRequest)
                .then(function () {
                    cookieString = cookieJar.getCookieString(myRequest.url);
                })

                // ----- adding product item #2:
                .then(function () {
                    myRequest.url = config.baseUrl + '/Cart-AddProduct';
                    myRequest.form = {
                        pid: variantPid2,
                        quantity: qty2
                    };

                    var cookie = request.cookie(cookieString);
                    cookieJar.setCookie(cookie, myRequest.url);

                    return request(myRequest);
                })

                // ----- adding product item #3:
                .then(function () {
                    myRequest.url = config.baseUrl + '/Cart-AddProduct';
                    myRequest.form = {
                        pid: variantPid3,
                        quantity: qty3
                    };
                    return request(myRequest);
                })

                // ----- adding product item #4:
                .then(function () {
                    myRequest.url = config.baseUrl + '/Cart-AddProduct';
                    myRequest.form = {
                        pid: variantPid4,
                        quantity: qty4
                    };
                    return request(myRequest);
                });
        });

        it('should return 0 store', function () {
            var postalCode = '01803';
            var radius = 15;

            myRequest.method = 'GET';
            myRequest.url = config.baseUrl + '/Stores-FindAvailableStores?postalCode=' + postalCode + '&radius=' + radius;

            return request(myRequest)
                .then(function (myResponse) {
                    assert.equal(myResponse.statusCode, 200);

                    var bodyAsJson = JSON.parse(myResponse.body);
                    assert.lengthOf(bodyAsJson.availableStores, 0);
                });
        });
    });

    describe('Passing pid and qty via query string', function () {
        var variantPid1 = '883360352077';
        var qty1 = 1;

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

        var cookieString;

        before(function () {
            // ----- adding product item #1:
            myRequest.url = config.baseUrl + '/Cart-AddProduct';
            myRequest.form = {
                pid: variantPid1,
                quantity: qty1
            };

            return request(myRequest)
                .then(function () {
                    cookieString = cookieJar.getCookieString(myRequest.url);
                    var cookie = request.cookie(cookieString);
                    cookieJar.setCookie(cookie, myRequest.url);
                });
        });

        it('should return 2 stores', function () {
            var postalCode = '01803';
            var radius = 30;
            var pid = '883360520889';
            var qty = 2;

            var expectedAvailableStores = [
                {
                    'name': 'Champaign Electronic Shop',
                    'address1': '1001 Cambridge St',
                    'address2': null,
                    'city': 'Cambridge',
                    'postalCode': '02141',
                    'phone': '+1-617-714-2640',
                    'stateCode': 'MA',
                    'inventoryListId': 'inventory_store_store4'
                },
                {
                    'name': 'Short Electro',
                    'address1': '584 Columbus Ave',
                    'address2': null,
                    'city': 'Boston',
                    'postalCode': '02118',
                    'phone': '+1-617-888-7276',
                    'stateCode': 'MA',
                    'storeHours': 'Mon - Sat: 10am - 9pm<br />\r\n            Sun: 12pm - 6pm',
                    'inventoryListId': 'inventory_store_store5'
                },
                {
                    'name': 'Wire-Wire',
                    'address1': '363 Hancock St',
                    'address2': null,
                    'city': 'North Quincy',
                    'postalCode': '02171',
                    'phone': '+1-617-318-2860',
                    'stateCode': 'MA',
                    'inventoryListId': 'inventory_store_store3'
                }
            ];

            myRequest.method = 'GET';
            myRequest.url = config.baseUrl + '/Stores-FindAvailableStores?postalCode=' + postalCode + '&radius=' + radius + '&pid=' + pid + '&qty=' + qty;

            return request(myRequest)
                .then(function (myResponse) {
                    assert.equal(myResponse.statusCode, 200);

                    var bodyAsJson = JSON.parse(myResponse.body);
                    assert.lengthOf(bodyAsJson.availableStores, 3);
                    assert.containSubset(bodyAsJson.availableStores, expectedAvailableStores);
                });
        });
    });

    describe('Passing pid only via query string, qty is default to 1', function () {
        var variantPid1 = '883360352077';
        var qty1 = 1;

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

        var cookieString;

        before(function () {
            // ----- adding product item #1:
            myRequest.url = config.baseUrl + '/Cart-AddProduct';
            myRequest.form = {
                pid: variantPid1,
                quantity: qty1
            };

            return request(myRequest)
                .then(function () {
                    cookieString = cookieJar.getCookieString(myRequest.url);
                    var cookie = request.cookie(cookieString);
                    cookieJar.setCookie(cookie, myRequest.url);
                });
        });

        it('should return 2 stores', function () {
            var postalCode = '06605';
            var radius = 100;
            var pid = '883360520155';

            var expectedAvailableStores = [
                {
                    'name': 'Electronics Super Store',
                    'address1': '70 Wood Ave',
                    'address2': null,
                    'city': 'Bridgeport',
                    'postalCode': '06605',
                    'phone': '+1-203-965-7014',
                    'stateCode': 'CT',
                    'inventoryListId': 'inventory_store_store11'
                },
                {
                    'name': 'Springfield Media Store',
                    'address1': '1487 Bay St',
                    'address2': null,
                    'city': 'Springfield',
                    'postalCode': '01109',
                    'phone': '+1-413-413-6916',
                    'stateCode': 'MA',
                    'storeHours': 'Here are the store hours',
                    'inventoryListId': 'inventory_store_store9'
                }
            ];

            myRequest.method = 'GET';
            myRequest.url = config.baseUrl + '/Stores-FindAvailableStores?postalCode=' + postalCode + '&radius=' + radius + '&pid=' + pid;

            return request(myRequest)
                .then(function (myResponse) {
                    assert.equal(myResponse.statusCode, 200);

                    var bodyAsJson = JSON.parse(myResponse.body);
                    assert.lengthOf(bodyAsJson.availableStores, 2);
                    assert.containSubset(bodyAsJson.availableStores, expectedAvailableStores);
                });
        });
    });
});
