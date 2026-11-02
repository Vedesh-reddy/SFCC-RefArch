'use strict';

/**
 * Job steps. Every step is bounded by MaxItems, resumes from record state or a saved position,
 * can be repeated without double effects, and reports counts in its status.
 */

var Status = require('dw/system/Status');
var Logger = require('dw/system/Logger');

var log = Logger.getLogger('prime-membership', 'membership-job');

/**
 * @param {Object} params - job parameters
 * @param {number} fallback - default
 * @returns {number} bounded batch size
 */
function maxItems(params, fallback) {
    var value = Number(params && params.MaxItems);
    return value > 0 && value <= 10000 ? Math.floor(value) : fallback;
}

/**
 * @param {string} name - step name
 * @param {Function} fn - work returning counts
 * @returns {dw.system.Status} OK, or ERROR when the step threw or reported failures
 */
function run(name, fn) {
    if (!require('*/cartridge/scripts/helpers/membershipPlanHelpers').isEnabled()) return new Status(Status.OK, 'DISABLED', 'Membership disabled');
    try {
        var counts = fn() || {};
        var summary = JSON.stringify(counts);
        log.info('{0}: {1}', name, summary);
        return counts.failed > 0 || counts.errors > 0 ? new Status(Status.ERROR, 'ATTENTION', summary) : new Status(Status.OK, 'OK', summary);
    } catch (e) {
        log.error('{0} failed: {1}', name, e.errorCode || e.message);
        return new Status(Status.ERROR, 'ERROR', String(e.errorCode || e.message));
    }
}

exports.expiration = function (params) {
    return run('expiration', function () {
        return require('*/cartridge/scripts/helpers/membershipSubscriptionHelpers').processExpirations(maxItems(params, 2000));
    });
};

exports.renewal = function (params) {
    return run('renewal', function () {
        return require('*/cartridge/scripts/helpers/membershipPaymentHelpers').processRenewals(maxItems(params, 500));
    });
};

exports.benefitReset = function (params) {
    return run('benefit-reset', function () {
        var limit = maxItems(params, 2000);
        var periods = require('*/cartridge/scripts/helpers/membershipBenefitHelpers').advanceBenefitPeriods(limit);
        var vouchers = require('*/cartridge/scripts/helpers/membershipRewardHelpers').issueMonthlyVouchers(limit);
        return { advanced: periods.advanced, vouchers: vouchers.issued, duplicate: vouchers.duplicate, failed: vouchers.failed };
    });
};

exports.birthdayReward = function (params) {
    return run('birthday-reward', function () {
        return require('*/cartridge/scripts/helpers/membershipRewardHelpers').issueBirthdayRewards(maxItems(params, 2000));
    });
};

exports.reconciliation = function (params) {
    return run('reconciliation', function () {
        var limit = maxItems(params, 500);
        var payments = require('*/cartridge/scripts/helpers/membershipPaymentHelpers').reconcileTransactions(limit);
        var usage = require('*/cartridge/scripts/helpers/membershipBenefitHelpers').reconcileUsage(limit);
        return Object.assign(payments, usage, { errors: payments.errors + usage.errors });
    });
};

exports.reporting = function (params) {
    return run('reporting', function () {
        return require('*/cartridge/scripts/helpers/membershipReportHelpers').runReports(maxItems(params, 5000));
    });
};

exports.notifications = function (params) {
    return run('notifications', function () {
        return require('*/cartridge/scripts/helpers/membershipHelpers').deliverNotifications(maxItems(params, 500));
    });
};
