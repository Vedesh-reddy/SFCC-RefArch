'use strict';

/**
 * Job steps of the analytics. Each step is bounded by its parameters, can be repeated without
 * counting anything twice, records its run in AnalyticsJobCheckpoint and reports its counts
 * in the step status. Steps that write aggregates hold the writer lock.
 */

var Status = require('dw/system/Status');
var Logger = require('dw/system/Logger');
var analyticsHelpers = require('*/cartridge/scripts/helpers/analyticsHelpers');
var aggregationHelpers = require('*/cartridge/scripts/helpers/analyticsAggregationHelpers');

var log = Logger.getLogger('plugin-analytics', 'analytics-jobs');

/**
 * @param {Object} params - job parameters
 * @param {string} name - parameter
 * @param {number} fallback - default
 * @param {number} max - largest allowed value
 * @returns {number} bounded value
 */
function limit(params, name, fallback, max) {
    var value = Number(params && params[name]);
    return value > 0 && value <= max ? Math.floor(value) : fallback;
}

/**
 * Keeps a step on its own timing, because it shares one job with faster steps.
 * @param {string} jobId - checkpoint ID
 * @param {Object} params - job parameters
 * @returns {boolean} true when the step should run now
 */
function isDue(jobId, params) {
    var minutes = Number(params && params.RunEveryMinutes);
    if (!(minutes > 0)) return true;
    var checkpoint = aggregationHelpers.getCheckpoint(jobId);
    var lastRun = checkpoint && checkpoint.custom.lastRunAt;
    // One minute of grace, because the job never starts exactly on time.
    return !lastRun || Date.now() - lastRun.getTime() >= (minutes - 1) * 60000;
}

/**
 * @param {string} jobId - checkpoint ID
 * @param {boolean} writer - takes the writer lock
 * @param {Function} fn - work returning counts
 * @param {Object} params - job parameters
 * @returns {dw.system.Status} OK, or ERROR when the step threw or reported failures or problems
 */
function run(jobId, writer, fn, params) {
    if (!analyticsHelpers.isEnabled(null)) return new Status(Status.OK, 'DISABLED', 'Analytics disabled or the site currency is not USD');
    if (!isDue(jobId, params)) return new Status(Status.OK, 'NOT_DUE', jobId + ' is not due yet');
    if (writer && !aggregationHelpers.acquireLock(jobId)) return new Status(Status.OK, 'LOCKED', 'Another analytics job is writing; skipped');
    var startedAt = new Date();
    var status;
    var summary;
    try {
        var counts = fn() || {};
        summary = JSON.stringify(counts);
        var attention = counts.failed > 0 || counts.mismatches > 0 || (counts.problems && counts.problems.length > 0);
        status = attention ? new Status(Status.ERROR, 'ATTENTION', summary.slice(0, 4000)) : new Status(Status.OK, 'OK', summary.slice(0, 4000));
        log.info('{0}: {1}', jobId, summary);
    } catch (e) {
        summary = JSON.stringify({ error: e.message });
        status = new Status(Status.ERROR, 'ERROR', e.message);
        log.error('{0} failed: {1}', jobId, e.message);
    } finally {
        if (writer) aggregationHelpers.releaseLock();
    }
    var fields = { status: status.code, lastRunAt: startedAt, durationMs: Date.now() - startedAt.getTime(), counts: summary };
    if (status.code === 'OK') fields.lastSuccessAt = startedAt;
    aggregationHelpers.saveCheckpoint(jobId, fields);
    return status;
}

/**
 * Folds event batches into the daily aggregates.
 * @param {Object} params - {MaxBatches}
 * @returns {dw.system.Status} status
 */
exports.aggregateEvents = function (params) {
    return run('aggregate-events', true, function () {
        return aggregationHelpers.aggregateEvents(limit(params, 'MaxBatches', 5000, 100000));
    }, params);
};

/**
 * Brings the purchase figures in line with the orders changed since the last run.
 * @param {Object} params - {MaxOrders}
 * @returns {dw.system.Status} status
 */
exports.reconcileOrders = function (params) {
    return run('reconcile-orders', true, function () {
        if (!analyticsHelpers.isEnabled('purchase')) return { skipped: 'purchase tracking disabled' };
        return aggregationHelpers.reconcileOrders(limit(params, 'MaxOrders', 2000, 50000));
    }, params);
};

/**
 * Precomputes the top and bottom 10 lists of the standard periods.
 * @param {Object} params - {MaxRecords, MaxProducts}
 * @returns {dw.system.Status} status
 */
exports.generateRankings = function (params) {
    return run('generate-rankings', false, function () {
        return require('*/cartridge/scripts/helpers/analyticsReportHelpers').generateRankings(limit(params, 'MaxRecords', 200000, 1000000), limit(params, 'MaxProducts', 20000, 200000));
    }, params);
};

/**
 * Applies the retention period.
 * @param {Object} params - {MaxItems}
 * @returns {dw.system.Status} status
 */
exports.cleanup = function (params) {
    return run('cleanup', true, function () {
        return aggregationHelpers.cleanup(limit(params, 'MaxItems', 10000, 100000));
    }, params);
};

/**
 * Checks the recent aggregates against each other and against the orders.
 * @param {Object} params - {Days, MaxItems}
 * @returns {dw.system.Status} status
 */
exports.integrityCheck = function (params) {
    return run('integrity-check', false, function () {
        return aggregationHelpers.checkIntegrity(limit(params, 'Days', 7, 62), limit(params, 'MaxItems', 50000, 200000));
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
