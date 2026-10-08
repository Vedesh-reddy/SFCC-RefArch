'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

describe('Smart commerce order self-service', function () {
    var orders;
    var service;
    var Order = {
        ORDER_STATUS_CREATED: 0,
        ORDER_STATUS_NEW: 3,
        ORDER_STATUS_OPEN: 4,
        ORDER_STATUS_CANCELLED: 6,
        ORDER_STATUS_FAILED: 8,
        SHIPPING_STATUS_NOTSHIPPED: 0,
        SHIPPING_STATUS_SHIPPED: 2,
        EXPORT_STATUS_EXPORTED: 1,
        EXPORT_STATUS_READY: 2
    };

    function order(extra) {
        return Object.assign({
            orderNo: '001',
            orderToken: 'token',
            customerNo: 'c1',
            customerEmail: 'Shopper@Example.com',
            billingAddress: { phone: '+91 98765-43210' },
            creationDate: new Date(Date.now() - (5 * 60000)),
            status: { value: Order.ORDER_STATUS_NEW },
            shippingStatus: { value: Order.SHIPPING_STATUS_NOTSHIPPED },
            exportStatus: { value: Order.EXPORT_STATUS_READY }
        }, extra);
    }

    function request(privacy, customer) {
        return {
            session: { raw: { privacy: privacy || {} } },
            currentCustomer: { raw: customer || { authenticated: false, registered: false } }
        };
    }

    beforeEach(function () {
        orders = { '001': order() };
        service = proxyquire('../../../cartridges/plugin_smartcommerce/cartridge/scripts/orderSelfService', {
            'dw/order/OrderMgr': {
                getOrder: function (orderNo, token) {
                    var found = orders[orderNo] || null;
                    return found && (token === undefined || token === found.orderToken) ? found : null;
                }
            },
            'dw/order/Order': Order,
            'dw/catalog/ProductMgr': {},
            'dw/system/Transaction': { wrap: function (fn) { return fn(); } },
            'dw/system/Site': { current: { getCustomPreferenceValue: function () { return 15; } } },
            'dw/web/Resource': { msg: function (key) { return key; } }
        });
    });

    it('matches the order by email, case-insensitive, or by billing phone digits', function () {
        assert.ok(service.findForLookup('001', 'shopper@example.com '));
        assert.ok(service.findForLookup('001', '9876543210'));
        assert.isNull(service.findForLookup('001', 'other@example.com'));
        assert.isNull(service.findForLookup('001', '12345'));
        assert.isNull(service.findForLookup('999', 'shopper@example.com'));
    });

    it('never finds unplaced or failed orders', function () {
        orders['001'] = order({ status: { value: Order.ORDER_STATUS_FAILED } });
        assert.isNull(service.findForLookup('001', 'shopper@example.com'));
    });

    it('authorizes the OTP-verified session or the registered owner only', function () {
        assert.isNull(service.authorizedOrder(request(), '001'));
        assert.ok(service.authorizedOrder(request({ smartTrackedOrderNo: '001', smartTrackedOrderToken: 'token' }), '001'));
        assert.isNull(service.authorizedOrder(request({ smartTrackedOrderNo: '001', smartTrackedOrderToken: 'forged' }), '001'));
        var owner = { authenticated: true, registered: true, profile: { customerNo: 'c1' } };
        var stranger = { authenticated: true, registered: true, profile: { customerNo: 'c2' } };
        assert.ok(service.authorizedOrder(request({}, owner), '001'));
        assert.isNull(service.authorizedOrder(request({}, stranger), '001'));
    });

    it('closes the modification window at the cutoff, on shipping, export or cancellation', function () {
        assert.isTrue(service.isEditable(order()));
        assert.isFalse(service.isEditable(order({ creationDate: new Date(Date.now() - (16 * 60000)) })));
        assert.isFalse(service.isEditable(order({ shippingStatus: { value: Order.SHIPPING_STATUS_SHIPPED } })));
        assert.isFalse(service.isEditable(order({ exportStatus: { value: Order.EXPORT_STATUS_EXPORTED } })));
        assert.isFalse(service.isEditable(order({ status: { value: Order.ORDER_STATUS_CANCELLED } })));
    });
});
