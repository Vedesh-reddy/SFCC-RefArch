'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

describe('Smart commerce price lock basket sync', function () {
    var activeLock;
    var priceLock;

    function line(currentUnitPrice, quantity) {
        var adjustments = {};
        return {
            productID: 'v1',
            quantityValue: quantity,
            bonusProductLineItem: false,
            quantity: { value: quantity, unit: '' },
            product: {
                priceModel: {
                    // The Script API only accepts a dw.value.Quantity here.
                    getPrice: function (qty) {
                        if (typeof qty !== 'object') {
                            throw new Error("Can't find method getPrice(number)");
                        }
                        return { available: true, value: currentUnitPrice, currencyCode: 'INR' };
                    }
                }
            },
            adjustments: adjustments,
            getPriceAdjustmentByPromotionID: function (id) { return adjustments[id] || null; },
            createPriceAdjustment: function (id) {
                adjustments[id] = {
                    setPriceValue: function (value) { this.value = value; },
                    setLineItemText: function () {}
                };
                return adjustments[id];
            },
            removePriceAdjustment: function () { delete adjustments['smart-price-lock']; }
        };
    }

    function basket(lines) {
        return {
            customer: { registered: true, profile: { customerNo: 'c1' } },
            productLineItems: { toArray: function () { return lines; } }
        };
    }

    beforeEach(function () {
        activeLock = { custom: { lockedPrice: 1000, currencyCode: 'INR' } };
        priceLock = proxyquire('../../../cartridges/plugin_smartcommerce/cartridge/scripts/priceLock', {
            'dw/object/CustomObjectMgr': {
                queryCustomObject: function (type, query, customerNo, pid, status) {
                    return status === 'active' ? activeLock : null;
                }
            },
            'dw/catalog/ProductMgr': {},
            'dw/order/BasketMgr': {},
            'dw/util/UUIDUtils': {},
            'dw/value/Money': function () {},
            'dw/system/Site': { current: { getCustomPreferenceValue: function () { return null; } } },
            'dw/web/Resource': { msg: function (key) { return key; } },
            '*/cartridge/scripts/priceHistory': {}
        });
    });

    it('discounts the difference to the locked price for the whole quantity', function () {
        var pli = line(1150.5, 2);
        priceLock.syncBasket(basket([pli]));
        assert.equal(pli.adjustments['smart-price-lock'].value, -301);
    });

    it('removes the adjustment once the price is at or below the lock or the lock is gone', function () {
        var pli = line(1200, 1);
        priceLock.syncBasket(basket([pli]));
        assert.ok(pli.adjustments['smart-price-lock']);
        activeLock = null;
        priceLock.syncBasket(basket([pli]));
        assert.notProperty(pli.adjustments, 'smart-price-lock');

        activeLock = { custom: { lockedPrice: 1000, currencyCode: 'INR' } };
        var cheaper = line(900, 1);
        priceLock.syncBasket(basket([cheaper]));
        assert.notProperty(cheaper.adjustments, 'smart-price-lock');
    });

    it('ignores locks in another currency and guest baskets', function () {
        activeLock.custom.currencyCode = 'USD';
        var pli = line(1200, 1);
        priceLock.syncBasket(basket([pli]));
        assert.notProperty(pli.adjustments, 'smart-price-lock');

        activeLock.custom.currencyCode = 'INR';
        var guest = basket([pli]);
        guest.customer = { registered: false };
        priceLock.syncBasket(guest);
        assert.notProperty(pli.adjustments, 'smart-price-lock');
    });
});
