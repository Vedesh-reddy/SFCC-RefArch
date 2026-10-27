'use strict';

var assert = require('chai').assert;
var harness = require('./harness');
var fixtures = require('./fixtures');

describe('plugin_wallet integration points', function () {
    it('Authorize places the hold and remembers it for the PlaceOrder extension', function () {
        var h = harness();
        fixtures.fundedWallet(h, 'C1', 5000);
        var payments = h.require('scripts/helpers/walletPaymentHelpers');
        var basket = fixtures.basket(h, 2000);
        payments.applyToBasket(h.customer('C1'), basket, { mode: 'OWN' }, 'session-1');
        global.customer = h.customer('C1');
        var processor = h.require('scripts/hooks/payment/walletProcessor');
        var pi = payments.getWalletInstruments(basket)[0];
        var result = processor.Authorize('ORD1', pi, { ID: 'WALLET' });
        assert.isTrue(result.authorized);
        assert.match(global.request.custom.walletHoldIds, /^HOLD-[A-F0-9]{24}$/);
        assert.equal(pi.paymentTransaction.transactionID, global.request.custom.walletHoldIds);
    });

    it('Handle accepts a wallet-only payment only when the wallet covers the basket', function () {
        var h = harness();
        fixtures.fundedWallet(h, 'C1', 1500);
        var payments = h.require('scripts/helpers/walletPaymentHelpers');
        var processor = h.require('scripts/hooks/payment/walletProcessor');
        var small = fixtures.basket(h, 1000);
        payments.applyToBasket(h.customer('C1'), small, { mode: 'OWN' }, 'session-1');
        small.createPaymentInstrument('CREDIT_CARD', new h.Money(10, 'USD'));
        assert.isFalse(processor.Handle(small).error);
        assert.lengthOf(small.paymentInstruments.toArray(), 1);
        var big = fixtures.basket(h, 5000);
        payments.applyToBasket(h.customer('C1'), big, { mode: 'OWN' }, 'session-1');
        assert.isTrue(processor.Handle(big).error);
    });

    it('the form processor never reads amounts or card data from the form', function () {
        var h = harness();
        var form = h.require('scripts/hooks/payment/walletForm');
        var result = form.processForm({}, { paymentMethod: { value: 'WALLET' }, creditCardFields: { cardNumber: { value: '4111' } } }, {});
        assert.deepEqual(result.viewData.paymentInformation, {});
        assert.equal(result.viewData.paymentMethod.value, 'WALLET');
    });

    it('picks the closest approaching shipping discount for the advisor', function () {
        var advisorHelpers = harness().require('scripts/helpers/walletAdvisorHelpers');
        assert.equal(advisorHelpers.getClosestDiscount([{ distanceCents: 5000 }, { distanceCents: 1500 }, { distanceCents: 0 }]).distanceCents, 1500);
        assert.isNull(advisorHelpers.getClosestDiscount([{ distanceCents: 0 }]));
    });

    it('accepts a provider callback only with a fresh signature over the exact body', function () {
        var walletHelpers = harness().require('scripts/helpers/walletHelpers');
        var crypto = require('crypto');
        var body = '{"id":"evt_12345678","type":"payment.updated"}';
        var sign = function (t) { return 't=' + t + ',v1=' + crypto.createHmac('sha256', 'w'.repeat(40)).update(t + '.' + body).digest('hex'); };
        var now = String(Math.floor(Date.now() / 1000));
        assert.isTrue(walletHelpers.isValidWebhookSignature(sign(now), body));
        assert.isFalse(walletHelpers.isValidWebhookSignature(sign(now), body + ' '), 'body changed');
        assert.isFalse(walletHelpers.isValidWebhookSignature(sign(String(Number(now) - 301)), body), 'too old');
        assert.isFalse(walletHelpers.isValidWebhookSignature(sign(now).replace(/^t=\d+,/, ''), body), 'no timestamp');
    });

    it('shows a family member only their allowance in checkout, never the owner balance', function () {
        var h = harness({ preferences: { walletFamilyEnabled: true } });
        fixtures.fundedWallet(h, 'OWNER1', 20000);
        h.create('WalletMember', 'KID1', { walletId: 'OWNER1', nickname: 'Kid', status: 'ACTIVE', perOrderLimitCents: 3000, dailyLimitCents: 5000, monthlyLimitCents: 10000, allowedCategoryIds: [], requireOwnerApproval: false, acceptedAt: new Date(), revision: 0 });
        var paymentHelpers = h.require('scripts/helpers/walletPaymentHelpers');
        var panel = paymentHelpers.getCheckoutPanel(h.customer('KID1'), fixtures.basket(h, 1000));
        assert.isNull(panel.own);
        assert.equal(panel.family.perOrderFormatted, '$30.00');
        assert.notInclude(JSON.stringify(panel), '200.00');
        assert.isNull(paymentHelpers.getCheckoutPanel({ authenticated: false, registered: false }, fixtures.basket(h, 1000)));
    });

    it('summarizes a month of activity from the wallet entries', function () {
        var h = harness();
        fixtures.fundedWallet(h, 'C1', 5000);
        var months = h.require('scripts/helpers/walletAccountHelpers').getMonthlyInsights('C1', 3);
        assert.lengthOf(months, 3);
        assert.equal(months[0].topUpCents, 5000);
        assert.equal(months[1].topUpCents, 0);
    });

    describe('Custom Shopper API', function () {
        it('does not create a wallet in a GET request and resolves the wallet from the token', function () {
            var h = harness();
            var api = h.require('rest-apis/wallet/script');
            h.api({ customer: h.customer('C9') });
            api.getWallet();
            assert.equal(h.state.responses[0].body.status, 'NONE');
            assert.lengthOf(h.rows('WalletAccount'), 0);
            h.api({ customer: h.customer('C9'), body: { amount: '20' } });
            api.createTopUp();
            assert.equal(h.state.responses[0].status, 201);
            var topUpId = h.state.responses[0].body.topUpId;
            fixtures.fundedWallet(h, 'C8', 0);
            h.api({ customer: h.customer('C8'), path: { topUpId: topUpId } });
            api.getTopUp();
            assert.equal(h.state.responses[0].status, 404);
            h.api({ customer: { authenticated: false, registered: false } });
            api.listTransactions();
            assert.equal(h.state.responses[0].status, 401);
        });
    });

    describe('jobs', function () {
        it('do nothing while the wallet is off', function () {
            var h = harness({ preferences: { walletEnabled: false } });
            assert.equal(h.require('scripts/jobs/wallet').holds({ MaxItems: 5 }).code, 'DISABLED');
        });

        it('reconciliation flags a wallet whose balance does not match its ledger', function () {
            var h = harness();
            fixtures.fundedWallet(h, 'C1', 1000);
            h.rows('WalletAccount')[0].custom.availableCents = 9999;
            var status = h.require('scripts/jobs/wallet').reconcile({ MaxItems: 10 });
            assert.equal(status.code, 'ATTENTION');
            assert.isTrue(h.rows('WalletCase').some(function (c) { return c.custom.caseType === 'RECONCILIATION_MISMATCH'; }));
        });

        it('keeps a wrapping cursor for the reconciliation step', function () {
            var h = harness();
            fixtures.fundedWallet(h, 'C1', 1000);
            fixtures.fundedWallet(h, 'C2', 1000);
            var jobs = h.require('scripts/jobs/wallet');
            var walletHelpers = h.require('scripts/helpers/walletHelpers');
            assert.equal(jobs.reconcile({ MaxItems: 1 }).code, 'OK');
            assert.equal(walletHelpers.getJobState('reconcile').cursor, 'C1');
            jobs.reconcile({ MaxItems: 1 });
            jobs.reconcile({ MaxItems: 1 });
            assert.equal(walletHelpers.getJobState('reconcile').cursor, '');
        });

        it('expires nothing unless funds expiry is configured', function () {
            var h = harness();
            fixtures.fundedWallet(h, 'C1', 1000);
            h.rows('WalletAccount')[0].custom.lastActivityAt = new Date(Date.UTC(2000, 0, 1));
            h.require('scripts/jobs/wallet').expiry({ MaxItems: 10 });
            assert.equal(h.rows('WalletAccount')[0].custom.availableCents, 1000);
            h.preferences.walletFundsExpiryDays = 1825;
            h.require('scripts/jobs/wallet').expiry({ MaxItems: 10 });
            assert.equal(h.rows('WalletAccount')[0].custom.availableCents, 0);
        });

        it('delivers notifications to the address looked up at send time', function () {
            var h = harness({ preferences: { walletNotificationChannels: ['INBOX', 'EMAIL'] } });
            var walletHelpers = h.require('scripts/helpers/walletHelpers');
            h.mock('dw/system/Transaction').wrap(function () { walletHelpers.notify('C1', 'TOPUP_SUCCEEDED', { amount: '$5.00' }); });
            assert.notInclude(JSON.stringify(h.rows('WalletNotification').map(function (n) { return n.custom; })), '@');
            assert.equal(walletHelpers.deliverNotifications(10).sent, 1);
            assert.equal(walletHelpers.getInbox('C1', 0, 10).unread, 1);
            assert.equal(h.state.mails[0].mail.to, 'c1@example.com');
        });
    });

    describe('back office', function () {
        it('books adjustments as new reasoned transactions within the limit', function () {
            var h = harness({ preferences: { walletAdjustmentMaxCents: 10000 } });
            fixtures.fundedWallet(h, 'C1', 1000);
            var accountHelpers = h.require('scripts/helpers/walletAccountHelpers');
            var actor = { type: 'ADMIN', ref: 'ops' };
            assert.equal(accountHelpers.adjustBalance('C1', 500, 'short', actor).fields.reason, 'required');
            assert.equal(accountHelpers.adjustBalance('C1', 20000, 'goodwill credit after outage', actor).fields.amount, 'out-of-range');
            assert.isFalse(accountHelpers.adjustBalance('C1', 500, 'goodwill credit after outage', actor).error);
            assert.equal(h.rows('WalletAccount')[0].custom.availableCents, 1500);
            assert.equal(accountHelpers.getLiability().availableCents, 1500);
        });

        it('works review cases with notes and status moves', function () {
            var h = harness();
            var walletHelpers = h.require('scripts/helpers/walletHelpers');
            var record = h.mock('dw/system/Transaction').wrap(function () { return walletHelpers.openCase({ caseType: 'HOLD_REVIEW', walletId: 'C1', dedupeKey: 'k1' }); });
            var actor = { type: 'ADMIN', ref: 'ops' };
            var caseId = record.custom.caseId;
            assert.equal(walletHelpers.updateCase(caseId, 'resolve', '', null, actor).fields.message, 'required');
            assert.isFalse(walletHelpers.updateCase(caseId, 'resolve', 'checked the order', 0, actor).error);
            assert.equal(walletHelpers.updateCase(caseId, 'progress', '', null, actor).errorCode, 'not-allowed-now');
            assert.lengthOf(walletHelpers.parseJson(record.custom.notes, []), 1);
        });
    });
});
