'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

describe('Smart commerce price history', function () {
    var DAY = 24 * 60 * 60 * 1000;
    var NOW = 1000 * DAY;
    var store;
    var priceHistory;

    function product(id, value) {
        return {
            ID: id,
            master: false,
            variationGroup: false,
            productSet: false,
            priceModel: {
                price: { available: true, value: value, currencyCode: 'USD', toFormattedString: function () { return '$' + value; } }
            }
        };
    }

    beforeEach(function () {
        store = {};
        priceHistory = proxyquire('../../../cartridges/plugin_smartcommerce/cartridge/scripts/priceHistory', {
            'dw/object/CustomObjectMgr': {
                getCustomObject: function (type, key) { return store[key] || null; },
                createCustomObject: function (type, key) {
                    store[key] = { custom: {} };
                    return store[key];
                }
            },
            'dw/system/Transaction': { wrap: function (fn) { return fn(); } },
            'dw/value/Money': function (value) { this.toFormattedString = function () { return '$' + value; }; }
        });
    });

    it('records only price changes', function () {
        assert.isTrue(priceHistory.record(product('p1', 100), NOW - (10 * DAY)));
        assert.isFalse(priceHistory.record(product('p1', 100), NOW - (5 * DAY)));
        assert.isTrue(priceHistory.record(product('p1', 90), NOW));
        assert.deepEqual(JSON.parse(store['p1|USD'].custom.priceHistory), [[NOW - (10 * DAY), 100], [NOW, 90]]);
    });

    it('skips masters, which have no own price', function () {
        var master = product('m1', 100);
        master.master = true;
        assert.isFalse(priceHistory.record(master, NOW));
        assert.isNull(priceHistory.summary(master, NOW));
    });

    it('reports the lowest price in force during the last 30 days', function () {
        priceHistory.record(product('p1', 50), NOW - (60 * DAY));
        priceHistory.record(product('p1', 80), NOW - (40 * DAY));
        priceHistory.record(product('p1', 70), NOW - (20 * DAY));
        priceHistory.record(product('p1', 100), NOW - DAY);
        var summary = priceHistory.summary(product('p1', 100), NOW);
        assert.equal(summary.lowest30, 70, 'the 50 ended before the window; 80 was in force at its start');
        assert.equal(summary.history[0].price, 100, 'newest first');
    });

    it('counts the price in force at the window start', function () {
        priceHistory.record(product('p1', 60), NOW - (45 * DAY));
        priceHistory.record(product('p1', 100), NOW - (10 * DAY));
        assert.equal(priceHistory.summary(product('p1', 100), NOW).lowest30, 60);
    });

    it('prunes points older than 90 days but keeps the one in force at the cutoff', function () {
        priceHistory.record(product('p1', 10), NOW - (200 * DAY));
        priceHistory.record(product('p1', 20), NOW - (150 * DAY));
        priceHistory.record(product('p1', 30), NOW);
        assert.deepEqual(JSON.parse(store['p1|USD'].custom.priceHistory), [[NOW - (150 * DAY), 20], [NOW, 30]]);
    });
});
