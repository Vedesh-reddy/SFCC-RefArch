'use strict';

/**
 * Job step custom.ChatWidget.PurgeJourneyData: retention and erasure for the
 * shopping-assistant journal.
 *
 * - Deletes ChatWidgetActivity objects older than ActivityRetentionDays.
 * - Deletes ChatWidgetJourney objects (incl. reviews) inactive for longer than JourneyRetentionDays.
 * - When CustomerNo is set, erases every journey and activity of that customer,
 *   including guest activity recorded in the same journeys before sign-in.
 * @module scripts/jobs/purgeJourneyData
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Logger = require('dw/system/Logger');
var Status = require('dw/system/Status');
var Transaction = require('dw/system/Transaction');

var BATCH_SIZE = 200;
var DAY_MS = 24 * 60 * 60 * 1000;
var jobLogger = Logger.getLogger('chat-widget', 'journey-retention');

/**
 * Remove every custom object matched by a query, in batches.
 * @param {string} type custom object type
 * @param {string} query query string
 * @param {*} value query argument
 * @returns {number} removed count
 */
function purge(type, query, value) {
    var removed = 0;
    var iterator = CustomObjectMgr.queryCustomObjects(type, query, null, value);
    var batch = [];

    /**
     * Remove the collected batch in one transaction.
     */
    function flush() {
        Transaction.wrap(function () {
            batch.forEach(function (object) {
                CustomObjectMgr.remove(object);
            });
        });
        removed += batch.length;
        batch = [];
    }

    try {
        while (iterator.hasNext()) {
            batch.push(iterator.next());
            if (batch.length === BATCH_SIZE) {
                flush();
            }
        }
        if (batch.length) {
            flush();
        }
    } finally {
        iterator.close();
    }
    return removed;
}

/**
 * Erase all journal data of one customer.
 * @param {string} customerNo customer number
 * @returns {number} removed count
 */
function eraseCustomer(customerNo) {
    var removed = 0;
    var journeys = CustomObjectMgr.queryCustomObjects('ChatWidgetJourney', 'custom.customerNo = {0}', null, customerNo);
    var keys = [];

    try {
        while (journeys.hasNext()) {
            keys.push(journeys.next().custom.key);
        }
    } finally {
        journeys.close();
    }
    keys.forEach(function (key) {
        removed += purge('ChatWidgetActivity', 'custom.journeyKey = {0}', key);
    });
    removed += purge('ChatWidgetActivity', 'custom.customerNo = {0}', customerNo);
    removed += purge('ChatWidgetJourney', 'custom.customerNo = {0}', customerNo);
    return removed;
}

/**
 * Job step entry point.
 * @param {Object} parameters ActivityRetentionDays, JourneyRetentionDays, CustomerNo
 * @returns {dw.system.Status} job status
 */
function execute(parameters) {
    var activityDays = parseInt(parameters.ActivityRetentionDays, 10);
    var journeyDays = parseInt(parameters.JourneyRetentionDays, 10);
    var removed = 0;

    if (!(activityDays > 0) || !(journeyDays > 0)) {
        return new Status(Status.ERROR, 'ERROR', 'Retention days must be positive numbers.');
    }
    try {
        if (parameters.CustomerNo) {
            removed += eraseCustomer(String(parameters.CustomerNo));
        }
        removed += purge('ChatWidgetActivity', 'custom.occurredAt < {0}', new Date(Date.now() - (activityDays * DAY_MS)));
        removed += purge('ChatWidgetJourney', 'custom.lastActivityAt < {0}', new Date(Date.now() - (journeyDays * DAY_MS)));
    } catch (error) {
        jobLogger.error('Journey retention failed after removing {0} objects: {1}', removed, error.message);
        return new Status(Status.ERROR, 'ERROR', error.message);
    }
    jobLogger.info('Journey retention removed {0} objects.', removed);
    return new Status(Status.OK, 'OK', 'Removed ' + removed + ' objects.');
}

module.exports = {
    execute: execute
};
