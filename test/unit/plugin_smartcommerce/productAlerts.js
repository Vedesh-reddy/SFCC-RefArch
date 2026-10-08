'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var base = '../../../cartridges/plugin_smartcommerce/cartridge/scripts/';

describe('Smart commerce product alerts', function () {
    var store;
    var products;
    var sent;
    var mailFails;
    var productAlerts;
    var job;

    function product(id, orderable, price) {
        return {
            ID: id,
            name: 'Product ' + id,
            online: true,
            availabilityModel: { isOrderable: function () { return orderable; } },
            getImage: function () { return null; },
            priceModel: { price: { available: true, value: price, currencyCode: 'USD', toFormattedString: function () { return '$' + price; } } }
        };
    }

    beforeEach(function () {
        store = {};
        products = {};
        sent = [];
        mailFails = false;
        function Status(code) { this.code = code; }
        Status.OK = 0;
        Status.ERROR = 1;
        var transaction = { wrap: function (fn) { return fn(); } };
        var customObjectMgr = {
            getCustomObject: function (type, key) { return store[key] || null; },
            createCustomObject: function (type, key) {
                store[key] = { UUID: key, custom: {} };
                return store[key];
            },
            queryCustomObjects: function (type, query, sort, status) {
                var items = Object.keys(store).map(function (key) { return store[key]; }).filter(function (alert) {
                    return alert.custom.status === status;
                });
                return {
                    hasNext: function () { return items.length > 0; },
                    next: function () { return items.shift(); },
                    close: function () {}
                };
            }
        };
        var priceHistory = proxyquire(base + 'priceHistory', {
            'dw/object/CustomObjectMgr': customObjectMgr,
            'dw/system/Transaction': transaction,
            'dw/value/Money': function () {}
        });
        productAlerts = proxyquire(base + 'productAlerts', {
            'dw/object/CustomObjectMgr': customObjectMgr,
            'dw/system/Transaction': transaction,
            'dw/system/Site': { current: { getCustomPreferenceValue: function () { return null; } } },
            '*/cartridge/scripts/priceHistory': priceHistory
        });
        job = proxyquire(base + 'jobs/sendProductAlerts', {
            'dw/object/CustomObjectMgr': customObjectMgr,
            'dw/catalog/ProductMgr': { getProduct: function (id) { return products[id] || null; } },
            'dw/system/Status': Status,
            'dw/web/URLUtils': { https: function () { return 'https://x'; } },
            'dw/system/Logger': { getLogger: function () { return { error: function () {}, info: function () {} }; } },
            '*/cartridge/scripts/productAlerts': productAlerts,
            '*/cartridge/scripts/priceHistory': priceHistory,
            '*/cartridge/scripts/smartMail': {
                send: function (to, subjectKey) {
                    if (mailFails) {
                        throw new Error('smtp');
                    }
                    sent.push({ to: to, subjectKey: subjectKey });
                }
            }
        });
    });

    it('rejects masters and in-stock items for stock alerts', function () {
        var master = product('m', false, 10);
        master.master = true;
        assert.equal(productAlerts.subscribe('stock', master, 'a@b.com').error, 'error.alert.variant');
        assert.equal(productAlerts.subscribe('stock', product('v', true, 10), 'a@b.com').error, 'error.alert.instock');
        assert.equal(productAlerts.subscribe('other', product('v', false, 10), 'a@b.com').error, 'error.alert.product');
    });

    it('deduplicates pending subscriptions per type, SKU and email', function () {
        var variant = product('v1', false, 10);
        assert.isFalse(productAlerts.subscribe('stock', variant, 'a@b.com').already);
        assert.isTrue(productAlerts.subscribe('stock', variant, 'a@b.com').already);
        assert.lengthOf(Object.keys(store), 1);
        assert.isFalse(productAlerts.subscribe('price', variant, 'a@b.com').already, 'price alert is separate');
    });

    it('sends triggered alerts once and leaves waiting ones pending', function () {
        products.v1 = product('v1', false, 10);
        products.v2 = product('v2', false, 50);
        productAlerts.subscribe('stock', products.v1, 'a@b.com');
        productAlerts.subscribe('price', products.v2, 'c@d.com');
        products.v1 = product('v1', true, 10);
        products.v2 = product('v2', false, 40);
        job.execute();
        job.execute();
        assert.deepEqual(sent, [{ to: 'a@b.com', subjectKey: 'email.alert.subject.stock' }, { to: 'c@d.com', subjectKey: 'email.alert.subject.price' }]);
        assert.equal(store['stock|v1|a@b.com'].custom.status, 'sent');
    });

    it('expires old alerts and marks mail failures without retrying', function () {
        products.v1 = product('v1', false, 10);
        productAlerts.subscribe('stock', products.v1, 'a@b.com');
        productAlerts.subscribe('stock', products.v1, 'old@b.com');
        store['stock|v1|old@b.com'].custom.expiresAt = new Date(Date.now() - 1000);
        products.v1 = product('v1', true, 10);
        mailFails = true;
        assert.equal(job.execute().code, 1);
        assert.equal(store['stock|v1|old@b.com'].custom.status, 'expired');
        assert.equal(store['stock|v1|a@b.com'].custom.status, 'failed');
    });
});
