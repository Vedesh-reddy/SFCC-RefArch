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
 * Keeps a step on its own timing, because it shares one job with faster steps. The run is claimed
 * up front, so a failed step waits for its next turn, as it would with its own schedule.
 * @param {string} name - step name
 * @param {Object} params - job parameters
 * @returns {boolean} true when the step should run now
 */
function claimRun(name, params) {
    var minutes = Number(params && params.RunEveryMinutes);
    if (!(minutes > 0)) return true;
    var key = 'last-run-' + name;
    var lastRun = require('*/cartridge/scripts/helpers/membershipHelpers').getJobState(key).at;
    // One minute of grace, because the job never starts exactly on time.
    if (lastRun && Date.now() - lastRun < (minutes - 1) * 60000) return false;
    require('*/cartridge/scripts/helpers/membershipHelpers').saveJobState(key, { at: Date.now() });
    return true;
}

/**
 * @param {string} name - step name
 * @param {Function} fn - work returning counts
 * @param {Object} params - job parameters
 * @returns {dw.system.Status} OK, or ERROR when the step threw or reported failures
 */
function run(name, fn, params) {
    if (!require('*/cartridge/scripts/helpers/membershipPlanHelpers').isEnabled()) return new Status(Status.OK, 'DISABLED', 'Membership disabled');
    if (!claimRun(name, params)) return new Status(Status.OK, 'NOT_DUE', name + ' is not due yet');
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
    }, params);
};

exports.renewal = function (params) {
    return run('renewal', function () {
        return require('*/cartridge/scripts/helpers/membershipPaymentHelpers').processRenewals(maxItems(params, 500));
    }, params);
};

exports.benefitReset = function (params) {
    return run('benefit-reset', function () {
        var limit = maxItems(params, 2000);
        var periods = require('*/cartridge/scripts/helpers/membershipBenefitHelpers').advanceBenefitPeriods(limit);
        var vouchers = require('*/cartridge/scripts/helpers/membershipRewardHelpers').issueMonthlyVouchers(limit);
        return { advanced: periods.advanced, vouchers: vouchers.issued, duplicate: vouchers.duplicate, failed: vouchers.failed };
    }, params);
};

exports.birthdayReward = function (params) {
    return run('birthday-reward', function () {
        return require('*/cartridge/scripts/helpers/membershipRewardHelpers').issueBirthdayRewards(maxItems(params, 2000));
    }, params);
};

exports.reconciliation = function (params) {
    return run('reconciliation', function () {
        var limit = maxItems(params, 500);
        var payments = require('*/cartridge/scripts/helpers/membershipPaymentHelpers').reconcileTransactions(limit);
        var usage = require('*/cartridge/scripts/helpers/membershipBenefitHelpers').reconcileUsage(limit);
        return Object.assign(payments, usage, { errors: payments.errors + usage.errors });
    }, params);
};

exports.reporting = function (params) {
    return run('reporting', function () {
        return require('*/cartridge/scripts/helpers/membershipReportHelpers').runReports(maxItems(params, 5000));
    }, params);
};

exports.notifications = function (params) {
    return run('notifications', function () {
        return require('*/cartridge/scripts/helpers/membershipHelpers').deliverNotifications(maxItems(params, 500));
    }, params);
};

/**
 * Notes failed steps in the job context. A job carries on after a failed step, so the job would
 * end OK unless its last step reports them.
 */
Object.keys(exports).forEach(function (name) {
    var step = exports[name];
    exports[name] = function (params, stepExecution) {
        var status = step(params);
        if (status.error && stepExecution) {
            var context = stepExecution.getJobExecution().getContext();
            var failed = context.get('failedSteps');
            context.put('failedSteps', (failed ? failed + ', ' : '') + stepExecution.getStepID());
        }
        return status;
    };
});

/**
 * Last step of the job: fails the job when an earlier step failed.
 * @param {Object} params - job parameters
 * @param {dw.job.JobStepExecution} stepExecution - the running step
 * @returns {dw.system.Status} ERROR naming the failed steps, otherwise OK
 */
exports.reportFailures = function (params, stepExecution) {
    var failed = stepExecution.getJobExecution().getContext().get('failedSteps');
    return failed ? new Status(Status.ERROR, 'ATTENTION', 'Failed steps: ' + failed) : new Status(Status.OK, 'OK', 'No failed steps');
};
