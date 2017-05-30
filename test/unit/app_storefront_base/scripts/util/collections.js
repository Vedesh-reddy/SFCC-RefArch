'use strict';


var assert = require('chai').assert;
var ArrayList = require('../../../../mocks/dw.util.Collection.js');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

describe('Collections utilities', function () {
    var collections = proxyquire(
        '../../../../../cartridges/app_storefront_base/cartridge/scripts/util/collections', {
            'dw/util/ArrayList': ArrayList
        });

    describe('every() function', function () {
        var collection = new ArrayList([1, 2, 3, 4]);

        it('should return true if all items meet a criteria', function () {
            assert.isTrue(collections.every(collection, function (item) {
                return item > 0;
            }));
        });

        it('should return false if not all items meet a criteria', function () {
            assert.isFalse(collections.every(collection, function (item) {
                return item > 3;
            }));
        });
    });
});
