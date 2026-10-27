'use strict';

var assert = require('chai').assert;
var harness = require('./harness');
var fixtures = require('./fixtures');

var SYSTEM = { type: 'SYSTEM', ref: 'test' };

describe('plugin_wallet ledger and site preferences', function () {
    describe('site preferences', function () {
        it('reads metadata defaults, and fails closed on the strict switches', function () {
            var h = harness({ preferences: { walletFamilyRequireCode: null } });
            var walletHelpers = h.require('scripts/helpers/walletHelpers');
            assert.equal(walletHelpers.getPreference('walletStepUpThresholdCents'), 1000000, 'test default');
            assert.equal(walletHelpers.getPreference('walletHoldTtlMinutes'), 60, 'metadata default');
            assert.isTrue(walletHelpers.isSandbox(), 'SANDBOX is the metadata default');
            var paymentHelpers = h.require('scripts/helpers/walletPaymentHelpers');
            assert.equal(paymentHelpers.getApprovalRequirement({ member: { custom: {} }, wallet: {} }, 100, 's'), 'CODE', 'an unset code switch still asks for a code');
        });

        it('allows sandbox top-ups only off production, and a real gateway only with the live-money approval', function () {
            var h = harness();
            var walletHelpers = h.require('scripts/helpers/walletHelpers');
            assert.isTrue(walletHelpers.canTopUp());
            h.state.instanceType = 2;
            assert.isFalse(walletHelpers.canTopUp());
            h.preferences.walletGatewayMode = { value: 'EXTERNAL' };
            assert.isFalse(walletHelpers.canTopUp());
            h.preferences.walletLiveMoneyApproved = true;
            assert.isTrue(walletHelpers.canTopUp());
        });

        it('only runs funds expiry with at least five years', function () {
            var h = harness({ preferences: { walletFundsExpiryDays: 365 } });
            fixtures.fundedWallet(h, 'C1', 1000);
            h.rows('WalletAccount')[0].custom.lastActivityAt = new Date(Date.now() - 400 * 86400000);
            var jobs = h.require('scripts/jobs/wallet');
            jobs.expiry({});
            assert.equal(h.rows('WalletAccount')[0].custom.availableCents, 1000);
            h.preferences.walletFundsExpiryDays = 1825;
            h.rows('WalletAccount')[0].custom.lastActivityAt = new Date(Date.now() - 1900 * 86400000);
            assert.equal(jobs.expiry({}).code, 'OK');
            assert.equal(h.rows('WalletAccount')[0].custom.availableCents, 0);
        });
    });

    describe('double-entry ledger', function () {
        var h;
        var accountHelpers;
        var Transaction;
        beforeEach(function () {
            h = harness();
            accountHelpers = h.require('scripts/helpers/walletAccountHelpers');
            Transaction = h.mock('dw/system/Transaction');
        });

        it('writes balanced journals and one sequenced entry per wallet movement', function () {
            var ctx = fixtures.fundedWallet(h, 'C1', 10000);
            Transaction.wrap(function () {
                accountHelpers.postTransaction({ key: 'HOLD:H1', txType: 'PURCHASE_HOLD', walletId: ctx.walletId, amountCents: 4000, actor: SYSTEM });
                accountHelpers.postTransaction({ key: 'CAPTURE:H1', txType: 'PURCHASE_CAPTURE', walletId: ctx.walletId, amountCents: 4000, actor: SYSTEM });
            });
            var wallet = h.rows('WalletAccount')[0].custom;
            assert.equal(wallet.availableCents, 6000);
            assert.equal(wallet.heldCents, 0);
            h.rows('WalletJournal').forEach(function (j) { assert.isTrue(accountHelpers.isBalanced(j), j.custom.journalId); });
            assert.deepEqual(h.rows('WalletEntry').map(function (e) { return e.custom.sequence; }).sort(), [1, 2, 3]);
            assert.isTrue(accountHelpers.replayWallet(h.rows('WalletAccount')[0], 1000).ok);
        });

        it('never lets a balance become negative', function () {
            var ctx = fixtures.fundedWallet(h, 'C1', 1000);
            assert.throws(function () {
                Transaction.wrap(function () { accountHelpers.postTransaction({ key: 'HOLD:H2', txType: 'PURCHASE_HOLD', walletId: ctx.walletId, amountCents: 1001, actor: SYSTEM }); });
            }, /insufficient-funds/);
            var admin = { type: 'ADMIN', ref: 'ops' };
            assert.equal(accountHelpers.adjustBalance(ctx.walletId, -2000, 'goodwill correction', admin).errorCode, 'insufficient-funds');
            assert.equal(h.rows('WalletAccount')[0].custom.availableCents, 1000);
        });

        it('applies an idempotency key once and refuses it with different data', function () {
            var ctx = fixtures.fundedWallet(h, 'C1', 0);
            Transaction.wrap(function () { accountHelpers.postTransaction({ key: 'TOPUP:T1', txType: 'TOPUP', walletId: ctx.walletId, amountCents: 500, actor: SYSTEM }); });
            var replay;
            Transaction.wrap(function () { replay = accountHelpers.postTransaction({ key: 'TOPUP:T1', txType: 'TOPUP', walletId: ctx.walletId, amountCents: 500, actor: SYSTEM }); });
            assert.isTrue(replay.replayed);
            assert.equal(h.rows('WalletAccount')[0].custom.availableCents, 500);
            assert.throws(function () {
                Transaction.wrap(function () { accountHelpers.postTransaction({ key: 'TOPUP:T1', txType: 'TOPUP', walletId: ctx.walletId, amountCents: 600, actor: SYSTEM }); });
            }, /conflict/);
        });

        it('rolls back when a concurrent writer already took the next sequence number', function () {
            var ctx = fixtures.fundedWallet(h, 'C1', 1000);
            // Simulates another transaction that committed entry #2 while this one still saw sequence 1.
            h.create('WalletEntry', ctx.walletId + ':000000000002', { walletId: ctx.walletId, sequence: 2 });
            assert.throws(function () {
                Transaction.wrap(function () { accountHelpers.postTransaction({ key: 'HOLD:RACE', txType: 'PURCHASE_HOLD', walletId: ctx.walletId, amountCents: 800, actor: SYSTEM }); });
            }, /conflict/);
            assert.equal(h.rows('WalletAccount')[0].custom.availableCents, 1000);
            assert.isNull(h.get('WalletJournal', 'HOLD:RACE'));
        });

        it('transfers between wallets with balanced postings, with an admin reason', function () {
            fixtures.fundedWallet(h, 'C1', 1000);
            fixtures.fundedWallet(h, 'C2', 0);
            var admin = { type: 'ADMIN', ref: 'ops' };
            assert.equal(accountHelpers.transferBalance('C1', 'C2', 400, 'short', admin).fields.reason, 'required');
            var result = accountHelpers.transferBalance('C1', 'C2', 400, 'merged duplicate accounts', admin);
            assert.isFalse(result.error);
            assert.equal(h.get('WalletAccount', 'C1').custom.availableCents, 600);
            assert.equal(h.get('WalletAccount', 'C2').custom.availableCents, 400);
            assert.isTrue(accountHelpers.isBalanced(h.get('WalletJournal', result.journalId)));
        });

        it('detects a balance snapshot that no longer matches its entries', function () {
            fixtures.fundedWallet(h, 'C1', 1000);
            var wallet = h.rows('WalletAccount')[0];
            wallet.custom.availableCents = 1500;
            assert.isFalse(accountHelpers.replayWallet(wallet, 1000).ok);
        });

        it('keeps wallet status moves to the flow, and only admins unfreeze', function () {
            var ctx = fixtures.fundedWallet(h, 'C1', 0);
            var admin = { type: 'ADMIN', ref: 'ops' };
            assert.isFalse(accountHelpers.setWalletStatus(ctx.wallet, 'FROZEN', 'review', admin).error);
            assert.equal(accountHelpers.setWalletStatus(ctx.wallet, 'ACTIVE', 'mine', ctx.actor).errorCode, 'forbidden');
            assert.isFalse(accountHelpers.setWalletStatus(ctx.wallet, 'CLOSED', 'closed', admin).error);
            assert.equal(accountHelpers.setWalletStatus(ctx.wallet, 'ACTIVE', 'reopen', admin).errorCode, 'not-allowed-now');
        });
    });
});
