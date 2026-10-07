'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var base = '../../../cartridges/plugin_customwishlist/cartridge/scripts/';

describe('Custom wishlist price drop check', function () {
    var lists;
    var sent;
    var mailFails;
    var job;

    function money(value, currency) {
        return {
            value: value,
            currencyCode: currency || 'USD',
            available: true,
            toFormattedString: function () { return '$' + value; }
        };
    }

    function item(id, added, price, extra) {
        var custom = Object.assign({ wishlistAddedPrice: added, wishlistPriceCurrency: 'USD' }, extra);
        return {
            ID: id,
            custom: custom,
            product: {
                ID: 'p-' + id,
                name: 'Product ' + id,
                online: true,
                priceModel: { price: price },
                getImage: function () { return null; }
            }
        };
    }

    function list(items, email) {
        return {
            ID: 'list-' + lists.length,
            owner: { profile: { email: email === undefined ? 'a@b.com' : email, firstName: 'A' } },
            productItems: { toArray: function () { return items; } }
        };
    }

    beforeEach(function () {
        lists = [];
        sent = [];
        mailFails = false;
        function Status(code, status, message) { this.code = code; this.message = message; }
        Status.OK = 0;
        Status.ERROR = 1;
        var common = {
            'dw/customer/ProductList': { TYPE_WISH_LIST: 10 },
            'dw/system/Transaction': { wrap: function (fn) { return fn(); } },
            'dw/web/URLUtils': { https: function () { return { toString: function () { return 'https://x'; } }; } }
        };
        var wishlist = proxyquire(base + 'customWishlist', Object.assign({
            'dw/customer/ProductListMgr': {},
            'dw/catalog/ProductMgr': {},
            'dw/value/Money': function (value) { this.toFormattedString = function () { return '$' + value; }; }
        }, common));
        job = proxyquire(base + 'jobs/priceDropCheck', Object.assign({
            'dw/customer/ProductListMgr': {
                queryProductLists: function (query, sort, type) {
                    assert.equal(query, 'type = {0}');
                    assert.equal(type, 10);
                    var i = 0;
                    return {
                        hasNext: function () { return i < lists.length; },
                        next: function () { i += 1; return lists[i - 1]; },
                        close: function () {}
                    };
                }
            },
            'dw/system/Status': Status,
            'dw/web/Resource': { msg: function (key) { return key; } },
            'dw/system/Site': { current: { getCustomPreferenceValue: function () { return 'shop@b.com'; } } },
            'dw/system/Logger': { getLogger: function () { return { error: function () {}, info: function () {} }; } },
            '*/cartridge/scripts/customWishlist': wishlist,
            '*/cartridge/scripts/helpers/emailHelpers': {
                sendEmail: function (emailObj, template, context) {
                    if (mailFails) { throw new Error('mail down'); }
                    sent.push({ emailObj: emailObj, template: template, context: context });
                }
            }
        }, common));
    });

    it('flags a drop, records the notified price and sends one email per list', function () {
        var dropped = item('1', 100, money(80));
        var same = item('2', 50, money(50));
        lists.push(list([dropped, same]));
        var status = job.execute();
        assert.equal(status.code, 0);
        assert.isTrue(dropped.custom.wishlistPriceAlertPending);
        assert.equal(dropped.custom.wishlistLastNotifiedPrice, 80);
        assert.isUndefined(same.custom.wishlistPriceAlertPending);
        assert.lengthOf(sent, 1);
        assert.equal(sent[0].emailObj.to, 'a@b.com');
        assert.equal(sent[0].template, 'wishlist/priceDropEmail');
        assert.lengthOf(sent[0].context.items, 1);
        assert.equal(sent[0].context.items[0].pid, 'p-1');
    });

    it('does not re-notify the same price, but notifies a further drop', function () {
        var it1 = item('1', 100, money(80), { wishlistLastNotifiedPrice: 80 });
        lists.push(list([it1]));
        job.execute();
        assert.lengthOf(sent, 0);
        it1.product.priceModel.price = money(70);
        job.execute();
        assert.lengthOf(sent, 1);
        assert.equal(it1.custom.wishlistLastNotifiedPrice, 70);
    });

    it('skips currency mismatches, missing prices and offline products', function () {
        var other = item('1', 100, money(10, 'EUR'));
        var noPrice = item('2', 100, { available: false });
        var offline = item('3', 100, money(10));
        offline.product.online = false;
        lists.push(list([other, noPrice, offline]));
        job.execute();
        assert.lengthOf(sent, 0);
        assert.isUndefined(other.custom.wishlistPriceAlertPending);
        assert.isUndefined(offline.custom.wishlistPriceAlertPending);
    });

    it('uses the lowest variant price for an unpriced master', function () {
        var master = item('1', 100, { available: false });
        master.product.master = true;
        master.product.priceModel.minPrice = money(60);
        lists.push(list([master]));
        job.execute();
        assert.lengthOf(sent, 1);
        assert.equal(master.custom.wishlistLastNotifiedPrice, 60);
    });

    it('keeps the popup flag when email fails and reports ERROR', function () {
        mailFails = true;
        var dropped = item('1', 100, money(80));
        var next = item('2', 100, money(90));
        lists.push(list([dropped]), list([next]));
        var status = job.execute();
        assert.equal(status.code, 1);
        assert.isTrue(dropped.custom.wishlistPriceAlertPending);
        assert.isTrue(next.custom.wishlistPriceAlertPending);
    });

    it('flags the popup without emailing when the profile has no email', function () {
        var dropped = item('1', 100, money(80));
        lists.push(list([dropped], null));
        job.execute();
        assert.lengthOf(sent, 0);
        assert.isTrue(dropped.custom.wishlistPriceAlertPending);
    });
});
