'use strict';

/**
 * Birthday rewards and monthly vouchers: single-use system codes from coupons the merchant sets
 * up, issued by jobs. The usage key is unique per membership and period, and the code is taken
 * inside the transaction that creates it, so a retry can't issue a second code.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');
var membershipHelpers = require('*/cartridge/scripts/helpers/membershipHelpers');
var planHelpers = require('*/cartridge/scripts/helpers/membershipPlanHelpers');
var subscriptionHelpers = require('*/cartridge/scripts/helpers/membershipSubscriptionHelpers');

var log = Logger.getLogger('prime-membership', 'membership-reward');
var TYPE = 'PrimeMembershipBenefitUsage';

/**
 * @param {string} couponID - coupon
 * @returns {?dw.campaign.Coupon} an enabled single-use system-code coupon, or null
 */
function getRewardCoupon(couponID) {
    var CouponMgr = require('dw/campaign/CouponMgr');
    var Coupon = require('dw/campaign/Coupon');
    var coupon = couponID ? CouponMgr.getCoupon(couponID) : null;
    if (!coupon || !coupon.isEnabled() || coupon.getType() !== Coupon.TYPE_SYSTEM_CODES) return null;
    return coupon.getRedemptionLimitPerCode() === 1 ? coupon : null;
}

/**
 * @param {dw.object.CustomObject} subscription - membership
 * @param {string} benefitID - benefit
 * @param {string} period - period the reward belongs to
 * @param {string} notification - notification type
 * @param {Object} benefit - configuration with couponID
 * @returns {string} issued, duplicate, no-coupon or no-code
 */
function issueReward(subscription, benefitID, period, notification, benefit) {
    var s = subscription.custom;
    var id = s.subscriptionID + ':' + benefitID + ':' + period;
    if (CustomObjectMgr.getCustomObject(TYPE, id)) return 'duplicate';
    var coupon = getRewardCoupon(benefit.couponID);
    if (!coupon) return 'no-coupon';
    return Transaction.wrap(function () {
        var code = coupon.getNextCouponCode();
        if (!code) return 'no-code';
        var record = CustomObjectMgr.createCustomObject(TYPE, id);
        record.custom.subscriptionID = s.subscriptionID;
        record.custom.customerNo = s.customerNo;
        record.custom.benefitID = benefitID;
        record.custom.usagePeriod = period;
        record.custom.discountCents = 0;
        record.custom.usageStatus = 'ISSUED';
        record.custom.rewardCode = code;
        record.custom.createdAt = new Date();
        record.custom.updatedAt = new Date();
        membershipHelpers.notify(s.customerNo, notification, id, { code: code });
        return 'issued';
    });
}

/**
 * @param {string} cursorName - job state name
 * @param {number} limit - maximum per run
 * @param {Function} fn - subscription, plan => outcome text
 * @returns {Object} counts by outcome
 */
function forEachMember(cursorName, limit, fn) {
    var counts = { checked: 0, issued: 0, duplicate: 0, failed: 0 };
    var state = membershipHelpers.getJobState(cursorName);
    var page = membershipHelpers.queryPage('PrimeMembershipSubscription', 'custom.paidThroughDate > {0}', 'custom.subscriptionID asc', [new Date()], state.offset || 0, limit);
    page.items.forEach(function (subscription) {
        counts.checked += 1;
        if (!subscriptionHelpers.isEntitled(subscription)) return;
        var plan = planHelpers.getPlan(subscription.custom.planID);
        if (!plan || !plan.valid) return;
        try {
            var outcome = fn(subscription, plan);
            if (outcome === 'issued') counts.issued += 1;
            else if (outcome === 'duplicate') counts.duplicate += 1;
            else if (outcome === 'no-coupon' || outcome === 'no-code') counts.failed += 1;
        } catch (e) {
            counts.failed += 1;
            log.error('Reward for membership {0} failed: {1}', subscription.custom.subscriptionID, e.message);
        }
    });
    var next = (state.offset || 0) + page.items.length;
    membershipHelpers.saveJobState(cursorName, { offset: next < page.total ? next : 0 });
    return counts;
}

/**
 * @param {Object} profile - customer profile
 * @param {number} windowDays - days ahead of the birthday when the reward is issued
 * @param {number} nowMs - now
 * @returns {?number} the year of a birthday within the window
 */
function getBirthdayYear(profile, windowDays, nowMs) {
    if (!profile || !profile.birthday) return null;
    var birthday = new Date(profile.birthday.getTime());
    var now = new Date(nowMs);
    var year = null;
    [now.getUTCFullYear(), now.getUTCFullYear() + 1].some(function (candidate) {
        var next = Date.UTC(candidate, birthday.getUTCMonth(), birthday.getUTCDate());
        var midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        if (next >= midnight && next - midnight <= windowDays * membershipHelpers.DAY) {
            year = candidate;
            return true;
        }
        return false;
    });
    return year;
}

/**
 * @param {number} limit - maximum per run
 * @returns {Object} counts
 */
function issueBirthdayRewards(limit) {
    var CustomerMgr = require('dw/customer/CustomerMgr');
    return forEachMember('birthday-rewards', limit, function (subscription, plan) {
        var benefit = plan.benefits['birthday-reward'];
        if (!benefit || benefit.enabled !== true) return 'skipped';
        var customer = CustomerMgr.getCustomerByCustomerNumber(subscription.custom.customerNo);
        var year = getBirthdayYear(customer ? customer.profile : null, benefit.windowDays || 0, Date.now());
        return year ? issueReward(subscription, 'birthday-reward', String(year), 'BIRTHDAY_REWARD', benefit) : 'skipped';
    });
}

/**
 * @param {number} limit - maximum per run
 * @returns {Object} counts
 */
function issueMonthlyVouchers(limit) {
    var month = new Date().toISOString().slice(0, 7);
    return forEachMember('monthly-vouchers', limit, function (subscription, plan) {
        var benefit = plan.benefits['monthly-voucher'];
        if (!benefit || benefit.enabled !== true) return 'skipped';
        return issueReward(subscription, 'monthly-voucher', month, 'MONTHLY_VOUCHER', benefit);
    });
}

/**
 * A reward code is meant for one customer. This looks the code up on the usage record, because
 * the platform's coupon doesn't know the owner.
 * @param {string} code - coupon code in a basket
 * @param {?string} customerNo - shopper
 * @returns {boolean} true when the code belongs to another customer
 */
function isForeignRewardCode(code, customerNo) {
    var owner = membershipHelpers.queryPage(TYPE, 'custom.rewardCode = {0}', null, [String(code).toUpperCase()], 0, 1).items[0];
    return !!owner && owner.custom.customerNo !== customerNo;
}

module.exports = {
    getRewardCoupon: getRewardCoupon,
    getBirthdayYear: getBirthdayYear,
    issueBirthdayRewards: issueBirthdayRewards,
    issueMonthlyVouchers: issueMonthlyVouchers,
    isForeignRewardCode: isForeignRewardCode
};
