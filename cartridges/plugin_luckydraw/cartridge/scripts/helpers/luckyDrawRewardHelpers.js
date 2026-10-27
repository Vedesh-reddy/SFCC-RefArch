'use strict';

/**
 * Coupon rewards. The discount itself (fixed amount, percentage, free shipping, categories,
 * minimum basket, maximum discount) is an existing Business Manager promotion whose coupon
 * issues single-use codes (system-generated or imported). The plugin takes the next unissued
 * code inside the same transaction that stores the reward, so a reward is issued exactly once
 * and a rollback never loses the link between code and winner.
 *
 * The platform does not bind a code to a customer or give it its own expiry, so the plugin
 * enforces both when the code is applied to a basket and again at order placement.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');
var luckyDrawHelpers = require('*/cartridge/scripts/helpers/luckyDrawHelpers');

var log = Logger.getLogger('plugin-luckydraw', 'luckydraw-reward');
var SYSTEM = luckyDrawHelpers.actor('SYSTEM', 'reward-job');
var REWARD_FLOW = {
    PENDING: ['ISSUED', 'FAILED', 'REVOKED'],
    FAILED: ['PENDING', 'REVOKED'],
    ISSUED: ['REDEEMED', 'EXPIRED', 'REVOKED'],
    REDEEMED: [],
    EXPIRED: [],
    REVOKED: []
};

/**
 * @param {string} code - coupon code
 * @returns {?string} keyed hash used to find the reward of a code
 */
function getCodeHash(code) {
    return luckyDrawHelpers.hmac('coupon|' + String(code || '').trim().toUpperCase());
}

/**
 * Inside a transaction. One reward per confirmed winner (same key).
 * @param {dw.object.CustomObject} winner - confirmed winner
 * @returns {dw.object.CustomObject} reward
 */
function createReward(winner) {
    var w = winner.custom;
    var reward = CustomObjectMgr.getCustomObject('LuckyDrawReward', w.winnerId);
    if (reward) return reward;
    reward = CustomObjectMgr.createCustomObject('LuckyDrawReward', w.winnerId);
    var r = reward.custom;
    r.campaignId = w.campaignId;
    r.executionId = w.executionId;
    r.customerNo = w.customerNo;
    r.tier = w.tier;
    r.label = w.prizeLabel;
    r.couponId = w.couponId;
    r.validityDays = w.validityDays;
    r.status = 'PENDING';
    r.attempts = 0;
    r.nextAttemptAt = new Date();
    r.createdAt = new Date();
    return reward;
}

/**
 * Issues the coupon code of one pending reward.
 * @param {dw.object.CustomObject} reward - reward
 * @returns {string} ISSUED, or the problem
 */
function issueReward(reward) {
    var r = reward.custom;
    var CouponMgr = require('dw/campaign/CouponMgr');
    var Coupon = require('dw/campaign/Coupon');
    var problem = null;
    try {
        Transaction.wrap(function () {
            var coupon = CouponMgr.getCoupon(r.couponId);
            if (!coupon || !coupon.isEnabled()) throw new Error('coupon-unavailable');
            if ([Coupon.TYPE_SYSTEM_CODES, Coupon.TYPE_MULTIPLE_CODES].indexOf(coupon.getType()) < 0 || coupon.getRedemptionLimitPerCode() !== 1) throw new Error('coupon-not-single-use');
            var code = coupon.getNextCouponCode();
            if (!code) throw new Error('coupon-exhausted');
            var hash = getCodeHash(code);
            if (!hash) throw new Error('key-unavailable');
            if (!luckyDrawHelpers.canMove(REWARD_FLOW, r.status, 'ISSUED')) throw new Error('not-pending');
            var now = new Date();
            r.status = 'ISSUED';
            r.couponCode = code;
            r.couponCodeHash = hash;
            r.issuedAt = now;
            r.expiresAt = new Date(now.getTime() + r.validityDays * 86400000);
            r.attempts = (r.attempts || 0) + 1;
            luckyDrawHelpers.logAudit({ entityType: 'REWARD', entityId: r.rewardId, campaignId: r.campaignId, action: 'ISSUE', actor: SYSTEM, from: 'PENDING', to: 'ISSUED' });
            var campaign = CustomObjectMgr.getCustomObject('LuckyDrawCampaign', r.campaignId);
            if (campaign && campaign.custom.notifyWinners) {
                luckyDrawHelpers.notify(r.customerNo, 'REWARD_ISSUED', { campaign: campaign.custom.name, prize: r.label, expires: r.expiresAt.toISOString().slice(0, 10) });
            }
        });
    } catch (e) {
        problem = e.message;
    }
    if (!problem) return 'ISSUED';
    var attempts = (r.attempts || 0) + 1;
    log.warn('Reward {0} not issued (attempt {1}): {2}', r.rewardId, attempts, problem);
    Transaction.wrap(function () {
        r.attempts = attempts;
        r.failureReason = String(problem).slice(0, 200);
        var delay = 60000;
        for (var i = 0; i < attempts && delay < 86400000; i++) delay *= 2;
        r.nextAttemptAt = new Date(Date.now() + Math.min(delay, 86400000));
        if (attempts >= luckyDrawHelpers.getPreference('luckyDrawRewardMaxAttempts')) {
            r.status = 'FAILED';
            luckyDrawHelpers.openCase({ caseType: 'COUPON_ISSUE_FAILED', campaignId: r.campaignId, entityId: r.rewardId, severity: 'HIGH', dedupeKey: 'coupon:' + r.rewardId, detail: { reason: r.failureReason } });
        }
    });
    return problem;
}

/**
 * Inside a transaction.
 * @param {dw.object.CustomObject} reward - issued reward
 * @param {string} orderNo - order that used the code
 */
function markRewardRedeemed(reward, orderNo) {
    var r = reward.custom;
    if (!luckyDrawHelpers.canMove(REWARD_FLOW, r.status, 'REDEEMED')) return;
    r.status = 'REDEEMED';
    r.redeemedAt = new Date();
    r.orderNo = orderNo || null;
    luckyDrawHelpers.logAudit({ entityType: 'REWARD', entityId: r.rewardId, campaignId: r.campaignId, action: 'REDEEM', actor: SYSTEM, from: 'ISSUED', to: 'REDEEMED', detail: { orderNo: orderNo || null } });
}

/**
 * Job helper: issues due rewards (re-checking the winner first), syncs redemptions recorded by
 * the platform (e.g. headless orders) and expires old codes.
 * @param {number} limit - maximum rewards per part
 * @returns {Object} counts
 */
function processRewards(limit) {
    var CouponMgr = require('dw/campaign/CouponMgr');
    var counts = { issued: 0, failed: 0, skipped: 0, redeemed: 0, expired: 0 };
    luckyDrawHelpers.queryPage('LuckyDrawReward', 'custom.status = {0} AND custom.nextAttemptAt <= {1}', 'custom.nextAttemptAt asc', ['PENDING', new Date()], 0, limit).items.forEach(function (reward) {
        var winner = CustomObjectMgr.getCustomObject('LuckyDrawWinner', reward.custom.rewardId);
        if (!winner || winner.custom.status !== 'CONFIRMED') {
            counts.skipped += 1;
        } else if (issueReward(reward) === 'ISSUED') {
            counts.issued += 1;
        } else {
            counts.failed += 1;
        }
    });
    luckyDrawHelpers.queryPage('LuckyDrawReward', 'custom.status = {0}', 'custom.issuedAt asc', ['ISSUED'], 0, limit).items.forEach(function (reward) {
        var r = reward.custom;
        var redemptions = CouponMgr.getRedemptions(r.couponId, r.couponCode);
        if (redemptions && redemptions.size() > 0) {
            var first = redemptions.iterator().next();
            Transaction.wrap(function () { markRewardRedeemed(reward, first.orderNo); });
            counts.redeemed += 1;
        } else if (r.expiresAt.getTime() <= Date.now()) {
            Transaction.wrap(function () {
                r.status = 'EXPIRED';
                luckyDrawHelpers.logAudit({ entityType: 'REWARD', entityId: r.rewardId, campaignId: r.campaignId, action: 'EXPIRE', actor: SYSTEM, from: 'ISSUED', to: 'EXPIRED' });
            });
            counts.expired += 1;
        }
    });
    return counts;
}

/**
 * Inside a transaction: withdraws a reward that is not redeemed or expired.
 * @param {dw.object.CustomObject} reward - reward
 * @param {string} reason - reason
 * @param {Object} by - who
 * @returns {boolean} true when the reward was withdrawn
 */
function revokeReward(reward, reason, by) {
    var r = reward.custom;
    var from = r.status;
    if (!luckyDrawHelpers.canMove(REWARD_FLOW, from, 'REVOKED')) return false;
    r.status = 'REVOKED';
    r.failureReason = String(reason).slice(0, 200);
    luckyDrawHelpers.logAudit({ entityType: 'REWARD', entityId: r.rewardId, campaignId: r.campaignId, action: 'REVOKE', actor: by, from: from, to: 'REVOKED', reason: reason });
    if (from === 'ISSUED') luckyDrawHelpers.notify(r.customerNo, 'REWARD_REVOKED', { prize: r.label });
    return true;
}

/**
 * Business Manager: retry a failed issuance, or withdraw a reward with a reason.
 * @param {string} rewardId - reward
 * @param {string} action - retry | revoke
 * @param {string} reason - reason (at least 10 characters to revoke)
 * @param {Object} by - admin actor
 * @returns {Object} result
 */
function updateReward(rewardId, action, reason, by) {
    var reward = CustomObjectMgr.getCustomObject('LuckyDrawReward', String(rewardId));
    if (!reward) return luckyDrawHelpers.errorResult('not-found');
    var text = luckyDrawHelpers.cleanText(reason).slice(0, 1000);
    if (action !== 'retry' && action !== 'revoke') return luckyDrawHelpers.errorResult('invalid', { action: 'invalid' });
    if (action === 'revoke' && text.length < 10) return luckyDrawHelpers.errorResult('invalid', { reason: 'required' });
    var target = action === 'revoke' ? 'REVOKED' : 'PENDING';
    if (!luckyDrawHelpers.canMove(REWARD_FLOW, reward.custom.status, target)) return luckyDrawHelpers.errorResult('not-allowed-now');
    Transaction.wrap(function () {
        if (action === 'revoke') {
            revokeReward(reward, text, by);
            return;
        }
        reward.custom.status = 'PENDING';
        reward.custom.attempts = 0;
        reward.custom.nextAttemptAt = new Date();
        luckyDrawHelpers.logAudit({ entityType: 'REWARD', entityId: rewardId, campaignId: reward.custom.campaignId, action: 'RETRY', actor: by, from: 'FAILED', to: 'PENDING' });
    });
    return { error: false };
}

/**
 * @param {string} code - coupon code entered by a shopper
 * @returns {?dw.object.CustomObject} reward of that code, or null for any other code
 */
function findRewardByCode(code) {
    if (!code || String(code).length > 100) return null;
    var hash = getCodeHash(code);
    return hash ? luckyDrawHelpers.queryPage('LuckyDrawReward', 'custom.couponCodeHash = {0}', null, [hash], 0, 1).items[0] || null : null;
}

/**
 * @param {string} code - coupon code
 * @param {dw.customer.Customer} customer - current customer
 * @returns {?{ok: boolean, reason: ?string, reward: dw.object.CustomObject}} null when it is not a lucky draw code
 */
function checkRewardCode(code, customer) {
    var reward = findRewardByCode(code);
    if (!reward) return null;
    var r = reward.custom;
    var owner = customer && customer.authenticated && customer.registered && customer.profile ? customer.profile.customerNo : null;
    var reason = null;
    if (owner !== r.customerNo) reason = 'not-yours';
    else if (r.status !== 'ISSUED') reason = 'not-active';
    else if (r.expiresAt.getTime() <= Date.now()) reason = 'expired';
    if (reason === 'not-yours') {
        log.warn('Reward code of {0} applied by another customer', r.rewardId);
        Transaction.wrap(function () {
            luckyDrawHelpers.openCase({ caseType: 'COUPON_MISUSE', campaignId: r.campaignId, entityId: r.rewardId, severity: 'MEDIUM', dedupeKey: 'misuse:' + r.rewardId });
        });
    }
    return { ok: !reason, reason: reason, reward: reward };
}

/**
 * @param {dw.object.CustomObject} reward - reward
 * @param {boolean} owner - true for the winner's own view (shows the code)
 * @returns {Object} view
 */
function getRewardView(reward, owner) {
    var r = reward.custom;
    var expired = r.status === 'ISSUED' && r.expiresAt && r.expiresAt.getTime() <= Date.now();
    return {
        rewardId: r.rewardId,
        campaignId: r.campaignId,
        tier: r.tier,
        label: r.label,
        status: expired ? 'EXPIRED' : r.status,
        couponCode: owner && r.status === 'ISSUED' && !expired ? r.couponCode : null,
        issuedAt: r.issuedAt || null,
        expiresAt: r.expiresAt || null,
        redeemedAt: r.redeemedAt || null
    };
}

/**
 * @param {string} customerNo - winner
 * @param {number} limit - maximum rewards
 * @returns {Object[]} the customer's own rewards, newest first
 */
function getCustomerRewards(customerNo, limit) {
    return luckyDrawHelpers.queryPage('LuckyDrawReward', 'custom.customerNo = {0}', 'custom.createdAt desc', [customerNo], 0, limit).items.map(function (rw) { return getRewardView(rw, true); });
}

module.exports = {
    REWARD_FLOW: REWARD_FLOW,
    getCodeHash: getCodeHash,
    createReward: createReward,
    issueReward: issueReward,
    processRewards: processRewards,
    markRewardRedeemed: markRewardRedeemed,
    revokeReward: revokeReward,
    updateReward: updateReward,
    findRewardByCode: findRewardByCode,
    checkRewardCode: checkRewardCode,
    getRewardView: getRewardView,
    getCustomerRewards: getCustomerRewards
};
