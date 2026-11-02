'use strict';

var assert = require('chai').assert;
var harness = require('../fixtures/harness');
var fixtures = require('../fixtures/fixtures');

var DAY = fixtures.DAY;

describe('membership lifecycle', function () {
    var h;
    var helpers;
    beforeEach(function () {
        h = harness();
        fixtures.plans(h);
        helpers = h.require('scripts/helpers/membershipSubscriptionHelpers');
    });

    describe('state machine', function () {
        it('defines every required state', function () {
            ['PENDING_PAYMENT', 'ACTIVE', 'UPGRADE_PENDING', 'RENEWAL_PENDING', 'PAYMENT_FAILED', 'EXPIRED', 'CANCELLED', 'SUSPENDED', 'REFUND_PENDING'].forEach(function (status) {
                assert.property(helpers.TRANSITIONS, status);
            });
        });

        it('only allows transitions into known states', function () {
            Object.keys(helpers.TRANSITIONS).forEach(function (from) {
                helpers.TRANSITIONS[from].forEach(function (to) { assert.property(helpers.TRANSITIONS, to, from + ' to ' + to); });
            });
        });

        it('rejects a jump from EXPIRED straight to ACTIVE, which would skip the payment', function () {
            assert.isFalse(helpers.canTransition('EXPIRED', 'ACTIVE'));
            var member = fixtures.member(h, 'C1', 'prime', { status: 'EXPIRED' });
            assert.throws(function () { helpers.transition(member, 'ACTIVE', 'test'); }, 'invalid-transition');
        });

        it('rejects leaving SUSPENDED for an upgrade', function () {
            assert.isFalse(helpers.canTransition('SUSPENDED', 'UPGRADE_PENDING'));
        });

        it('records who changed the status, from what to what', function () {
            var member = fixtures.member(h, 'C1', 'prime');
            helpers.transition(member, 'SUSPENDED', 'admin:ops', 'fraud');
            var audit = h.rows('PrimeMembershipAudit')[0].custom;
            assert.equal(audit.actorReference, 'admin:ops');
            assert.equal(audit.previousState, 'ACTIVE');
            assert.equal(audit.newState, 'SUSPENDED');
            assert.equal(member.custom.previousStatus, 'ACTIVE');
        });

        it('does nothing for a transition to the same state', function () {
            var member = fixtures.member(h, 'C1', 'prime');
            helpers.transition(member, 'ACTIVE', 'test');
            assert.lengthOf(h.rows('PrimeMembershipAudit'), 0);
        });
    });

    describe('entitlement', function () {
        it('grants benefits to ACTIVE, CANCELLED and pending states until the paid-through date', function () {
            ['ACTIVE', 'CANCELLED', 'UPGRADE_PENDING', 'RENEWAL_PENDING', 'PAYMENT_FAILED'].forEach(function (status, i) {
                assert.isTrue(helpers.isEntitled(fixtures.member(h, 'C' + i, 'prime', { status: status })), status);
            });
        });

        it('grants nothing to SUSPENDED, EXPIRED, REFUND_PENDING and PENDING_PAYMENT', function () {
            ['SUSPENDED', 'EXPIRED', 'REFUND_PENDING', 'PENDING_PAYMENT'].forEach(function (status, i) {
                assert.isFalse(helpers.isEntitled(fixtures.member(h, 'D' + i, 'prime', { status: status })), status);
            });
        });

        it('grants nothing after the paid-through date, whatever the status says', function () {
            var member = fixtures.member(h, 'C1', 'prime', { startMs: Date.now() - 400 * DAY });
            assert.equal(member.custom.status, 'ACTIVE');
            assert.isFalse(helpers.isEntitled(member));
        });

        it('grants nothing to a first payment that failed, which has no paid-through date', function () {
            var member = helpers.createSubscription('C1');
            member.custom.status = 'PAYMENT_FAILED';
            assert.isFalse(helpers.isEntitled(member));
        });

        it('allows one membership per customer, because the customer number is the key', function () {
            helpers.createSubscription('C1');
            assert.throws(function () { helpers.createSubscription('C1'); }, 'UNIQUE_CONSTRAINT');
        });
    });

    describe('cancellation', function () {
        it('keeps the benefits and the paid-through date, and stops renewal', function () {
            var member = fixtures.member(h, 'C1', 'prime', { autoRenew: true });
            var paidThrough = member.custom.paidThroughDate.getTime();
            var result = helpers.cancelMembership('C1', 'customer:C1');
            assert.isFalse(result.error);
            assert.equal(member.custom.status, 'CANCELLED');
            assert.isFalse(member.custom.autoRenewEnabled);
            assert.equal(member.custom.paidThroughDate.getTime(), paidThrough);
            assert.equal(result.effectiveDate.getTime(), paidThrough);
            assert.isTrue(helpers.isEntitled(member));
        });

        it('sends one notification even when repeated', function () {
            fixtures.member(h, 'C1', 'prime');
            helpers.cancelMembership('C1', 'customer:C1');
            helpers.cancelMembership('C1', 'customer:C1');
            assert.lengthOf(h.rows('PrimeMembershipNotification'), 1);
        });

        it('refuses while a payment is in flight', function () {
            fixtures.member(h, 'C1', 'prime', { pending: 'T1' });
            assert.equal(helpers.cancelMembership('C1', 'x').errorCode, 'payment-pending');
        });

        it('refuses without a membership', function () {
            assert.equal(helpers.cancelMembership('NOBODY', 'x').errorCode, 'no-membership');
        });

        it('can be taken back during the paid term, but not after it', function () {
            var member = fixtures.member(h, 'C1', 'prime', { status: 'CANCELLED' });
            assert.isFalse(helpers.reactivateMembership('C1', 'customer:C1').error);
            assert.equal(member.custom.status, 'ACTIVE');
            fixtures.member(h, 'C2', 'prime', { status: 'CANCELLED', startMs: Date.now() - 400 * DAY });
            assert.equal(helpers.reactivateMembership('C2', 'customer:C2').errorCode, 'not-reactivatable');
        });
    });

    describe('suspension', function () {
        it('takes benefits away and needs a reason', function () {
            var member = fixtures.member(h, 'C1', 'prime');
            assert.isTrue(helpers.suspendMembership('C1', '', 'admin:ops').error);
            assert.isFalse(helpers.suspendMembership('C1', 'chargeback', 'admin:ops').error);
            assert.isFalse(helpers.isEntitled(member));
        });

        it('restores to ACTIVE during the paid term and to EXPIRED after it', function () {
            var active = fixtures.member(h, 'C1', 'prime', { status: 'SUSPENDED' });
            var past = fixtures.member(h, 'C2', 'prime', { status: 'SUSPENDED', startMs: Date.now() - 400 * DAY });
            helpers.restoreMembership('C1', 'cleared', 'admin:ops');
            helpers.restoreMembership('C2', 'cleared', 'admin:ops');
            assert.equal(active.custom.status, 'ACTIVE');
            assert.equal(past.custom.status, 'EXPIRED');
        });

        it('refuses to restore a membership that is not suspended', function () {
            fixtures.member(h, 'C1', 'prime');
            assert.equal(helpers.restoreMembership('C1', 'x', 'admin').errorCode, 'not-suspended');
        });

        it('tells the customer about the change', function () {
            fixtures.member(h, 'C1', 'prime');
            helpers.suspendMembership('C1', 'chargeback', 'admin:ops');
            assert.isTrue(h.rows('PrimeMembershipNotification').some(function (n) { return n.custom.type === 'MEMBERSHIP_CHANGED'; }));
        });
    });

    describe('settings', function () {
        it('refuses auto-renew without a recurring payment adapter, whatever the flag says', function () {
            h.preferences.primeMembershipAutoRenewEnabled = true;
            fixtures.member(h, 'C1', 'prime');
            assert.equal(helpers.updateSettings('C1', true, true, 'customer:C1').errorCode, 'auto-renew-unavailable');
        });

        it('records consent when auto-renew is turned on through an adapter', function () {
            h.preferences.primeMembershipAutoRenewEnabled = true;
            h.state.hooks['app.plugin.primemembership.recurring'] = { chargeRenewal: function () {} };
            var member = fixtures.member(h, 'C1', 'prime');
            helpers.updateSettings('C1', true, true, 'customer:C1');
            assert.instanceOf(member.custom.autoRenewConsentAt, Date);
            assert.isTrue(h.rows('PrimeMembershipAudit').some(function (a) { return a.custom.action === 'auto-renew-changed'; }));
        });

        it('saves the e-mail choice', function () {
            var member = fixtures.member(h, 'C1', 'prime');
            helpers.updateSettings('C1', false, false, 'customer:C1');
            assert.isFalse(member.custom.marketingEmailsEnabled);
        });
    });
});
