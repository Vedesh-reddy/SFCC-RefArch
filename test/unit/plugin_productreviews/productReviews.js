'use strict';

var assert = require('chai').assert;
var crypto = require('crypto');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

describe('Product review storage', function () {
    var service;
    var objects;
    var iterators;
    var products;
    var preferences;
    var siteID;
    var failRead;
    var unknownCount;
    var valid = { rating: '5', displayName: 'Shopper', title: 'Great product', body: 'Works exactly as described.' };

    function addReview(status, rating, pid) {
        var index = Object.keys(objects).length;
        objects['seed-' + index] = {
            creationDate: new Date(1000 + index),
            custom: {
                status: status, rating: rating, productID: pid || 'master', customerNo: 'private-number',
                displayName: 'Shopper', title: 'A review', body: 'Some review text.', submittedAt: new Date(1000 + index)
            }
        };
    }

    beforeEach(function () {
        objects = {};
        iterators = [];
        failRead = false;
        unknownCount = false;
        siteID = 'RefArch';
        preferences = {};
        products = { master: { ID: 'master', online: true } };
        products.variant = { ID: 'variant', online: true, variant: true, masterProduct: products.master };
        products.group = { ID: 'group', online: true, variationGroup: true, masterProduct: products.master };
        products.offline = { ID: 'offline', online: false };
        var manager = {
            getCustomObject: function (type, key) { return objects[key] || null; },
            createCustomObject: function (type, key) {
                assert.equal(type, 'ProductReview');
                assert.match(key, /^[a-f0-9]{64}$/);
                assert.isUndefined(objects[key]);
                objects[key] = { custom: {}, creationDate: new Date() };
                return objects[key];
            },
            queryCustomObjects: function (type, query, sort, pid, status, rating) {
                assert.equal(type, 'ProductReview');
                assert.equal(status, 'approved');
                assert.include(query, 'custom.productID = {0}');
                var rows = Object.keys(objects).map(function (key) { return objects[key]; }).filter(function (o) {
                    return o.custom.productID === pid && o.custom.status === status
                        && (!rating || o.custom.rating === rating);
                }).sort(function (a, b) { return b.custom.submittedAt - a.custom.submittedAt; });
                var offset = 0;
                var end = rows.length;
                var iterator = {
                    closed: false,
                    getCount: function () { return unknownCount ? -1 : rows.length; },
                    forward: function (start, size) { offset = start; end = Math.min(rows.length, start + size); },
                    hasNext: function () { return offset < end; },
                    next: function () {
                        if (failRead) throw new Error('Read failed');
                        return rows[offset++];
                    },
                    close: function () { this.closed = true; }
                };
                iterators.push(iterator);
                return iterator;
            }
        };
        function Digest() {}
        Digest.DIGEST_SHA_256 = 'SHA-256';
        Digest.prototype.digestBytes = function (input) { return crypto.createHash('sha256').update(input.value).digest(); };
        service = proxyquire('../../../cartridges/plugin_productreviews/cartridge/scripts/productReviews', {
            'dw/object/CustomObjectMgr': manager,
            'dw/catalog/ProductMgr': { getProduct: function (pid) { return products[pid]; } },
            'dw/system/Site': { getCurrent: function () {
                return { ID: siteID, getCustomPreferenceValue: function (key) { return preferences[key]; } };
            } },
            'dw/system/Transaction': { wrap: function (fn) { fn(); } },
            'dw/crypto/MessageDigest': Digest,
            'dw/crypto/Encoding': { toHex: function (bytes) { return bytes.toString('hex'); } },
            'dw/util/Bytes': function (value) { this.value = value; }
        });
    });

    it('defaults to enabled with moderation and honors explicit preferences', function () {
        assert.deepEqual(service.getSettings(), { enabled: true, moderation: true });
        preferences.productReviewsEnabled = false;
        preferences.productReviewsModeration = false;
        assert.deepEqual(service.getSettings(), { enabled: false, moderation: false });
    });

    it('groups variants and variation groups under the master', function () {
        assert.strictEqual(service.getProduct('variant'), products.master);
        assert.strictEqual(service.getProduct('group'), products.master);
        assert.strictEqual(service.getProduct('master'), products.master);
    });

    it('rejects invalid, missing and offline products, including offline parents', function () {
        [null, {}, '', 'missing', 'offline', 'x'.repeat(257)].forEach(function (pid) {
            assert.isNull(service.getProduct(pid));
        });
        products.master.online = false;
        assert.isNull(service.getProduct('variant'));
    });

    it('validates every field and does not accept fractional/out-of-range ratings', function () {
        ['0', '6', '4.5', '1e0', 'NaN', '', '5junk', '4,0', '4.01'].forEach(function (rating) {
            assert.isFalse(service.validate(Object.assign({}, valid, { rating: rating })).valid);
        });
        assert.deepEqual(Object.keys(service.validate({}).errors).sort(), ['body', 'displayName', 'rating', 'title']);
        ['displayName', 'title', 'body'].forEach(function (field) {
            var input = Object.assign({}, valid);
            input[field] = 'x'.repeat(2001);
            assert.property(service.validate(input).errors, field);
            input[field] = ' ';
            assert.property(service.validate(input).errors, field);
        });
        var normalized = service.validate(Object.assign({}, valid, { title: '  Great product  ' }));
        assert.isTrue(normalized.valid);
        assert.equal(normalized.values.title, 'Great product');
        assert.strictEqual(normalized.values.rating, 5);
    });

    it('accepts every whole-star rating including decimal serialization and whitespace', function () {
        ['1', '2', '3', '4', '5', '4.0', '5.00', ' 5 '].forEach(function (rating) {
            var result = service.validate(Object.assign({}, valid, { rating: rating }));
            assert.isTrue(result.valid, rating);
            assert.strictEqual(result.values.rating, Number(rating));
        });
    });

    it('creates a pending review without persisting client-supplied identity or status', function () {
        var input = Object.assign({}, valid, { status: 'approved', customerNo: 'attacker', productID: 'other' });
        var result = service.save('master', 'real-customer', service.validate(input).values, true);
        assert.equal(result.status, 'pending');
        var own = service.getOwnReview('master', 'real-customer');
        assert.equal(own.custom.customerNo, 'real-customer');
        assert.equal(own.custom.productID, 'master');
        assert.equal(own.custom.status, 'pending');
        assert.isNull(service.getOwnReview('master', 'attacker'));
        assert.throws(function () { service.save('master', null, valid, true); }, /authenticated/);
    });

    it('updates a single review and returns approved edits to moderation', function () {
        service.save('master', 'customer', service.validate(valid).values, false);
        var own = service.getOwnReview('master', 'customer');
        assert.equal(own.custom.status, 'approved');
        own.custom.submittedAt = new Date(Date.now() - 61000);
        var result = service.save('master', 'customer', service.validate(valid).values, true);
        assert.equal(result.status, 'pending');
        assert.equal(Object.keys(objects).length, 1);
    });

    it('limits repeated submissions without changing the stored review', function () {
        service.save('master', 'customer', service.validate(valid).values, true);
        var result = service.save('master', 'customer', { title: 'Changed' }, false);
        assert.equal(result.error, 'rate');
        assert.equal(service.getOwnReview('master', 'customer').custom.title, valid.title);
    });

    it('separates keys across customers, products and sites', function () {
        service.save('master', 'customer', valid, true);
        service.save('master', 'other-customer', valid, true);
        service.save('other-product', 'customer', valid, true);
        siteID = 'OtherSite';
        service.save('master', 'customer', valid, true);
        assert.equal(Object.keys(objects).length, 4);
    });

    it('includes only approved reviews for this product in totals and averages', function () {
        addReview('approved', 5);
        addReview('approved', 3);
        addReview('pending', 1);
        addReview('rejected', 1);
        addReview('approved', 1, 'other');
        var result = service.getReviews('master', 1);
        assert.equal(result.total, 2);
        assert.equal(result.average, '4.0');
        assert.lengthOf(result.items, 2);
        assert.notProperty(result.items[0], 'customerNo');
        assert.notProperty(result.items[0], 'status');
        assert.deepEqual(result.distribution.map(function (b) { return b.count; }), [1, 0, 1, 0, 0]);
        assert.isTrue(iterators.every(function (it) { return it.closed; }));
    });

    it('bounds pagination, orders newest first and handles malformed pages', function () {
        for (var i = 0; i < 12; i++) addReview('approved', 5);
        var first = service.getReviews('master', '-20');
        assert.equal(first.page, 1);
        assert.lengthOf(first.items, 5);
        assert.equal(first.items[0].submittedAt.getTime(), 1011);
        assert.equal(service.getReviews('master', 'garbage').page, 1);
        var last = service.getReviews('master', '999999');
        assert.equal(last.page, 3);
        assert.lengthOf(last.items, 2);
    });

    it('handles empty reviews and iterators without known counts', function () {
        assert.equal(service.getReviews('master', '0').total, 0);
        assert.equal(service.getReviews('master', 1).average, '0.0');
        unknownCount = true;
        addReview('approved', 4);
        assert.equal(service.getReviews('master', 1).total, 1);
    });

    it('closes database iterators when reading fails', function () {
        addReview('approved', 5);
        failRead = true;
        assert.throws(function () { service.getReviews('master', 1); }, /Read failed/);
        assert.isTrue(iterators.every(function (it) { return it.closed; }));
    });
});
