'use strict';

var assert = require('chai').assert;
var harness = require('./harness');
var fixtures = require('./fixtures');

describe('plugin_wallet top-ups', function () {
    it('credits a sandbox top-up only after the server-side verification, exactly once', function () {
        var h = harness();
        var topUpHelpers = h.require('scripts/helpers/walletTopUpHelpers');
        var ctx = fixtures.fundedWallet(h, 'C1', 0);
        var started = topUpHelpers.startTopUp(ctx, '25.00');
        assert.include(started.redirectUrl, 'Wallet-SandboxPay');
        assert.equal(topUpHelpers.completeTopUp(started.topUpId, ctx.actor).status, 'AWAITING_PAYMENT');
        assert.equal(h.rows('WalletAccount')[0].custom.availableCents, 0);
        assert.equal(topUpHelpers.decideSandboxPayment(ctx, started.topUpId, 'APPROVED').status, 'CREDITED');
        assert.equal(topUpHelpers.completeTopUp(started.topUpId, ctx.actor).status, 'CREDITED');
        assert.equal(topUpHelpers.decideSandboxPayment(ctx, started.topUpId, 'APPROVED').status, 'CREDITED');
        assert.equal(h.rows('WalletAccount')[0].custom.availableCents, 2500);
        assert.lengthOf(h.rows('WalletJournal').filter(function (j) { return j.custom.txType === 'TOPUP'; }), 1);
    });

    it('never touches a basket, so a top-up cannot change merchandise or shipping thresholds', function () {
        // The harness BasketMgr throws when used.
        var h = harness();
        var topUpHelpers = h.require('scripts/helpers/walletTopUpHelpers');
        var ctx = fixtures.fundedWallet(h, 'C1', 0);
        var started = topUpHelpers.startTopUp(ctx, '50');
        topUpHelpers.decideSandboxPayment(ctx, started.topUpId, 'APPROVED');
        assert.equal(h.rows('WalletAccount')[0].custom.availableCents, 5000);
    });

    it('lets only the owner decide a sandbox payment', function () {
        var h = harness();
        var topUpHelpers = h.require('scripts/helpers/walletTopUpHelpers');
        var ctx = fixtures.fundedWallet(h, 'C1', 0);
        var other = fixtures.fundedWallet(h, 'C2', 0);
        var started = topUpHelpers.startTopUp(ctx, '25');
        assert.equal(topUpHelpers.decideSandboxPayment(other, started.topUpId, 'APPROVED').errorCode, 'not-found');
        assert.equal(topUpHelpers.decideSandboxPayment(ctx, started.topUpId, 'MAYBE').fields.outcome, 'invalid');
    });

    it('enforces amount range, maximum balance (including pending top-ups) and daily velocity', function () {
        var h = harness({ preferences: { walletTopUpMinimumCents: 500, walletTopUpMaximumCents: 10000, walletMaximumBalanceCents: 15000, walletTopUpDailyCountLimit: 3 } });
        var topUpHelpers = h.require('scripts/helpers/walletTopUpHelpers');
        var ctx = fixtures.fundedWallet(h, 'C1', 0);
        assert.equal(topUpHelpers.startTopUp(ctx, '4.99').fields.amount, 'out-of-range');
        assert.equal(topUpHelpers.startTopUp(ctx, '100.01').fields.amount, 'out-of-range');
        assert.equal(topUpHelpers.startTopUp(ctx, 'ten').fields.amount, 'invalid');
        assert.isFalse(topUpHelpers.startTopUp(ctx, '100').error);
        assert.equal(topUpHelpers.startTopUp(ctx, '60').fields.limit, 'maximum-balance');
        topUpHelpers.startTopUp(ctx, '10');
        topUpHelpers.startTopUp(ctx, '10');
        assert.equal(topUpHelpers.startTopUp(ctx, '10').fields.limit, 'daily-top-ups');
        assert.isTrue(h.rows('WalletCase').some(function (c) { return c.custom.caseType === 'TOPUP_VELOCITY'; }));
    });

    it('refuses sandbox money on a production instance', function () {
        var h = harness();
        h.state.instanceType = 2;
        var ctx = fixtures.fundedWallet(h, 'C1', 0);
        assert.equal(h.require('scripts/helpers/walletTopUpHelpers').startTopUp(ctx, '25').errorCode, 'disabled');
    });

    describe('external gateway', function () {
        var h;
        var topUpHelpers;
        var ctx;
        var verified;
        beforeEach(function () {
            h = harness({ preferences: { walletGatewayMode: { value: 'EXTERNAL' }, walletLiveMoneyApproved: true } });
            verified = { status: 'PENDING' };
            h.state.hooks['app.plugin.wallet.gateway'] = {
                createPayment: function (t) { return { status: 'REDIRECT', redirectUrl: 'https://psp.example/pay/' + t.topUpId, reference: 'psp_' + t.topUpId }; },
                verifyPayment: function (t) { return Object.assign({ reference: t.reference }, verified); }
            };
            topUpHelpers = h.require('scripts/helpers/walletTopUpHelpers');
            ctx = fixtures.fundedWallet(h, 'C1', 0);
        });

        it('credits only a verified capture with the requested amount and currency', function () {
            var started = topUpHelpers.startTopUp(ctx, '40');
            verified = { status: 'CAPTURED', amountCents: 3000, currency: 'USD' };
            assert.equal(topUpHelpers.completeTopUp(started.topUpId, ctx.actor).status, 'AWAITING_PAYMENT');
            assert.isTrue(h.rows('WalletCase').some(function (c) { return c.custom.caseType === 'GATEWAY_MISMATCH'; }));
            verified = { status: 'CAPTURED', amountCents: 4000, currency: 'EUR' };
            assert.equal(topUpHelpers.completeTopUp(started.topUpId, ctx.actor).status, 'AWAITING_PAYMENT');
            verified = { status: 'CAPTURED', amountCents: 4000, currency: 'USD' };
            assert.equal(topUpHelpers.completeTopUp(started.topUpId, ctx.actor).status, 'CREDITED');
            assert.equal(h.rows('WalletAccount')[0].custom.availableCents, 4000);
        });

        it('records declined payments without crediting', function () {
            var started = topUpHelpers.startTopUp(ctx, '40');
            verified = { status: 'FAILED' };
            assert.equal(topUpHelpers.completeTopUp(started.topUpId, ctx.actor).status, 'FAILED');
            assert.equal(h.rows('WalletAccount')[0].custom.availableCents, 0);
        });

        it('fails closed when the gateway hook is missing', function () {
            delete h.state.hooks['app.plugin.wallet.gateway'];
            assert.equal(topUpHelpers.startTopUp(ctx, '40').errorCode, 'unavailable');
            assert.equal(h.rows('WalletTopUp')[0].custom.status, 'FAILED');
        });

        it('reverses a chargeback, records the shortfall, and locks the wallet', function () {
            var started = topUpHelpers.startTopUp(ctx, '40');
            verified = { status: 'CAPTURED', amountCents: 4000, currency: 'USD' };
            topUpHelpers.completeTopUp(started.topUpId, ctx.actor);
            h.mock('dw/system/Transaction').wrap(function () {
                h.require('scripts/helpers/walletAccountHelpers').postTransaction({ key: 'HOLD:X', txType: 'PURCHASE_HOLD', walletId: 'C1', amountCents: 3000, actor: ctx.actor });
            });
            var provider = { type: 'PROVIDER', ref: 'gateway' };
            assert.equal(topUpHelpers.reverseTopUp(started.topUpId, 4000, 'wrong', provider).errorCode, 'conflict');
            var result = topUpHelpers.reverseTopUp(started.topUpId, 4000, 'psp_' + started.topUpId, provider);
            assert.deepEqual(result, { error: false, reversedCents: 1000, shortfallCents: 3000 });
            var wallet = h.rows('WalletAccount')[0].custom;
            assert.equal(wallet.availableCents, 0);
            assert.equal(wallet.shortfallCents, 3000);
            assert.equal(wallet.status, 'LOCKED');
            assert.deepEqual(topUpHelpers.reverseTopUp(started.topUpId, 4000, 'psp_' + started.topUpId, provider), result);
        });

        it('reconciles: expires unpaid top-ups and still credits a late capture', function () {
            var started = topUpHelpers.startTopUp(ctx, '40');
            h.rows('WalletTopUp')[0].custom.createdAt = new Date(Date.now() - 2 * 3600000);
            assert.equal(topUpHelpers.reconcileTopUps(10).expired, 1);
            verified = { status: 'CAPTURED', amountCents: 4000, currency: 'USD' };
            assert.equal(topUpHelpers.reconcileTopUps(10).credited, 1);
            assert.equal(h.get('WalletTopUp', started.topUpId).custom.status, 'CREDITED');
        });
    });
});
