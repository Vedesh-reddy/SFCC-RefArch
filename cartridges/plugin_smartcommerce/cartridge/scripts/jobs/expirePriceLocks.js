'use strict';

/**
 * Job step: marks pending and active price locks past their expiry as expired.
 * Basket calculation already ignores them; this keeps statuses truthful for reporting.
 * @module scripts/jobs/expirePriceLocks
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Status = require('dw/system/Status');
var Logger = require('dw/system/Logger');
var priceLock = require('*/cartridge/scripts/priceLock');

var customLogger = Logger.getLogger('smart-commerce', 'price-lock-job');

/**
 * @param {dw.object.CustomObject} lock - Lock past its expiry
 */
function expire(lock) {
    Transaction.wrap(function () {
        lock.custom.status = 'expired'; // eslint-disable-line no-param-reassign
    });
}

/**
 * @returns {dw.system.Status} OK, or ERROR when any lock failed
 */
function execute() {
    var locks = CustomObjectMgr.queryCustomObjects(priceLock.TYPE,
        '(custom.status = {0} OR custom.status = {1}) AND custom.expiresAt < {2}', null, 'active', 'pending', new Date());
    var expired = 0;
    var failed = 0;
    try {
        while (locks.hasNext()) {
            var lock = locks.next();
            try {
                expire(lock);
                expired += 1;
            } catch (e) {
                failed += 1;
                customLogger.error('Price lock {0} expiry failed: {1}', lock.UUID, e.message);
            }
        }
    } finally {
        locks.close();
    }
    customLogger.info('Price locks expired: {0}, failed: {1}', expired, failed);
    return failed ? new Status(Status.ERROR, 'ERROR', failed + ' lock(s) failed') : new Status(Status.OK, 'OK');
}

module.exports = {
    execute: execute
};
