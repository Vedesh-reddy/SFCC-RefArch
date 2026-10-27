'use strict';

var assert = require('chai').assert;
var harness = require('./harness');
var fixtures = require('./fixtures');

var ORDER_NEW = 3;
var ORDER_FAILED = 8;
var ORDER_CREATED = 0;

describe('plugin_wallet payments', function () {
    var h;
    var payments;
    beforeEach(function () {
        h = harness({ preferences: { walletStepUpThresholdCents: 1000000, walletMaxTransactionCents: 50000 } });
        payments = h.require('scripts/helpers/walletPaymentHelpers');
    });

    /**
     * Applies the wallet and returns the basket and the wallet instrument.
     * @param {number} totalCents - basket total
     * @param {string} [amount] - requested amount
     * @returns {Object} {basket, pi}
     */
    function applied(totalCents, amount) {
        var basket = fixtures.basket(h, totalCents);
        var result = payments.applyToBasket(h.customer('C1'), basket, { mode: 'OWN', amount: amount }, 'session-1');
        return { basket: basket, pi: payments.getWalletInstruments(basket)[0], result: result };
    }

    it('applies as much as possible, never more than the balance or the order total', function () {
        fixtures.fundedWallet(h, 'C1', 3000);
        var a = applied(10000);
        assert.equal(a.pi.custom.walletRequestedCents, 3000);
        assert.deepEqual(payments.getSplit(a.basket), { totalCents: 10000, walletCents: 3000, remainingCents: 7000 });
        var b = applied(2000);
        assert.equal(payments.getSplit(b.basket).walletCents, 2000);
        assert.equal(applied(10000, '40').result.errorCode, 'insufficient-funds');
    });

    it('splits the total between the wallet and the card, and drops the card when the wallet covers it', function () {
        fixtures.fundedWallet(h, 'C1', 3000);
        var a = applied(10000);
        var card = a.basket.createPaymentInstrument('CREDIT_CARD', new h.Money(100, 'USD'));
        assert.isTrue(payments.allocatePayments(a.basket));
        assert.equal(card.paymentTransaction.amount.value, 70);
        assert.equal(a.pi.paymentTransaction.amount.value, 30);
        var b = applied(2000);
        b.basket.createPaymentInstrument('CREDIT_CARD', new h.Money(20, 'USD'));
        assert.isTrue(payments.allocatePayments(b.basket));
        assert.lengthOf(b.basket.paymentInstruments.toArray(), 1);
        var c = applied(10000);
        assert.isFalse(payments.allocatePayments(c.basket), 'remainder without a second instrument');
    });

    it('holds at authorization, captures after placement, and releases a failed order', function () {
        fixtures.fundedWallet(h, 'C1', 5000);
        var a = applied(4000);
        var auth = payments.authorizePayment('ORD1', a.pi, h.customer('C1'), 'session-1');
        assert.isFalse(auth.error);
        var wallet = h.get('WalletAccount', 'C1').custom;
        assert.equal(wallet.availableCents, 1000);
        assert.equal(wallet.heldCents, 4000);
        fixtures.order(h, 'ORD1', ORDER_NEW, [a.pi], 4000);
        h.state.orders.ORD1.orderToken = 'tok';
        var counts = payments.settleAfterPlaceOrder([auth.holdId], { orderID: 'ORD1', orderToken: 'tok', error: false });
        assert.equal(counts.captured, 1);
        assert.equal(wallet.heldCents, 0);
        assert.equal(h.state.orders.ORD1.paymentStatus, 2, 'wallet paid the whole order');
        assert.isFalse(payments.releaseHold(auth.holdId, 'late', { type: 'SYSTEM', ref: 't' }).released, 'captured holds are never released');
        var b = applied(1000);
        var auth2 = payments.authorizePayment('ORD2', b.pi, h.customer('C1'), 'session-1');
        payments.settleAfterPlaceOrder([auth2.holdId], { error: true });
        assert.equal(wallet.availableCents, 1000);
        assert.equal(h.get('WalletHold', auth2.holdId).custom.status, 'RELEASED');
    });

    it('cannot overspend with two checkouts against the same balance', function () {
        fixtures.fundedWallet(h, 'C1', 5000);
        var first = applied(4000);
        var second = applied(4000);
        assert.isFalse(payments.authorizePayment('ORD1', first.pi, h.customer('C1'), 'session-1').error);
        assert.equal(payments.authorizePayment('ORD2', second.pi, h.customer('C1'), 'session-1').errorCode, 'insufficient-funds');
        assert.isAtLeast(h.get('WalletAccount', 'C1').custom.availableCents, 0);
        assert.lengthOf(h.rows('WalletHold'), 1, 'the refused hold left nothing behind');
    });

    it('requires a step-up code above the threshold or in a new session, bound to basket and amount, single use', function () {
        h.preferences.walletStepUpThresholdCents = 2000;
        fixtures.fundedWallet(h, 'C1', 5000);
        var a = applied(3000);
        assert.equal(payments.authorizePayment('ORD1', a.pi, h.customer('C1'), 'session-1').errorCode, 'approval-required');
        assert.equal(payments.checkBeforePlaceOrder(h.customer('C1'), a.basket, 'session-1').errorCode, 'approval-required');
        var payer = payments.getBasketPayer(h.customer('C1'), a.basket);
        payments.sendPaymentCode(payer, a.basket.UUID, 'session-1');
        var code = h.state.mails[0].context.code;
        assert.equal(h.state.mails[0].context.amount, '$30.00');
        assert.equal(payments.verifyPaymentCode(payer, 'OTHER-BASKET', code, 'session-1').errorCode, 'code-missing');
        assert.isFalse(payments.verifyPaymentCode(payer, a.basket.UUID, code, 'session-1').error);
        assert.isFalse(payments.checkBeforePlaceOrder(h.customer('C1'), a.basket, 'session-1').error);
        assert.isFalse(payments.authorizePayment('ORD1', a.pi, h.customer('C1'), 'session-1').error);
        var again = applied(3000);
        again.pi.custom.walletBasketId = a.basket.UUID;
        assert.equal(payments.authorizePayment('ORD2', again.pi, h.customer('C1'), 'session-1').errorCode, 'approval-required', 'approval was consumed');
    });

    it('drops a wallet instrument left in the basket after the wallet was switched off', function () {
        fixtures.fundedWallet(h, 'C1', 5000);
        var a = applied(1000);
        h.preferences.walletEnabled = false;
        assert.equal(payments.checkBeforePlaceOrder(h.customer('C1'), a.basket, 'session-1').errorCode, 'disabled');
        assert.lengthOf(payments.getWalletInstruments(a.basket), 0);
        assert.isFalse(payments.checkBeforePlaceOrder(h.customer('C1'), a.basket, 'session-1').error, 'the shopper can pay another way');
    });

    it('refuses a payer that is not the signed-in customer', function () {
        fixtures.fundedWallet(h, 'C1', 5000);
        fixtures.fundedWallet(h, 'C2', 5000);
        var a = applied(1000);
        assert.equal(payments.authorizePayment('ORD1', a.pi, h.customer('C2'), 'session-1').errorCode, 'payer-changed');
    });

    it('enforces wallet spending limits', function () {
        h.preferences.walletMaxTransactionCents = 1000;
        fixtures.fundedWallet(h, 'C1', 5000);
        assert.equal(applied(3000).result.fields.limit, 'transaction');
        assert.isTrue(h.rows('WalletNotification').some(function (n) { return n.custom.type === 'LIMIT_REACHED'; }));
    });

    it('refunds to the wallet once, never more than was captured', function () {
        fixtures.fundedWallet(h, 'C1', 5000);
        var a = applied(4000);
        var auth = payments.authorizePayment('ORD1', a.pi, h.customer('C1'), 'session-1');
        payments.captureHold(auth.holdId, { type: 'SYSTEM', ref: 't' });
        var admin = { type: 'ADMIN', ref: 'ops' };
        var r = payments.refundToWallet({ refundId: 'refund-0001', holdId: auth.holdId, amountCents: 1500 }, admin);
        assert.isFalse(r.replayed);
        assert.isTrue(payments.refundToWallet({ refundId: 'refund-0001', holdId: auth.holdId, amountCents: 1500 }, admin).replayed);
        assert.equal(payments.refundToWallet({ refundId: 'refund-0002', holdId: auth.holdId, amountCents: 2600 }, admin).fields.amountCents, 'exceeds-captured');
        assert.equal(h.get('WalletAccount', 'C1').custom.availableCents, 2500);
        assert.equal(payments.refundToWallet({ refundId: 'refund-0003', kind: 'STORE_CREDIT', walletId: 'C1', amountCents: 100 }, admin).errorCode, 'forbidden');
    });

    it('notifies each captured hold once, also when captures share a second across job runs', function () {
        fixtures.fundedWallet(h, 'C1', 9000);
        var first = payments.authorizePayment('ORD1', applied(1000).pi, h.customer('C1'), 'session-1');
        fixtures.order(h, 'ORD1', ORDER_NEW, [], 1000);
        assert.equal(payments.processHolds(10).notified, 1);
        var second = payments.authorizePayment('ORD2', applied(1000).pi, h.customer('C1'), 'session-1');
        fixtures.order(h, 'ORD2', ORDER_NEW, [], 1000);
        // same second as the cursor: platform queries compare datetimes to the second
        h.get('WalletHold', second.holdId).custom.capturedAt = null;
        assert.equal(payments.processHolds(10).notified, 1);
        assert.equal(payments.processHolds(10).notified, 0);
        assert.lengthOf(h.rows('WalletNotification').filter(function (n) { return n.custom.type === 'WALLET_PAYMENT' && n.custom.channel === 'INBOX'; }), 2);
        assert.isTrue([first.holdId, second.holdId].every(function (id) { return h.get('WalletHold', id).custom.status === 'CAPTURED'; }));
    });

    it('settles holds by order status in the hold job, sending unplaced orders to review', function () {
        fixtures.fundedWallet(h, 'C1', 9000);
        var placed = payments.authorizePayment('ORD1', applied(1000).pi, h.customer('C1'), 'session-1');
        var failed = payments.authorizePayment('ORD2', applied(1000).pi, h.customer('C1'), 'session-1');
        var stuck = payments.authorizePayment('ORD3', applied(1000).pi, h.customer('C1'), 'session-1');
        fixtures.order(h, 'ORD1', ORDER_NEW, [], 1000);
        fixtures.order(h, 'ORD2', ORDER_FAILED, [], 1000);
        fixtures.order(h, 'ORD3', ORDER_CREATED, [], 1000);
        h.get('WalletHold', stuck.holdId).custom.expiresAt = new Date(Date.now() - 1000);
        assert.deepEqual(payments.processHolds(10), { captured: 1, released: 1, review: 1, failed: 0, notified: 1 });
        // payment notifications come from the job, once per capture
        assert.lengthOf(h.rows('WalletNotification').filter(function (n) { return n.custom.type === 'WALLET_PAYMENT'; }), 1);
        assert.equal(payments.processHolds(10).notified, 0);
        assert.equal(h.get('WalletHold', placed.holdId).custom.status, 'CAPTURED');
        assert.equal(h.get('WalletHold', failed.holdId).custom.status, 'RELEASED');
        assert.equal(h.get('WalletHold', stuck.holdId).custom.status, 'REVIEW');
        assert.isTrue(h.rows('WalletCase').some(function (c) { return c.custom.caseType === 'HOLD_REVIEW'; }));
    });

    it('sets the shipping-benefit flag only for a merchant program and the configured wallet share', function () {
        fixtures.fundedWallet(h, 'C1', 9000);
        applied(10000, '50');
        assert.isFalse(global.session.custom.walletShippingBenefit);
        h.preferences.walletShippingBenefitEnabled = true;
        h.preferences.walletShippingBenefitMinShareBps = 5000;
        applied(10000, '50');
        assert.isTrue(global.session.custom.walletShippingBenefit);
        applied(10000, '49.99');
        assert.isFalse(global.session.custom.walletShippingBenefit);
    });
});
