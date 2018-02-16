'use strict';

var assert = require('chai').assert;
var storeHelpers = require('../../../../mocks/helpers/storeHelpers');


describe('storeHelpers', function () {
    describe('createStoresResultsHtml', function () {
        it('should return the rendered HTML', function () {
            var stores = [
                {
                    ID: 'storeId00001',
                    name: 'Downtown TV Shop'
                },
                {
                    ID: 'storeId00002',
                    name: 'Uptown TV Shop'
                },
                {
                    ID: 'storeId00001',
                    name: 'Midtown TV Shop'
                }
            ];

            var renderedHtml = storeHelpers.createStoresResultsHtml(stores);
            assert.equal(renderedHtml, 'rendered html');
        });
    });
});
