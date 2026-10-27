'use strict';

var assert = require('chai').assert;
var harness = require('./harness');
var fixtures = require('./fixtures');

var ORDER = { CREATED: 0, NEW: 3, CANCELLED: 6, FAILED: 8 };
var PAYMENT = { NOTPAID: 0, PAID: 2 };

/**
 * @param {Object} h - harness
 * @param {Object} opts - {orderNo, status, payment, lines: [{sellerId, productId, qty, netCents}]}
 * @returns {Object} order double
 */
function order(h, opts) {
    var lines = opts.lines.map(function (l, i) {
        return {
            UUID: 'LINE' + i,
            productID: l.productId,
            productName: 'Product ' + l.productId,
            quantityValue: l.qty,
            bonusProductLineItem: false,
            custom: { mktOfferId: l.sellerId + ':' + l.productId, mktSellerId: l.sellerId },
            proratedPrice: new h.Money(l.netCents / 100, 'USD'),
            basePrice: new h.Money(l.netCents / l.qty / 100, 'USD'),
            adjustedTax: new h.Money(0, 'USD'),
            priceAdjustments: { toArray: function () { return l.promotionIds ? l.promotionIds.map(function (p) { return { promotionID: p }; }) : []; } },
            shippingLineItem: null,
            shipment: { shippingAddress: { fullName: 'Pat Buyer', address1: '1 Main', city: 'Austin', stateCode: 'TX', postalCode: '73301', countryCode: { value: 'US' } } }
        };
    });
    return {
        orderNo: opts.orderNo || '00001',
        customerNo: opts.customerNo || 'BUYER1',
        creationDate: new Date(),
        status: { value: opts.status === undefined ? ORDER.NEW : opts.status },
        paymentStatus: { value: opts.payment === undefined ? PAYMENT.PAID : opts.payment },
        productLineItems: { toArray: function () { return lines; } }
    };
}

describe('plugin_seller orders and finance', function () {
    var h;
    var orderHelpers;
    var admin;

    /**
     * @param {string} customerNo - seller member
     * @returns {Object} orders.write context
     */
    function sellerContext(customerNo) {
        return fixtures.context(h, customerNo, 'orders.write');
    }

    /**
     * @param {Object} o - order double
     * @returns {Object} counts
     */
    function sync(o) {
        return orderHelpers.syncOrder(o, orderHelpers.getActiveRules(new Date()));
    }

    /**
     * @param {string} type - entry type
     * @returns {number} sum of the entries of that type
     */
    function sum(type) {
        return h.rows('MarketplaceLedgerEntry').filter(function (e) { return e.custom.entryType === type; }).reduce(function (t, e) { return t + e.custom.amountCents; }, 0);
    }

    /**
     * @param {number} quantity - units of LINE0
     * @param {string} key - idempotency key
     * @param {string} [customerNo] - seller member
     * @returns {Object} result
     */
    function ship(quantity, key, customerNo) {
        return orderHelpers.shipOrder(sellerContext(customerNo || 'C1'), '00001', { carrier: 'UPS', trackingNumber: '1Z999' + key.slice(-1), lines: [{ lineId: 'LINE0', quantity: quantity }] }, key);
    }

    beforeEach(function () {
        h = harness({ preferences: { sellerSettlementHoldDays: 0, sellerSettlementMinimumCents: 100, sellerOrderFeeCents: 50 } });
        fixtures.product(h, 'P1');
        fixtures.product(h, 'P2');
        fixtures.approvedSeller(h, 'SELLERA', 'C1');
        fixtures.approvedSeller(h, 'SELLERB', 'C2');
        orderHelpers = h.require('scripts/helpers/sellerOrderHelpers');
        admin = h.require('scripts/helpers/marketplaceHelpers').actor('ADMIN', 'finance');
        orderHelpers.createRule({ scope: 'DEFAULT', rateBps: '1000' }, admin);
    });

    describe('commission rules', function () {
        it('chooses the most specific scope, then priority', function () {
            var rules = [
                { ruleId: 'D', scope: 'DEFAULT', rateBps: 1000, fixedCents: 0, priority: 0 },
                { ruleId: 'C', scope: 'CATEGORY', scopeValue: 'electronics', rateBps: 800, fixedCents: 0, priority: 0 },
                { ruleId: 'S', scope: 'SELLER', scopeValue: 'SELLERA', rateBps: 500, fixedCents: 0, priority: 0 },
                { ruleId: 'P1', scope: 'PROMOTION', scopeValue: 'SUMMER', rateBps: 600, fixedCents: 0, priority: 1 },
                { ruleId: 'P2', scope: 'PROMOTION', scopeValue: 'SUMMER', rateBps: 700, fixedCents: 0, priority: 5 }
            ];
            assert.equal(orderHelpers.findRule(rules, { sellerId: 'SELLERA', categoryIds: ['electronics'] }).ruleId, 'S');
            assert.equal(orderHelpers.findRule(rules, { sellerId: 'SELLERB', categoryIds: ['electronics'], promotionIds: ['SUMMER'] }).ruleId, 'P2');
            assert.equal(orderHelpers.findRule(rules, { sellerId: 'SELLERB', categoryIds: ['electronics'] }).ruleId, 'C');
            assert.equal(orderHelpers.findRule(rules, { sellerId: 'SELLERB', categoryIds: [] }).ruleId, 'D');
        });

        it('rounds half up, caps commission at the line amount and adds the fixed fee per unit', function () {
            assert.equal(orderHelpers.getCommission({ rateBps: 1000, fixedCents: 25 }, 10000, 2), 1050);
            assert.equal(orderHelpers.getCommission({ rateBps: 5000, fixedCents: 10000 }, 1000, 1), 1000);
            assert.equal(orderHelpers.getCommission({ rateBps: 1000, fixedCents: 0 }, 1005, 1), 101);
            assert.equal(orderHelpers.getCommission({ rateBps: 1000, fixedCents: 0 }, 1004, 1), 100);
        });

        it('validates rules', function () {
            assert.equal(orderHelpers.createRule({ scope: 'SELLER', rateBps: '100' }, admin).fields.scopeValue, 'required');
            assert.equal(orderHelpers.createRule({ scope: 'DEFAULT', rateBps: '90000' }, admin).fields.rateBps, 'out-of-range');
        });
    });

    it('creates one seller order per seller, idempotently, and only for placed orders', function () {
        var o = order(h, { lines: [{ sellerId: 'SELLERA', productId: 'P1', qty: 2, netCents: 20000 }, { sellerId: 'SELLERB', productId: 'P2', qty: 1, netCents: 5000 }] });
        assert.equal(sync(o).created, 2);
        assert.equal(sync(o).created, 0);
        var a = h.get('MarketplaceSellerOrder', '00001:SELLERA');
        assert.equal(a.custom.status, 'AWAITING_FULFILLMENT');
        assert.equal(a.custom.commissionCents, 2000);
        assert.equal(sync(order(h, { orderNo: '00002', status: ORDER.CREATED, lines: [{ sellerId: 'SELLERA', productId: 'P1', qty: 1, netCents: 100 }] })).created, 0);
        assert.equal(sync(order(h, { orderNo: '00003', status: ORDER.FAILED, lines: [{ sellerId: 'SELLERA', productId: 'P1', qty: 1, netCents: 100 }] })).created, 0);
    });

    it('waits for payment before the seller sees the order, and cancels unpaid cancelled orders', function () {
        var o = order(h, { payment: PAYMENT.NOTPAID, lines: [{ sellerId: 'SELLERA', productId: 'P1', qty: 1, netCents: 1000 }] });
        sync(o);
        assert.equal(h.get('MarketplaceSellerOrder', '00001:SELLERA').custom.status, 'PENDING_PAYMENT');
        assert.isNull(orderHelpers.getSellerOrderDetail(fixtures.context(h, 'C1', 'orders.read'), '00001'));
        o.status.value = ORDER.CANCELLED;
        sync(o);
        assert.equal(h.get('MarketplaceSellerOrder', '00001:SELLERA').custom.status, 'CANCELLED');
    });

    it('books sale, commission and the order fee once per shipped quantity, replaying a repeated shipment', function () {
        sync(order(h, { lines: [{ sellerId: 'SELLERA', productId: 'P1', qty: 3, netCents: 30000 }] }));
        assert.equal(ship(1, 'ship-key-0001').sellerOrderView.status, 'PARTIALLY_SHIPPED');
        assert.isFalse(ship(1, 'ship-key-0001').error);
        assert.equal(sum('SALE'), 10000);
        assert.equal(sum('COMMISSION'), -1000);
        assert.equal(sum('ORDER_FEE'), -50);
        ship(2, 'ship-key-0002');
        assert.equal(sum('SALE'), 30000);
        assert.equal(sum('COMMISSION'), -3000);
        assert.equal(sum('ORDER_FEE'), -50);
        assert.equal(ship(1, 'ship-key-0003').errorCode, 'not-allowed-now');
    });

    it('refuses to ship more than ordered or another seller order', function () {
        sync(order(h, { lines: [{ sellerId: 'SELLERA', productId: 'P1', qty: 1, netCents: 1000 }] }));
        assert.equal(ship(2, 'ship-key-0001').errorCode, 'invalid');
        assert.equal(ship(1, 'ship-key-0001', 'C2').errorCode, 'not-found');
    });

    it('records refunds with a proportional commission reversal, applying each event once', function () {
        sync(order(h, { lines: [{ sellerId: 'SELLERA', productId: 'P1', qty: 2, netCents: 20000 }] }));
        ship(2, 'ship-key-0001');
        var event = { eventId: 'refund-0001', type: 'REFUNDED', lines: [{ lineId: 'LINE0', amountCents: 5000 }] };
        orderHelpers.applyOrderEvent('00001', 'SELLERA', event, admin);
        orderHelpers.applyOrderEvent('00001', 'SELLERA', event, admin);
        assert.equal(sum('REFUND'), -5000);
        assert.equal(sum('COMMISSION_REVERSAL'), 500);
        var tooMuch = orderHelpers.applyOrderEvent('00001', 'SELLERA', { eventId: 'refund-0002', type: 'REFUNDED', lines: [{ lineId: 'LINE0', amountCents: 20000 }] }, admin);
        assert.equal(tooMuch.errorCode, 'invalid');
    });

    it('confirms seller cancellation requests through events', function () {
        sync(order(h, { lines: [{ sellerId: 'SELLERA', productId: 'P1', qty: 2, netCents: 2000 }] }));
        assert.isFalse(orderHelpers.requestCancellation(sellerContext('C1'), '00001', { lineId: 'LINE0', quantity: 2, reason: 'OUT_OF_STOCK' }).error);
        assert.isTrue(h.rows('MarketplaceCase').some(function (c) { return c.custom.caseType === 'SELLER_CANCELLATION'; }));
        var result = orderHelpers.applyOrderEvent('00001', 'SELLERA', { eventId: 'cancel-0001', type: 'CANCELLED', lines: [{ lineId: 'LINE0', quantity: 2 }] }, admin);
        assert.equal(result.sellerOrderView.status, 'CANCELLED');
        assert.lengthOf(h.rows('MarketplaceLedgerEntry'), 0);
    });

    it('books nothing without a commission rule and recovers once a rule exists', function () {
        orderHelpers.deactivateRule(h.rows('MarketplaceCommissionRule')[0].custom.ruleId, admin);
        sync(order(h, { lines: [{ sellerId: 'SELLERA', productId: 'P1', qty: 1, netCents: 1000 }] }));
        assert.isTrue(h.rows('MarketplaceCase').some(function (c) { return c.custom.caseType === 'COMMISSION_RULE_MISSING'; }));
        ship(1, 'ship-key-0001');
        assert.equal(sum('SALE'), 0);
        orderHelpers.createRule({ scope: 'DEFAULT', rateBps: '500' }, admin);
        assert.isAbove(orderHelpers.bookMissedEarnings(10), 0);
        assert.equal(sum('COMMISSION'), -50);
    });

    it('lets verified buyers rate a shipped seller order once', function () {
        sync(order(h, { lines: [{ sellerId: 'SELLERA', productId: 'P1', qty: 1, netCents: 1000 }] }));
        var buyer = h.customer('BUYER1');
        assert.equal(orderHelpers.rateSeller(buyer, '00001', 'SELLERA', 5).errorCode, 'not-allowed-now');
        ship(1, 'ship-key-0001');
        assert.equal(orderHelpers.rateSeller(h.customer('SOMEONE'), '00001', 'SELLERA', 5).errorCode, 'not-found');
        assert.isFalse(orderHelpers.rateSeller(buyer, '00001', 'SELLERA', 4).error);
        assert.equal(orderHelpers.rateSeller(buyer, '00001', 'SELLERA', 5).errorCode, 'conflict');
        assert.equal(h.get('MarketplaceSeller', 'SELLERA').custom.ratingSum, 4);
    });

    describe('ledger', function () {
        it('skips replays, refuses an amount change for the same key, and checks signs', function () {
            assert.equal(orderHelpers.postLedgerEntries([{ key: 'K1', sellerId: 'SELLERA', entryType: 'SALE', amountCents: 100 }]), 1);
            assert.equal(orderHelpers.postLedgerEntries([{ key: 'K1', sellerId: 'SELLERA', entryType: 'SALE', amountCents: 100 }]), 0);
            assert.throws(function () { orderHelpers.postLedgerEntries([{ key: 'K1', sellerId: 'SELLERA', entryType: 'SALE', amountCents: 101 }]); }, /ledger-conflict/);
            assert.throws(function () { orderHelpers.postLedgerEntries([{ key: 'K2', sellerId: 'SELLERA', entryType: 'COMMISSION', amountCents: 5 }]); }, /Invalid ledger entry/);
            assert.throws(function () { orderHelpers.postLedgerEntries([{ key: 'K3', sellerId: 'SELLERA', entryType: 'SALE', amountCents: 1.5 }]); }, /Invalid ledger entry/);
        });

        it('books admin adjustments in dollars with a reason', function () {
            assert.equal(orderHelpers.addAdjustment('SELLERA', '12.x', 'goodwill credit', admin).fields.amount, 'invalid');
            assert.equal(orderHelpers.addAdjustment('SELLERA', '12.50', 'x', admin).fields.reason, 'required');
            assert.isFalse(orderHelpers.addAdjustment('SELLERA', '-12.50', 'chargeback fee', admin).error);
            assert.equal(sum('ADJUSTMENT'), -1250);
        });
    });

    describe('settlements', function () {
        var settlementHelpers;
        beforeEach(function () {
            settlementHelpers = h.require('scripts/helpers/settlementHelpers');
        });

        it('settles available entries, holds without a verified payout account, and reconciles', function () {
            var past = new Date(Date.now() - 1000);
            orderHelpers.postLedgerEntries([
                { key: 'S1', sellerId: 'SELLERA', entryType: 'SALE', amountCents: 10000, availableOn: past },
                { key: 'S2', sellerId: 'SELLERA', entryType: 'COMMISSION', amountCents: -1000, availableOn: past },
                { key: 'S3', sellerId: 'SELLERA', entryType: 'SALE', amountCents: 5000, availableOn: new Date(Date.now() + 86400000) }
            ]);
            h.get('MarketplaceSeller', 'SELLERA').custom.bankStatus = 'PENDING';
            var id = settlementHelpers.createSettlement('SELLERA');
            var s = h.get('MarketplaceSettlement', id);
            assert.equal(s.custom.netCents, 9000);
            assert.equal(s.custom.status, 'ON_HOLD');
            assert.isNull(settlementHelpers.createSettlement('SELLERA'));
            assert.equal(settlementHelpers.reconcileSettlement(s), 'MATCHED');
            assert.equal(settlementHelpers.requestPayout(id, admin).fields.payoutAccount, 'not-verified');
            h.get('MarketplaceSeller', 'SELLERA').custom.bankStatus = 'VERIFIED';
            assert.isFalse(settlementHelpers.releaseSettlement(id, admin).error);
            assert.isFalse(settlementHelpers.requestPayout(id, admin).error);
            settlementHelpers.recordPayoutResult(id, 'PAID', 'BANK-REF-1', admin);
            settlementHelpers.recordPayoutResult(id, 'PAID', 'BANK-REF-1', admin);
            var payouts = h.rows('MarketplaceLedgerEntry').filter(function (e) { return e.custom.entryType === 'PAYOUT'; });
            assert.lengthOf(payouts, 1);
            assert.equal(payouts[0].custom.amountCents, -9000);
            assert.equal(settlementHelpers.reconcileSettlement(s), 'MATCHED');
            var balances = orderHelpers.getBalances('SELLERA');
            assert.equal(balances.paidCents, 9000);
            assert.equal(balances.pendingCents, 5000);
        });

        it('carries over balances below the minimum or negative after refunds', function () {
            var past = new Date(Date.now() - 1000);
            orderHelpers.postLedgerEntries([{ key: 'N1', sellerId: 'SELLERA', entryType: 'REFUND', amountCents: -500, availableOn: past }]);
            assert.isNull(settlementHelpers.createSettlement('SELLERA'));
            orderHelpers.postLedgerEntries([{ key: 'N2', sellerId: 'SELLERA', entryType: 'SALE', amountCents: 550, availableOn: past }]);
            assert.isNull(settlementHelpers.createSettlement('SELLERA'));
        });

        it('detects a settlement that no longer matches its entries', function () {
            orderHelpers.postLedgerEntries([{ key: 'M1', sellerId: 'SELLERA', entryType: 'SALE', amountCents: 5000, availableOn: new Date(Date.now() - 1000) }]);
            var s = h.get('MarketplaceSettlement', settlementHelpers.createSettlement('SELLERA'));
            s.custom.netCents = 4000;
            assert.equal(settlementHelpers.reconcileSettlement(s), 'MISMATCH');
            assert.isTrue(h.rows('MarketplaceCase').some(function (c) { return c.custom.caseType === 'RECONCILIATION_MISMATCH'; }));
        });

        it('accepts provider payout results only with the matching reference', function () {
            orderHelpers.postLedgerEntries([{ key: 'R1', sellerId: 'SELLERA', entryType: 'SALE', amountCents: 5000, availableOn: new Date(Date.now() - 1000) }]);
            var id = settlementHelpers.createSettlement('SELLERA');
            h.preferences.sellerPayoutProvider = { value: 'EXTERNAL' };
            h.state.hooks['app.plugin.seller.payout'] = { request: function () { return { status: 'SUBMITTED', reference: 'po_123' }; } };
            settlementHelpers.requestPayout(id, admin);
            var provider = h.require('scripts/helpers/marketplaceHelpers').actor('PROVIDER', 'payout');
            assert.equal(settlementHelpers.recordPayoutResult(id, 'PAID', 'po_999', provider).errorCode, 'conflict');
            assert.isFalse(settlementHelpers.recordPayoutResult(id, 'PAID', 'po_123', provider).error);
            assert.equal(h.get('MarketplaceSettlement', id).custom.status, 'PAID');
        });
    });

    describe('performance', function () {
        it('computes defect, late and cancellation rates in basis points', function () {
            var now = Date.now();
            var metrics = orderHelpers.getPerformanceMetrics([
                { status: 'SHIPPED', lines: [{ refundedCents: 100, returnedQty: 0 }], promisedShipBy: new Date(now - 10), shippedAt: new Date(now) },
                { status: 'AWAITING_FULFILLMENT', lines: [{ refundedCents: 0, returnedQty: 0, cancelRequestedQty: 1 }], promisedShipBy: new Date(now - 10), shippedAt: null },
                { status: 'SHIPPED', lines: [{ refundedCents: 0, returnedQty: 0 }], promisedShipBy: new Date(now + 1000), shippedAt: new Date(now), rating: 5 },
                { status: 'SHIPPED', lines: [{ refundedCents: 0, returnedQty: 0 }], promisedShipBy: new Date(now + 1000), shippedAt: new Date(now) }
            ], 1, now);
            assert.equal(metrics.orders, 4);
            assert.equal(metrics.defectRateBps, 5000);
            assert.equal(metrics.lateShipmentRateBps, 5000);
            assert.equal(metrics.cancellationRateBps, 2500);
        });
    });
});
