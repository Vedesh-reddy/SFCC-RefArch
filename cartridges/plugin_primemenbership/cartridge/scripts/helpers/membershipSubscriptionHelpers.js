'use strict';

/**
 * The membership record: state machine, entitlement status and the changes made to it. The
 * record's key is the customer number and it is site-scoped, so a customer can never hold two
 * conflicting memberships on one site. History lives in the transaction and audit records.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var membershipHelpers = require('*/cartridge/scripts/helpers/membershipHelpers');

var TYPE = 'PrimeMembershipSubscription';
var TRANSITIONS = {
    PENDING_PAYMENT: ['ACTIVE', 'PAYMENT_FAILED', 'CANCELLED'],
    ACTIVE: ['UPGRADE_PENDING', 'RENEWAL_PENDING', 'CANCELLED', 'EXPIRED', 'SUSPENDED', 'REFUND_PENDING'],
    UPGRADE_PENDING: ['ACTIVE', 'PAYMENT_FAILED', 'SUSPENDED', 'REFUND_PENDING'],
    RENEWAL_PENDING: ['ACTIVE', 'PAYMENT_FAILED', 'EXPIRED', 'SUSPENDED', 'REFUND_PENDING'],
    PAYMENT_FAILED: ['PENDING_PAYMENT', 'ACTIVE', 'UPGRADE_PENDING', 'RENEWAL_PENDING', 'EXPIRED', 'CANCELLED', 'SUSPENDED'],
    EXPIRED: ['PENDING_PAYMENT', 'REFUND_PENDING'],
    CANCELLED: ['ACTIVE', 'EXPIRED', 'PENDING_PAYMENT', 'RENEWAL_PENDING', 'SUSPENDED', 'REFUND_PENDING'],
    SUSPENDED: ['ACTIVE', 'EXPIRED', 'CANCELLED', 'REFUND_PENDING'],
    REFUND_PENDING: ['ACTIVE', 'CANCELLED', 'EXPIRED']
};
// A failed upgrade or renewal and a cancellation keep what was already paid for, until the
// paid-through date. A first payment that failed never has a paid-through date.
var ENTITLED = ['ACTIVE', 'UPGRADE_PENDING', 'RENEWAL_PENDING', 'PAYMENT_FAILED', 'CANCELLED'];

/**
 * @param {string} customerNo - customer
 * @returns {?dw.object.CustomObject} the customer's membership
 */
function getSubscription(customerNo) {
    return customerNo ? CustomObjectMgr.getCustomObject(TYPE, String(customerNo)) : null;
}

/**
 * @param {string} from - current status
 * @param {string} to - new status
 * @returns {boolean} true for an allowed change
 */
function canTransition(from, to) {
    return (TRANSITIONS[from] || []).indexOf(to) >= 0;
}

/**
 * @param {?dw.object.CustomObject} subscription - membership
 * @param {number} [nowMs] - now
 * @returns {boolean} true while paid benefits apply
 */
function isEntitled(subscription, nowMs) {
    if (!subscription || ENTITLED.indexOf(subscription.custom.status) < 0 || !subscription.custom.paidThroughDate) return false;
    return subscription.custom.paidThroughDate.getTime() > (nowMs || Date.now());
}

/**
 * Changes the status and records it. Call inside a transaction.
 * @param {dw.object.CustomObject} subscription - membership
 * @param {string} to - new status
 * @param {string} actor - audit actor
 * @param {?string} [reason] - why
 * @param {?string} [correlationID] - operation ID
 */
function transition(subscription, to, actor, reason, correlationID) {
    var from = subscription.custom.status;
    if (from === to) return;
    if (!canTransition(from, to)) throw membershipHelpers.abort('invalid-transition');
    subscription.custom.previousStatus = from;
    subscription.custom.status = to;
    subscription.custom.statusReason = reason ? String(reason).slice(0, 500) : null;
    subscription.custom.updatedAt = new Date();
    membershipHelpers.audit('status-changed', actor, subscription.custom.subscriptionID, from, to, correlationID);
}

/**
 * @param {string} customerNo - customer
 * @returns {dw.object.CustomObject} a new membership waiting for its first payment; call inside a transaction
 */
function createSubscription(customerNo) {
    var record = CustomObjectMgr.createCustomObject(TYPE, String(customerNo));
    record.custom.customerNo = String(customerNo);
    record.custom.siteID = require('dw/system/Site').getCurrent().getID();
    record.custom.status = 'PENDING_PAYMENT';
    record.custom.autoRenewEnabled = false;
    record.custom.marketingEmailsEnabled = true;
    record.custom.benefitCounters = '{}';
    record.custom.createdAt = new Date();
    record.custom.updatedAt = new Date();
    return record;
}

/**
 * @param {dw.object.CustomObject} subscription - membership
 * @returns {string} changes when the membership changes, to detect a quote gone stale
 */
function getStamp(subscription) {
    var c = subscription.custom;
    return [c.planID, c.status, c.expirationDate ? c.expirationDate.getTime() : '', c.creditBaseCents || 0].join('|');
}

/**
 * Cancels: no future renewal, and the paid benefits stay until the paid-through date.
 * @param {string} customerNo - customer
 * @param {string} actor - audit actor
 * @returns {Object} result with effectiveDate
 */
function cancelMembership(customerNo, actor) {
    var subscription = getSubscription(customerNo);
    if (!subscription || !isEntitled(subscription)) return membershipHelpers.errorResult('no-membership');
    if (subscription.custom.pendingTransactionID) return membershipHelpers.errorResult('payment-pending');
    if (subscription.custom.status === 'CANCELLED') return { error: false, effectiveDate: subscription.custom.paidThroughDate };
    try {
        Transaction.wrap(function () {
            transition(subscription, 'CANCELLED', actor, 'customer-request');
            subscription.custom.autoRenewEnabled = false;
            subscription.custom.renewalDate = null;
            membershipHelpers.notify(customerNo, 'CANCELLED', subscription.custom.subscriptionID + ':' + membershipHelpers.toDay(subscription.custom.paidThroughDate), { date: membershipHelpers.toDay(subscription.custom.paidThroughDate) });
        });
    } catch (e) {
        return membershipHelpers.errorResult(e.errorCode || 'general');
    }
    return { error: false, effectiveDate: subscription.custom.paidThroughDate };
}

/**
 * Takes a cancellation back while the paid term is still running.
 * @param {string} customerNo - customer
 * @param {string} actor - audit actor
 * @returns {Object} result
 */
function reactivateMembership(customerNo, actor) {
    var subscription = getSubscription(customerNo);
    if (!subscription || subscription.custom.status !== 'CANCELLED' || !isEntitled(subscription)) return membershipHelpers.errorResult('not-reactivatable');
    Transaction.wrap(function () {
        transition(subscription, 'ACTIVE', actor, 'reactivated');
    });
    return { error: false };
}

/**
 * @param {string} customerNo - customer
 * @param {string} reason - why (required)
 * @param {string} actor - audit actor
 * @returns {Object} result
 */
function suspendMembership(customerNo, reason, actor) {
    var subscription = getSubscription(customerNo);
    if (!subscription) return membershipHelpers.errorResult('no-membership');
    if (!reason) return membershipHelpers.errorResult('invalid', { reason: 'required' });
    try {
        Transaction.wrap(function () {
            transition(subscription, 'SUSPENDED', actor, reason);
            membershipHelpers.notify(customerNo, 'MEMBERSHIP_CHANGED', subscription.custom.subscriptionID + ':suspended:' + Date.now(), { status: 'suspended' });
        });
    } catch (e) {
        return membershipHelpers.errorResult(e.errorCode || 'general');
    }
    return { error: false };
}

/**
 * @param {string} customerNo - customer
 * @param {string} reason - why (required)
 * @param {string} actor - audit actor
 * @returns {Object} result
 */
function restoreMembership(customerNo, reason, actor) {
    var subscription = getSubscription(customerNo);
    if (!subscription || subscription.custom.status !== 'SUSPENDED') return membershipHelpers.errorResult('not-suspended');
    if (!reason) return membershipHelpers.errorResult('invalid', { reason: 'required' });
    var paid = subscription.custom.paidThroughDate && subscription.custom.paidThroughDate.getTime() > Date.now();
    Transaction.wrap(function () {
        transition(subscription, paid ? 'ACTIVE' : 'EXPIRED', actor, reason);
        membershipHelpers.notify(customerNo, 'MEMBERSHIP_CHANGED', subscription.custom.subscriptionID + ':restored:' + Date.now(), { status: 'restored' });
    });
    return { error: false };
}

/**
 * Saves the customer's renewal and e-mail choices. Automatic renewal needs the feature switched
 * on, a recurring payment adapter and an active membership; turning it on records the consent.
 * @param {string} customerNo - customer
 * @param {boolean} autoRenew - wanted
 * @param {boolean} marketing - birthday and voucher e-mails wanted
 * @param {string} actor - audit actor
 * @returns {Object} result
 */
function updateSettings(customerNo, autoRenew, marketing, actor) {
    var subscription = getSubscription(customerNo);
    if (!subscription) return membershipHelpers.errorResult('no-membership');
    var adapters = require('*/cartridge/scripts/integrations/membershipAdapters');
    if (autoRenew && !adapters.isAutoRenewAvailable()) return membershipHelpers.errorResult('auto-renew-unavailable');
    if (autoRenew && subscription.custom.status !== 'ACTIVE') return membershipHelpers.errorResult('auto-renew-unavailable');
    Transaction.wrap(function () {
        var c = subscription.custom;
        if (c.autoRenewEnabled !== autoRenew) {
            membershipHelpers.audit('auto-renew-changed', actor, c.subscriptionID, String(c.autoRenewEnabled), String(autoRenew), null);
            if (autoRenew) c.autoRenewConsentAt = new Date();
        }
        c.autoRenewEnabled = autoRenew;
        c.marketingEmailsEnabled = marketing;
        c.updatedAt = new Date();
    });
    return { error: false };
}

/**
 * Expires memberships past their paid-through date, and queues reminders before it.
 * @param {number} limit - maximum per run
 * @returns {Object} counts
 */
function processExpirations(limit) {
    var counts = { expired: 0, reminded: 0, failed: 0 };
    var now = new Date();
    var due = membershipHelpers.queryPage(TYPE, 'custom.paidThroughDate < {0} AND custom.status != {1} AND custom.status != {2}', 'custom.paidThroughDate asc', [now, 'EXPIRED', 'SUSPENDED'], 0, limit).items;
    due.forEach(function (subscription) {
        // A payment in flight may still extend the term; reconciliation settles it first.
        if (subscription.custom.pendingTransactionID || !canTransition(subscription.custom.status, 'EXPIRED')) return;
        try {
            Transaction.wrap(function () {
                transition(subscription, 'EXPIRED', 'job:expiration', 'paid-through-date-passed');
                subscription.custom.autoRenewEnabled = false;
                membershipHelpers.notify(subscription.custom.customerNo, 'EXPIRED', subscription.custom.subscriptionID + ':' + membershipHelpers.toDay(subscription.custom.paidThroughDate), { date: membershipHelpers.toDay(subscription.custom.paidThroughDate) });
            });
            counts.expired += 1;
        } catch (e) {
            counts.failed += 1;
        }
    });
    String(membershipHelpers.getPreference('primeMembershipReminderDays') || '').split(',').forEach(function (value) {
        var days = Number(value);
        if (!(days > 0)) return;
        var until = new Date(now.getTime() + days * membershipHelpers.DAY);
        var from = new Date(now.getTime() + (days - 1) * membershipHelpers.DAY);
        membershipHelpers.queryPage(TYPE, 'custom.paidThroughDate >= {0} AND custom.paidThroughDate <= {1}', 'custom.paidThroughDate asc', [from, until], 0, limit).items.forEach(function (subscription) {
            if (!isEntitled(subscription, now.getTime()) || subscription.custom.status === 'CANCELLED') return;
            Transaction.wrap(function () {
                var date = membershipHelpers.toDay(subscription.custom.paidThroughDate);
                if (membershipHelpers.notify(subscription.custom.customerNo, 'EXPIRING', subscription.custom.subscriptionID + ':' + date + ':' + days, { days: days, date: date })) counts.reminded += 1;
            });
        });
    });
    return counts;
}

module.exports = {
    TRANSITIONS: TRANSITIONS,
    ENTITLED: ENTITLED,
    getSubscription: getSubscription,
    canTransition: canTransition,
    isEntitled: isEntitled,
    transition: transition,
    createSubscription: createSubscription,
    getStamp: getStamp,
    cancelMembership: cancelMembership,
    reactivateMembership: reactivateMembership,
    suspendMembership: suspendMembership,
    restoreMembership: restoreMembership,
    updateSettings: updateSettings,
    processExpirations: processExpirations
};
