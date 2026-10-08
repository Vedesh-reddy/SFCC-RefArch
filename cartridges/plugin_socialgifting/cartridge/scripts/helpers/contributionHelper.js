'use strict';

var store = require('./store');
var gifts = require('./groupGiftHelper');
var registryHelper = require('./registryHelper');
var permission = require('./registryPermissionHelper');
var token = require('../util/token');
var prefs = require('../util/preferences');
var v = require('../util/validation');
var money = require('../util/money');
/**
 * Create the contributionHelper domain operation.
 * @param {*} actor - actor input
 * @param {*} input - input input
 * @returns {*} Domain result
 */
function create(actor, input) {
    prefs.requireFeature('GroupGiftingEnabled');
    return store.transaction(function () {
        var gift = gifts.get(input.giftKey);
        var registry = registryHelper.get(gift.custom.registryKey);
        permission.active(registry, actor);
        if (!registry.custom.allowGroupGifting || gift.custom.status !== 'OPEN' || gift.custom.expiresAt.getTime() <= Date.now()) v.fail('GROUP_GIFT_CLOSED', 409);
        if (gift.custom.currency !== actor.currency) v.fail('CURRENCY_MISMATCH');
        var amount = money.amount(input.amount, gift.custom.currency);
        if (money.cmp(money.add(money.add(gift.custom.paid, gift.custom.held), amount), gift.custom.target) > 0) v.fail('FUNDING_CAPACITY', 409);
        var anonymous = v.bool(input.anonymous);
        if (anonymous && (!registry.custom.allowAnonymousGifts || !prefs.enabled('AnonymousGiftingEnabled'))) v.fail('ANONYMOUS_DISABLED');
        store.mutate('gift:' + input.giftKey, gift);
        gift.custom.held = money.add(gift.custom.held, amount);
        var key = token.random();
        store.create('Contribution', key, { publicKey: key, giftKey: input.giftKey, registryKey: gift.custom.registryKey,
            amount: amount, refundedAmount: '0', currency: gift.custom.currency, customerNo: actor.customerNo || '', actorHash: actor.actorHash,
            displayName: anonymous ? '' : v.text(input.displayName, 80), anonymous: anonymous, status: 'CREATED',
            holdExpiresAt: new Date(Date.now() + prefs.number('GroupGiftPaymentHoldMinutes') * 60000) });
        return key;
    });
}
/**
 * Get the contributionHelper domain operation.
 * @param {*} key - key input
 * @returns {*} Domain result
 */
function get(key) { var record = store.get('Contribution', key); if (!record) v.fail('NOT_FOUND', 404); return record; }
/**
 * Raise a public error code without embedding private input.
 * @param {*} record - record input
 */
function fail(record) {
    if (['CREATED', 'PENDING'].indexOf(record.custom.status) === -1) return;
    var gift = gifts.get(record.custom.giftKey);
    store.mutate('gift:' + gift.custom.publicKey, gift);
    gift.custom.held = money.sub(gift.custom.held, record.custom.amount);
    record.custom.status = 'FAILED';
    gifts.releaseUnit(gift);
}
/**
 * Apply a verified payment transition exactly once.
 * @param {*} key - key input
 * @param {*} payment - payment input
 * @returns {*} Domain result
 */
function capture(key, payment) {
    return store.transaction(function () {
        var record = get(key);
        if (payment.currency !== record.custom.currency || money.cmp(payment.amount, record.custom.amount) !== 0) v.fail('PAYMENT_MISMATCH', 409);
        var claimKey = token.key([payment.provider, payment.paymentID]);
        var claim = store.get('PaymentClaim', claimKey);
        if (claim && claim.custom.contributionKey !== key) v.fail('PAYMENT_REUSED', 409);
        if (record.custom.status === 'PAID' || record.custom.status === 'REFUNDED') {
            if (record.custom.paymentID !== payment.paymentID) v.fail('PAYMENT_RECONCILIATION_REQUIRED', 409);
            return;
        }
        if (record.custom.status !== 'PENDING') v.fail('PAYMENT_RECONCILIATION_REQUIRED', 409);
        if (!claim) store.create('PaymentClaim', claimKey, { contributionKey: key });
        var gift = gifts.get(record.custom.giftKey);
        store.mutate('gift:' + gift.custom.publicKey, gift);
        gift.custom.held = money.sub(gift.custom.held, record.custom.amount);
        var previousPaid = gift.custom.paid;
        gift.custom.paid = money.add(gift.custom.paid, record.custom.amount);
        if (money.cmp(gift.custom.paid, gift.custom.target) > 0) v.fail('OVERFUNDING', 409);
        record.custom.status = 'PAID';
        record.custom.paymentID = payment.paymentID;
        var event = require('./activityHelper').record(gift.custom.registryKey, 'CONTRIBUTION_RECEIVED', gift.custom.itemKey, record.custom.anonymous);
        require('./notificationHelper').enqueue(gift.custom.registryKey, event, 'contribution');
        ['0.5', '0.75'].forEach(function (fraction) {
            var threshold = money.decimal(gift.custom.target).multiply(money.decimal(fraction)).toString();
            if (money.cmp(previousPaid, threshold) < 0 && money.cmp(gift.custom.paid, threshold) >= 0) {
                require('./notificationHelper').enqueue(gift.custom.registryKey, gift.custom.publicKey + ':' + fraction, 'contribution');
            }
        });
        if (money.cmp(gift.custom.paid, gift.custom.target) === 0 && gift.custom.status === 'OPEN') {
            gift.custom.status = 'FUNDED';
            var funded = require('./activityHelper').record(gift.custom.registryKey, 'GROUP_GIFT_FUNDED', gift.custom.itemKey, true);
            require('./notificationHelper').enqueue(gift.custom.registryKey, funded, 'funded');
        }
    });
}
/**
 * Apply a cumulative provider-confirmed refund without double subtraction.
 * @param {*} key - key input
 * @param {*} cumulativeAmount - cumulativeAmount input
 * @param {*} eventID - eventID input
 * @returns {*} Domain result
 */
function refund(key, cumulativeAmount, eventID) {
    return store.transaction(function () {
        var record = get(key);
        if (['PAID', 'REFUNDED'].indexOf(record.custom.status) === -1) v.fail('REFUND_STATE', 409);
        var amount = money.amount(cumulativeAmount, record.custom.currency);
        if (money.cmp(amount, record.custom.amount) > 0 || money.cmp(amount, record.custom.refundedAmount) < 0) v.fail('REFUND_AMOUNT', 409);
        var eventKey = token.key(['refund', key, eventID]);
        if (store.get('PaymentEvent', eventKey)) return;
        var delta = money.sub(amount, record.custom.refundedAmount);
        var gift = gifts.get(record.custom.giftKey);
        store.mutate('gift:' + gift.custom.publicKey, gift);
        store.create('PaymentEvent', eventKey, { contributionKey: key, kind: 'REFUND' });
        gift.custom.paid = money.sub(gift.custom.paid, delta);
        gift.custom.refunded = money.add(gift.custom.refunded, delta);
        record.custom.refundedAmount = amount;
        if (money.cmp(amount, record.custom.amount) === 0) record.custom.status = 'REFUNDED';
        // A refund never automatically reopens a funded/completed campaign.
        if (gift.custom.status === 'FUNDED') gift.custom.status = 'CANCELLED';
        gifts.releaseUnit(gift);
    });
}
module.exports = { create: create, get: get, fail: fail, capture: capture, refund: refund };
