'use strict';

var assert = require('chai').assert;
var harness = require('../fixtures/harness');
var fixtures = require('../fixtures/fixtures');

var DAY = fixtures.DAY;

describe('jobs', function () {
    var h;
    var jobs;
    beforeEach(function () {
        h = harness();
        fixtures.plans(h);
        jobs = h.require('scripts/jobs/membership');
    });

    function summary(status) { return JSON.parse(status.message); }

    it('every step does nothing and reports OK while the plugin is off', function () {
        h.preferences.primeMembershipEnabled = false;
        Object.keys(jobs).forEach(function (step) {
            assert.equal(jobs[step]({}).code, 'DISABLED', step);
        });
    });

    it('reports an error status when a step throws, with no stack in the summary', function () {
        h.mock('dw/object/CustomObjectMgr').queryCustomObjects = function () { throw new Error('quota'); };
        var status = jobs.expiration({ MaxItems: 10 });
        assert.isTrue(status.isError());
        assert.equal(status.message, 'quota');
    });

    describe('MembershipExpirationJob', function () {
        it('expires a membership past its paid-through date and notifies once', function () {
            var member = fixtures.member(h, 'C1', 'prime', { startMs: Date.now() - 400 * DAY });
            assert.equal(summary(jobs.expiration({})).expired, 1);
            assert.equal(member.custom.status, 'EXPIRED');
            jobs.expiration({});
            assert.lengthOf(h.rows('PrimeMembershipNotification').filter(function (n) { return n.custom.type === 'EXPIRED'; }), 1);
        });

        it('expires a cancelled membership at the end of its term', function () {
            var member = fixtures.member(h, 'C1', 'prime', { startMs: Date.now() - 400 * DAY, status: 'CANCELLED' });
            jobs.expiration({});
            assert.equal(member.custom.status, 'EXPIRED');
        });

        it('leaves a suspended membership and a running term alone', function () {
            var suspended = fixtures.member(h, 'C1', 'prime', { startMs: Date.now() - 400 * DAY, status: 'SUSPENDED' });
            var running = fixtures.member(h, 'C2', 'prime');
            jobs.expiration({});
            assert.equal(suspended.custom.status, 'SUSPENDED');
            assert.equal(running.custom.status, 'ACTIVE');
        });

        it('waits for a payment in flight before expiring', function () {
            var member = fixtures.member(h, 'C1', 'prime', { startMs: Date.now() - 400 * DAY, pending: 'T1' });
            jobs.expiration({});
            assert.equal(member.custom.status, 'ACTIVE');
        });

        it('respects the batch size', function () {
            ['A', 'B', 'C'].forEach(function (no) { fixtures.member(h, no, 'prime', { startMs: Date.now() - 400 * DAY }); });
            assert.equal(summary(jobs.expiration({ MaxItems: 2 })).expired, 2);
            assert.equal(summary(jobs.expiration({ MaxItems: 2 })).expired, 1);
        });

        it('sends each reminder once, on its configured day', function () {
            fixtures.member(h, 'C1', 'prime', { startMs: Date.now() - 300 * DAY, expiresMs: Date.now() + 6.5 * DAY });
            assert.equal(summary(jobs.expiration({})).reminded, 1);
            assert.equal(summary(jobs.expiration({})).reminded, 0);
        });

        it('does not remind a customer who cancelled', function () {
            fixtures.member(h, 'C1', 'prime', { startMs: Date.now() - 300 * DAY, expiresMs: Date.now() + 6.5 * DAY, status: 'CANCELLED' });
            assert.equal(summary(jobs.expiration({})).reminded, 0);
        });
    });

    describe('MembershipRenewalJob', function () {
        function due(o) {
            return fixtures.member(h, 'C1', 'prime', Object.assign({ startMs: Date.now() - 364 * DAY, expiresMs: Date.now() + 3600000, autoRenew: true }, o || {}));
        }

        it('charges nobody without an adapter, whatever the flag says', function () {
            h.preferences.primeMembershipAutoRenewEnabled = true;
            due();
            assert.equal(summary(jobs.renewal({})).charged, 0);
            assert.lengthOf(h.rows('PrimeMembershipTransaction'), 0);
        });

        function adapter(answer) {
            h.preferences.primeMembershipAutoRenewEnabled = true;
            var calls = [];
            h.state.hooks['app.plugin.primemembership.recurring'] = {
                chargeRenewal: function (data) {
                    calls.push(data);
                    return answer;
                }
            };
            return calls;
        }

        it('extends the term when the adapter captures the amount', function () {
            var calls = adapter({ status: 'CAPTURED', orderNo: 'R1', amountCents: 100000, currency: 'USD', reference: 'ref' });
            var member = due();
            var before = member.custom.expirationDate.getTime();
            assert.equal(summary(jobs.renewal({})).charged, 1);
            assert.equal(calls[0].amountCents, 100000);
            assert.isAbove(member.custom.expirationDate.getTime(), before + 300 * DAY);
            assert.equal(member.custom.status, 'ACTIVE');
        });

        it('never charges twice for one term', function () {
            var calls = adapter({ status: 'CAPTURED', orderNo: 'R1', amountCents: 100000, currency: 'USD', reference: 'ref' });
            var member = due();
            var expires = member.custom.expirationDate;
            jobs.renewal({});
            jobs.renewal({});
            assert.lengthOf(calls, 1, 'a second run finds nothing due');
            member.custom.expirationDate = expires;
            member.custom.paidThroughDate = expires;
            jobs.renewal({});
            assert.lengthOf(calls, 1, 'the idempotency key stops a charge for the same term');
        });

        it('skips a membership without recorded consent', function () {
            var calls = adapter({ status: 'CAPTURED', amountCents: 100000, currency: 'USD' });
            var member = due();
            member.custom.autoRenewConsentAt = null;
            assert.equal(summary(jobs.renewal({})).skipped, 1);
            assert.lengthOf(calls, 0);
        });

        it('keeps the benefits when the charge is declined', function () {
            adapter({ status: 'FAILED' });
            var member = due();
            var status = jobs.renewal({});
            assert.equal(summary(status).declined, 1);
            assert.isFalse(status.isError(), 'a customer decline is not a job failure');
            assert.equal(member.custom.status, 'PAYMENT_FAILED');
            assert.isNotNull(h.require('scripts/helpers/membershipBenefitHelpers').getActiveMembership('C1'));
        });

        it('leaves an unknown outcome pending, because money may have moved', function () {
            h.preferences.primeMembershipAutoRenewEnabled = true;
            h.state.hooks['app.plugin.primemembership.recurring'] = { chargeRenewal: function () { throw new Error('timeout'); } };
            var member = due();
            assert.equal(summary(jobs.renewal({})).pending, 1);
            assert.equal(member.custom.status, 'RENEWAL_PENDING');
            assert.isString(member.custom.pendingTransactionID);
        });
    });

    describe('MembershipBenefitResetJob and rewards', function () {
        it('issues one monthly voucher per month, also when run twice', function () {
            fixtures.coupon(h, 'monthly');
            fixtures.member(h, 'C1', 'ultra-prime-max');
            assert.equal(summary(jobs.benefitReset({})).vouchers, 1);
            assert.equal(summary(jobs.benefitReset({})).vouchers, 0);
            assert.lengthOf(h.rows('PrimeMembershipBenefitUsage'), 1);
            assert.equal(h.state.coupons.monthly.codes.length, 4);
        });

        it('gives no voucher to plans without the benefit', function () {
            fixtures.coupon(h, 'monthly');
            fixtures.member(h, 'C1', 'prime');
            assert.equal(summary(jobs.benefitReset({})).vouchers, 0);
        });

        it('reports a run out of codes as a failure, without a usage row', function () {
            fixtures.coupon(h, 'monthly', 0);
            fixtures.member(h, 'C1', 'ultra-prime-max');
            assert.isTrue(jobs.benefitReset({}).isError());
            assert.lengthOf(h.rows('PrimeMembershipBenefitUsage'), 0);
        });

        it('refuses a coupon that is reusable, which could be shared', function () {
            fixtures.coupon(h, 'monthly');
            h.state.coupons.monthly.limit = 5;
            fixtures.member(h, 'C1', 'ultra-prime-max');
            assert.isTrue(jobs.benefitReset({}).isError());
        });

        it('issues a birthday reward in the window, once a year', function () {
            fixtures.coupon(h, 'birthday');
            fixtures.member(h, 'C1', 'prime');
            h.state.birthdays.C1 = new Date(Date.now() + 2 * DAY);
            assert.equal(summary(jobs.birthdayReward({})).issued, 1);
            assert.equal(summary(jobs.birthdayReward({})).issued, 0);
            var usage = h.rows('PrimeMembershipBenefitUsage')[0].custom;
            assert.equal(usage.usageStatus, 'ISSUED');
            assert.equal(usage.rewardCode, 'BIRTHDAY-0');
        });

        it('issues nothing outside the window or without a birthday', function () {
            fixtures.coupon(h, 'birthday');
            fixtures.member(h, 'C1', 'prime');
            fixtures.member(h, 'C2', 'prime');
            h.state.birthdays.C1 = new Date(Date.now() + 60 * DAY);
            assert.equal(summary(jobs.birthdayReward({})).issued, 0);
        });

        it('finds a birthday across the new year', function () {
            var helpers = h.require('scripts/helpers/membershipRewardHelpers');
            var year = helpers.getBirthdayYear({ birthday: new Date('1990-01-02T00:00:00Z') }, 7, Date.parse('2026-12-30T12:00:00Z'));
            assert.equal(year, 2027);
        });

        it('resumes from its checkpoint when a run hits the batch size', function () {
            fixtures.coupon(h, 'birthday');
            ['A', 'B', 'C'].forEach(function (no) {
                fixtures.member(h, no, 'prime');
                h.state.birthdays[no] = new Date(Date.now() + DAY);
            });
            assert.equal(summary(jobs.birthdayReward({ MaxItems: 2 })).issued, 2);
            assert.equal(summary(jobs.birthdayReward({ MaxItems: 2 })).issued, 1);
        });

        it('sends a reward by e-mail only to customers who want them', function () {
            var helpers = h.require('scripts/helpers/membershipHelpers');
            fixtures.coupon(h, 'birthday');
            fixtures.member(h, 'C1', 'prime', { marketing: false });
            h.state.birthdays.C1 = new Date(Date.now() + DAY);
            jobs.birthdayReward({});
            assert.equal(helpers.deliverNotifications(10).skipped, 1);
            assert.lengthOf(h.state.mails, 0);
        });
    });

    describe('MembershipReconciliationJob', function () {
        it('closes a transaction that never reached an order', function () {
            h.state.sessionCustomerNo = 'C1';
            fixtures.member(h, 'C1', 'prime', { pending: 'T1', status: 'UPGRADE_PENDING' });
            h.create('PrimeMembershipTransaction', 'T1', { customerNo: 'C1', subscriptionID: 'C1', transactionType: 'UPGRADE', status: 'PROCESSING', updatedAt: new Date(Date.now() - 40 * 60000), correlationID: 'x' });
            var status = jobs.reconciliation({});
            assert.equal(summary(status).paymentFailed, 1);
            assert.isFalse(status.isError(), 'a closed payment is not a job failure');
            assert.equal(h.get('PrimeMembershipTransaction', 'T1').custom.status, 'FAILED');
            assert.equal(h.get('PrimeMembershipSubscription', 'C1').custom.status, 'ACTIVE');
            assert.isNull(h.get('PrimeMembershipSubscription', 'C1').custom.pendingTransactionID);
        });

        it('leaves a recent transaction alone, which may still be running', function () {
            fixtures.member(h, 'C1', 'prime', { pending: 'T1', status: 'UPGRADE_PENDING' });
            h.create('PrimeMembershipTransaction', 'T1', { customerNo: 'C1', transactionType: 'UPGRADE', status: 'PROCESSING', updatedAt: new Date() });
            jobs.reconciliation({});
            assert.equal(h.get('PrimeMembershipTransaction', 'T1').custom.status, 'PROCESSING');
        });

        it('fails a waiting transaction when the order is cancelled, and never activates it', function () {
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime', { paid: false });
            h.state.orders[flow.record.custom.orderNo].status.value = h.Order.ORDER_STATUS_CANCELLED;
            jobs.reconciliation({});
            assert.equal(flow.record.custom.status, 'FAILED');
            assert.equal(h.get('PrimeMembershipSubscription', 'C1').custom.status, 'PAYMENT_FAILED');
        });

        it('activates once and is idempotent', function () {
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime', { paid: false });
            h.state.orders[flow.record.custom.orderNo].paymentStatus.value = h.Order.PAYMENT_STATUS_PAID;
            assert.equal(summary(jobs.reconciliation({})).activated, 1);
            assert.equal(summary(jobs.reconciliation({})).activated, 0);
            assert.lengthOf(h.rows('PrimeMembershipNotification').filter(function (n) { return n.custom.type === 'ACTIVATED'; }), 1);
        });

        it('expires old quotes', function () {
            h.create('PrimeMembershipTransaction', 'T1', { customerNo: 'C1', status: 'QUOTED', quoteExpiresAt: new Date(Date.now() - 1000) });
            assert.equal(summary(jobs.reconciliation({})).expired, 1);
            assert.equal(h.get('PrimeMembershipTransaction', 'T1').custom.status, 'EXPIRED');
        });

        it('takes benefits away when a paid membership order is cancelled, pending the refund', function () {
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
            h.state.orders[flow.record.custom.orderNo].status.value = h.Order.ORDER_STATUS_CANCELLED;
            assert.equal(summary(jobs.reconciliation({})).refundFlagged, 1);
            assert.equal(h.get('PrimeMembershipSubscription', 'C1').custom.status, 'REFUND_PENDING');
            assert.isNull(h.require('scripts/helpers/membershipBenefitHelpers').getActiveMembership('C1'));
        });

        it('flags a cancelled paid order only once, so handling the refund is final', function () {
            var flow = fixtures.checkout(h, 'C1', 'PURCHASE', 'prime');
            h.state.orders[flow.record.custom.orderNo].status.value = h.Order.ORDER_STATUS_CANCELLED;
            assert.equal(summary(jobs.reconciliation({})).refundFlagged, 1);
            var payment = h.require('scripts/helpers/membershipPaymentHelpers');
            assert.isFalse(payment.recordRefund('C1', flow.record.custom.orderNo, 1000, false, 'RF-1', 'admin:ops').error);
            assert.equal(h.get('PrimeMembershipSubscription', 'C1').custom.status, 'ACTIVE');
            assert.equal(summary(jobs.reconciliation({})).refundFlagged, 0);
            assert.equal(h.get('PrimeMembershipSubscription', 'C1').custom.status, 'ACTIVE');
        });

        it('commits a reservation whose order was placed, and releases one whose order failed', function () {
            var member = fixtures.member(h, 'C1', 'prime');
            var helpers = h.require('scripts/helpers/membershipBenefitHelpers');
            var make = function () {
                var basket = fixtures.basket(h);
                h.calculate(basket);
                var order = h.orderFromBasket(basket);
                helpers.reserveOrderBenefits(order);
                return order;
            };
            var placed = make();
            var failed = make();
            placed.status.value = h.Order.ORDER_STATUS_NEW;
            failed.status.value = h.Order.ORDER_STATUS_FAILED;
            h.rows('PrimeMembershipBenefitUsage').forEach(function (u) { u.custom.createdAt = new Date(Date.now() - 3600000); });
            var counts = summary(jobs.reconciliation({}));
            assert.equal(counts.committed, 1);
            assert.equal(counts.released, 1);
            assert.equal(JSON.parse(member.custom.benefitCounters)['member-discount'].cents, 500);
        });

        it('leaves a reservation alone while its order is still being created', function () {
            fixtures.member(h, 'C1', 'prime');
            var basket = fixtures.basket(h);
            h.calculate(basket);
            h.require('scripts/helpers/membershipBenefitHelpers').reserveOrderBenefits(h.orderFromBasket(basket));
            h.rows('PrimeMembershipBenefitUsage')[0].custom.createdAt = new Date(Date.now() - 3600000);
            jobs.reconciliation({});
            assert.equal(h.rows('PrimeMembershipBenefitUsage')[0].custom.usageStatus, 'RESERVED');
        });

        it('reverses the savings of a cancelled order per the reversal rule', function () {
            var member = fixtures.member(h, 'C1', 'prime');
            var helpers = h.require('scripts/helpers/membershipBenefitHelpers');
            var basket = fixtures.basket(h);
            h.calculate(basket);
            var order = h.orderFromBasket(basket);
            helpers.reserveOrderBenefits(order);
            helpers.settleOrderBenefits(order, true);
            order.status.value = h.Order.ORDER_STATUS_CANCELLED;
            assert.equal(summary(jobs.reconciliation({})).reversed, 1);
            assert.equal(summary(jobs.reconciliation({})).reversed, 0);
            assert.equal(JSON.parse(member.custom.benefitCounters)['member-discount'].cents, 0);
            assert.equal(h.rows('PrimeMembershipBenefitUsage')[0].custom.usageStatus, 'REVERSED');
        });

        it('keeps the allowance used when the benefit says keep', function () {
            h = harness();
            fixtures.plans(h, function (plan) { plan.benefits['member-discount'].reversal = 'keep'; });
            jobs = h.require('scripts/jobs/membership');
            var member = fixtures.member(h, 'C1', 'prime');
            var helpers = h.require('scripts/helpers/membershipBenefitHelpers');
            var basket = fixtures.basket(h);
            h.calculate(basket);
            var order = h.orderFromBasket(basket);
            helpers.reserveOrderBenefits(order);
            helpers.settleOrderBenefits(order, true);
            order.status.value = h.Order.ORDER_STATUS_CANCELLED;
            jobs.reconciliation({});
            assert.equal(JSON.parse(member.custom.benefitCounters)['member-discount'].cents, 500);
        });
    });

    describe('loyalty multiplier adapter', function () {
        function order() {
            var helpers = h.require('scripts/helpers/membershipBenefitHelpers');
            var basket = fixtures.basket(h);
            h.calculate(basket);
            var placed = h.orderFromBasket(basket);
            helpers.reserveOrderBenefits(placed);
            helpers.settleOrderBenefits(placed, true);
            return placed;
        }

        it('claims nothing while no loyalty system is available', function () {
            fixtures.member(h, 'C1', 'ultra-prime');
            order();
            assert.isUndefined(h.rows('PrimeMembershipBenefitUsage')[0].custom.loyaltyMultiplier);
        });

        it('applies the multiplier through the hook, once, when the system says applied', function () {
            var calls = [];
            h.preferences.primeMembershipLoyaltyEnabled = true;
            h.state.hooks['app.plugin.primemembership.loyalty'] = { applyMultiplier: function (d) { calls.push(d); return { status: 'APPLIED', bonusPoints: 50 }; } };
            fixtures.member(h, 'C1', 'ultra-prime');
            order();
            assert.equal(summary(jobs.reconciliation({})).loyaltyApplied, 1);
            jobs.reconciliation({});
            assert.lengthOf(calls, 1);
            assert.equal(calls[0].multiplier, 2);
        });

        it('tries again later while the points are still pending', function () {
            var answers = ['PENDING', 'APPLIED'];
            h.preferences.primeMembershipLoyaltyEnabled = true;
            h.state.hooks['app.plugin.primemembership.loyalty'] = { applyMultiplier: function () { return { status: answers.shift() }; } };
            fixtures.member(h, 'C1', 'ultra-prime');
            order();
            jobs.reconciliation({});
            assert.equal(h.rows('PrimeMembershipBenefitUsage')[0].custom.loyaltyStatus, 'PENDING');
            jobs.reconciliation({});
            assert.equal(h.rows('PrimeMembershipBenefitUsage')[0].custom.loyaltyStatus, 'APPLIED');
        });

        it('credits plugin_loyalty after release, with a key that can\'t pay twice', function () {
            var credits = [];
            h = harness({
                mocks: {
                    '*/cartridge/scripts/helpers/loyaltyOrderHelper': {},
                    '*/cartridge/scripts/helpers/loyaltyHelper': {
                        getAccount: function () { return { custom: {} }; },
                        credit: function (account, key, points) { credits.push({ key: key, points: points }); h.state.lots = (h.state.lots || 0) + 1; }
                    }
                },
                preferences: { primeMembershipLoyaltyEnabled: true }
            });
            fixtures.plans(h);
            var adapters = h.require('scripts/integrations/membershipAdapters');
            h.mock('dw/object/CustomObjectMgr').getCustomObject = (function (real) {
                return function (type, key) {
                    if (type === 'LoyaltyOrder') return { custom: { customerNo: 'C1', status: 'AVAILABLE', earnedPoints: 100 } };
                    if (type === 'LoyaltyLot') return h.state.lots ? { custom: {} } : null;
                    return real(type, key);
                };
            }(h.mock('dw/object/CustomObjectMgr').getCustomObject));
            assert.equal(adapters.applyLoyaltyMultiplier({ orderNo: 'O1', customerNo: 'C1', multiplier: 2 }).bonusPoints, 100);
            assert.equal(adapters.applyLoyaltyMultiplier({ orderNo: 'O1', customerNo: 'C1', multiplier: 2 }).bonusPoints, 0);
            assert.deepEqual(credits, [{ key: 'MEMBERSHIP:O1', points: 100 }]);
        });
    });

    describe('MembershipReportingJob', function () {
        it('keeps gross, refunds, net and savings apart', function () {
            var day = new Date().toISOString().slice(0, 10);
            var now = new Date();
            h.create('PrimeMembershipTransaction', 'T1', { transactionType: 'PURCHASE', status: 'COMPLETED', amountCents: 100000, createdAt: now });
            h.create('PrimeMembershipTransaction', 'T2', { transactionType: 'UPGRADE', status: 'COMPLETED', amountCents: 75000, createdAt: now });
            h.create('PrimeMembershipTransaction', 'T3', { transactionType: 'RENEWAL', status: 'COMPLETED', amountCents: 100000, createdAt: now });
            h.create('PrimeMembershipTransaction', 'T4', { transactionType: 'REFUND', status: 'COMPLETED', amountCents: 20000, createdAt: now });
            h.create('PrimeMembershipTransaction', 'T5', { transactionType: 'PURCHASE', status: 'FAILED', amountCents: 100000, createdAt: now });
            h.create('PrimeMembershipBenefitUsage', 'U1', { usageStatus: 'COMMITTED', discountCents: 1500, details: JSON.stringify({ 'member-discount': 500, 'free-shipping': 1000 }), createdAt: now });
            h.create('PrimeMembershipBenefitUsage', 'U2', { usageStatus: 'RELEASED', discountCents: 900, createdAt: now });
            var report = h.require('scripts/helpers/membershipReportHelpers').buildDailyReport(day, 100);
            assert.equal(report.membershipRevenueCents, 100000);
            assert.equal(report.upgradeRevenueCents, 75000);
            assert.equal(report.renewalRevenueCents, 100000);
            assert.equal(report.grossRevenueCents, 275000);
            assert.equal(report.refundCents, 20000);
            assert.equal(report.netRevenueCents, 255000);
            assert.equal(report.memberSavingsCents, 1500);
            assert.equal(report.failedPayments, 1);
            assert.equal(report.redemptions['free-shipping'], 1);
            assert.isTrue(report.complete);
        });

        it('says so when the batch size cut the report short', function () {
            var day = new Date().toISOString().slice(0, 10);
            ['T1', 'T2'].forEach(function (id) { h.create('PrimeMembershipTransaction', id, { transactionType: 'PURCHASE', status: 'COMPLETED', amountCents: 1, createdAt: new Date() }); });
            assert.isFalse(h.require('scripts/helpers/membershipReportHelpers').buildDailyReport(day, 1).complete);
        });

        it('saves reports for the desk, repeatably', function () {
            fixtures.member(h, 'C1', 'prime');
            jobs.reporting({});
            jobs.reporting({});
            var helpers = h.require('scripts/helpers/membershipReportHelpers');
            assert.isAtLeast(helpers.getRecentReports(2).length, 2);
            assert.equal(h.require('scripts/helpers/membershipHelpers').getJobState('report-live').byStatus.ACTIVE, 1);
            assert.equal(h.require('scripts/helpers/membershipHelpers').getJobState('report-live').byPlan.prime, 1);
        });
    });

    describe('MembershipNotificationJob', function () {
        function queue(type) {
            var helpers = h.require('scripts/helpers/membershipHelpers');
            helpers.notify('C1', type || 'ACTIVATED', 'event-1', { plan: 'Prime', date: '2027-01-01' });
        }

        it('sends the localized text', function () {
            queue();
            jobs.notifications({});
            assert.include(h.state.mails[0].context.body, 'Prime');
            assert.include(h.state.mails[0].context.body, '2027-01-01');
        });

        it('retries a failed send with backoff, then gives up', function () {
            h.preferences.primeMembershipNotificationMaxAttempts = 2;
            h.state.emailFails = true;
            queue();
            assert.equal(summary(jobs.notifications({})).retried, 1);
            var record = h.rows('PrimeMembershipNotification')[0];
            assert.isAbove(record.custom.nextAttemptAt.getTime(), Date.now());
            record.custom.nextAttemptAt = new Date(Date.now() - 1000);
            assert.isTrue(jobs.notifications({}).isError());
            assert.equal(record.custom.status, 'FAILED');
        });

        it('does not send again after success', function () {
            queue();
            jobs.notifications({});
            jobs.notifications({});
            assert.lengthOf(h.state.mails, 1);
        });

        it('stops with an error when no sender is configured', function () {
            h.preferences.primeMembershipFromEmail = '';
            queue();
            assert.isTrue(jobs.notifications({}).isError());
            assert.lengthOf(h.state.mails, 0);
        });
    });
});
