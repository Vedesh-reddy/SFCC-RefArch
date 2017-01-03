'use strict';

var assert = require('chai').assert;
var ArrayList = require('../../../mocks/dw.util.Collection.js');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

describe('dwHelpers', function () {
    var helpers = null;

    beforeEach(function () {
        helpers = proxyquire('../../../../cartridges/app_storefront_base/cartridge/scripts/dwHelpers', {
            'dw/util/ArrayList': ArrayList
        });
    });

    describe('map', function () {
        it('should map collection to an array', function () {
            var collection = new ArrayList([1, 2, 3]);
            var result = helpers.map(collection, function (item) {
                return item + 10;
            });

            assert.deepEqual(result, [11, 12, 13]);
        });

        it('should map empty collection to an empty array', function () {
            var collection = new ArrayList();
            var result = helpers.map(collection, function (item) {
                return item + 10;
            });

            assert.deepEqual(result, []);
        });

        it('should execute callback with the right scope', function () {
            var collection = new ArrayList([1, 2, 3]);
            var scope = {};

            var result = helpers.map(collection, function (item) {
                this[item] = 'test';
                return item + 10;
            }, scope);

            assert.deepEqual(scope, { '1': 'test', '2': 'test', '3': 'test' });
            assert.deepEqual(result, [11, 12, 13]);
        });
    });

    describe('forEach', function () {
        it('should correctly iterate over collection', function () {
            var collection = new ArrayList([1, 2, 3]);
            var result = [];

            helpers.forEach(collection, function (item) {
                result.push(item);
            });

            assert.deepEqual(result, [1, 2, 3]);
        });

        it('should never call iterator function for empty collection', function () {
            var collection = new ArrayList();
            var called = false;

            helpers.forEach(collection, function () {
                called = true;
            });

            assert.isFalse(called);
        });

        it('should execute callback with the right scope', function () {
            var scope = { result: [] };
            var collection = new ArrayList([1, 2, 3]);

            helpers.forEach(collection, function (item) {
                this.result.push(item);
            }, scope);

            assert.deepEqual(scope.result, [1, 2, 3]);
        });
    });

    describe('concat', function () {
        it('should concatinate multiple collection into one', function () {
            var collection1 = new ArrayList([1, 2, 3]);
            var collection2 = new ArrayList([4, 5, 6]);
            var collection3 = new ArrayList([7, 8, 9]);

            var result = helpers.concat(collection1, collection2, collection3);

            assert.isFalse(Array.isArray(result));
            assert.deepEqual(result.toArray(), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
        });

        it('should not concatinate empty collections', function () {
            var collection1 = new ArrayList([1, 2, 3]);
            var collection2 = new ArrayList();

            var result = helpers.concat(collection1, collection2);

            assert.deepEqual(result.toArray(), [1, 2, 3]);
        });
    });

    describe('reduce', function () {
        it('should add all numbers in collection', function () {
            var collection = new ArrayList([1, 2, 3, 4, 5]);

            var result = helpers.reduce(collection, function (prev, current) { return current + prev; });

            assert.equal(result, 15);
        });

        it('should add all numbers in collection with different initialValue', function () {
            var collection = new ArrayList([1, 2, 3, 4, 5]);

            var result = helpers.reduce(collection, function (prev, current) { return current + prev; }, 10);

            assert.equal(result, 25);
        });

        it('should return initialValue', function () {
            var collection = new ArrayList([]);

            var result = helpers.reduce(collection, function (prev, current) { return current + prev; }, 10);

            assert.equal(result, 10);
        });

        it('should return unmodified first item', function () {
            var collection = new ArrayList(['hello']);

            var result = helpers.reduce(collection, function () { return 'goodbuy'; });

            assert.equal(result, 'hello');
        });

        it('should return modified first item', function () {
            var collection = new ArrayList(['hello']);

            var result = helpers.reduce(collection, function () { return 'goodbuy'; }, 'a');

            assert.equal(result, 'goodbuy');
        });

        it('should throw an exception if no collection is provided', function () {
            var collection = new ArrayList([]);

            try {
                helpers.reduce(collection, function (prev, current) { return current + prev; });
            } catch (e) {
                assert.isTrue(e instanceof TypeError);
            }
        });

        it('should throw if no reducer provided', function () {
            try {
                helpers.reduce(null, null);
            } catch (e) {
                assert.isTrue(e instanceof TypeError);
            }
        });
    });

    describe('pluck', function () {
        describe('Collection subclass as input', function () {
            it('should correctly pluck the property of an object from collection', function () {
                var collection = new ArrayList([{ ID: 111, name: 'abc' }, { ID: 'def', name: 'ghi' }]);
                var result = helpers.pluck(collection, 'ID');
                assert.sameMembers(result, [111, 'def']);
            });

            it('should return empty list if property does not exist in any object in collection', function () {
                var collection = new ArrayList([{ ID: 111, name: 'abc' }, { ID: 'def', name: 'ghi' }]);
                var result = helpers.pluck(collection, 'address');
                assert.sameMembers(result, []);
            });

            it('should return empty list if collection is empty', function () {
                var collection = new ArrayList([]);
                var result = helpers.pluck(collection, 'address');
                assert.sameMembers(result, []);
            });
        });

        describe('Iterator as input', function () {
            it('should correctly pluck the property of an object from collection', function () {
                var collection = new ArrayList([{ ID: 111, name: 'abc' }, { ID: 'def', name: 'ghi' }]);
                var iterator = collection.iterator();
                var result = helpers.pluck(iterator, 'ID');
                assert.sameMembers(result, [111, 'def']);
            });

            it('should return empty list if property does not exist in any object in collection', function () {
                var collection = new ArrayList([{ ID: 111, name: 'abc' }, { ID: 'def', name: 'ghi' }]);
                var iterator = collection.iterator();
                var result = helpers.pluck(iterator, 'address');
                assert.sameMembers(result, []);
            });

            it('should return empty list if collection is empty', function () {
                var collection = new ArrayList([]);
                var iterator = collection.iterator();
                var result = helpers.pluck(iterator, 'address');
                assert.sameMembers(result, []);
            });
        });
    });

    describe('find', function () {
        it('should find correct item in the collection', function () {
            var collection = new ArrayList([{ ID: 111, name: 'abc' }, { ID: 'def', name: 'ghi' }]);
            var result = helpers.find(collection, function (item) {
                return item.ID === 'def';
            });
            assert.deepEqual(result, { ID: 'def', name: 'ghi' });
        });
        it('should return null if it can not find correct value', function () {
            var collection = new ArrayList([{ ID: 111, name: 'abc' }, { ID: 'def', name: 'ghi' }]);
            var result = helpers.find(collection, function (item) {
                return item.ID === 'blah';
            });
            assert.isNull(result);
        });
        it('should return an int from the simple collection', function () {
            var collection = new ArrayList([1, 2, 3, 4, 5, 6]);
            var result = helpers.find(collection, function (item) {
                return item === 3;
            });
            assert.equal(result, 3);
        });
        it('should properly call match function with the right scope', function () {
            var collection = new ArrayList([1, 2, 3, 4, 5, 6]);
            var scope = {};
            var result = helpers.find(collection, function (item) {
                this[item] = 'test';
                return item === 3;
            }, scope);
            assert.equal(scope[1], 'test');
            assert.equal(scope[2], 'test');
            assert.equal(scope[3], 'test');
            assert.equal(result, 3);
        });
    });

    describe('first', function () {
        it('should return first item form the collection', function () {
            var collection = new ArrayList([1, 2, 3, 4, 5]);
            var result = helpers.first(collection);

            assert.equal(result, 1);
        });
        it('should return null if collection is empty', function () {
            var collection = new ArrayList([]);
            var result = helpers.first(collection);

            assert.isNull(result);
        });
    });
});
