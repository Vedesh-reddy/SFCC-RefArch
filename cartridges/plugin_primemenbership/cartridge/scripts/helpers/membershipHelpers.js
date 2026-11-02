'use strict';

/**
 * Shared membership helpers: site preferences, result objects, money in integer cents, dates,
 * custom object queries, customer locks, audit trail, e-mail outbox, job state and the Custom
 * API response. Used by the other membership helpers.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Resource = require('dw/web/Resource');
var Site = require('dw/system/Site');
var Logger = require('dw/system/Logger');

var BUNDLE = 'primemembership';
var DAY = 86400000;
var LOCK_MINUTES = 30;
var API_STATUS = {
    disabled: 503,
    unauthenticated: 401,
    forbidden: 403,
    'not-found': 404,
    invalid: 400,
    'payment-pending': 409,
    'invalid-transition': 409
};

/**
 * @param {string} id - site preference ID
 * @returns {*} preference value (the metadata default when not set)
 */
function getPreference(id) {
    return Site.getCurrent().getCustomPreferenceValue(id);
}

/**
 * @param {string} id - set-of-string or enum preference ID
 * @returns {string[]} values, empty when not set
 */
function getListPreference(id) {
    var value = getPreference(id);
    if (!value) return [];
    return Array.prototype.map.call(value, function (entry) {
        return String(entry && entry.value !== undefined ? entry.value : entry);
    });
}

/**
 * @param {string} errorCode - kebab-case code; the message is error.<code> in the bundle
 * @param {Object} [fields] - field errors
 * @returns {Object} failed result
 */
function errorResult(errorCode, fields) {
    return {
        error: true,
        errorCode: errorCode,
        errorMessage: Resource.msg('error.' + errorCode, BUNDLE, Resource.msg('error.general', BUNDLE, null)),
        fields: fields || null
    };
}

/**
 * @param {string} code - error code
 * @returns {Error} error that a transaction rolls back on; carries the code for errorResult
 */
function abort(code) {
    var error = new Error(code);
    error.errorCode = code;
    return error;
}

/**
 * @param {number} cents - amount
 * @returns {string} formatted USD amount
 */
function formatCents(cents) {
    var Money = require('dw/value/Money');
    var StringUtils = require('dw/util/StringUtils');
    return StringUtils.formatMoney(new Money(cents / 100, 'USD'));
}

/**
 * @param {dw.value.Money} money - amount
 * @returns {number} integer cents, 0 when not available
 */
function centsOf(money) {
    return money && money.available ? Math.round(money.value * 100) : 0;
}

/**
 * @param {*} value - dollars as entered
 * @returns {?number} integer cents, or null when not a valid amount
 */
function toCents(value) {
    var text = String(value === null || value === undefined ? '' : value).trim();
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) return null;
    return Math.round(Number(text) * 100);
}

/**
 * Calendar months in UTC. A month end clamps (Jan 31 + 1 month is Feb 28/29), and Feb 29 + 12
 * months is Feb 28, as dw.util.Calendar does.
 * @param {Date} date - start
 * @param {number} months - months to add
 * @returns {Date} result
 */
function addMonths(date, months) {
    var Calendar = require('dw/util/Calendar');
    var calendar = new Calendar(date);
    calendar.setTimeZone('UTC');
    calendar.add(Calendar.MONTH, months);
    return calendar.getTime();
}

/**
 * @param {?Date} date - date
 * @returns {string} yyyy-mm-dd in UTC, empty without a date
 */
function toDay(date) {
    return date ? new Date(date.getTime()).toISOString().slice(0, 10) : '';
}

/**
 * @param {string} prefix - record prefix
 * @returns {string} unguessable ID
 */
function createId(prefix) {
    var SecureRandom = require('dw/crypto/SecureRandom');
    var Encoding = require('dw/crypto/Encoding');
    return prefix + '-' + Encoding.toHex(new SecureRandom().nextBytes(12)).toUpperCase();
}

/**
 * @param {string} type - custom object type
 * @param {string} query - query with custom.<attr> expressions (the platform allows at most 4)
 * @param {?string} sort - sort string
 * @param {Array} args - query arguments
 * @param {number} offset - rows to skip
 * @param {number} limit - page size
 * @returns {{items: Array, total: number}} one page
 */
function queryPage(type, query, sort, args, offset, limit) {
    var iterator = CustomObjectMgr.queryCustomObjects.apply(CustomObjectMgr, [type, query, sort].concat(args || []));
    var items = [];
    var total = 0;
    try {
        total = iterator.count;
        if (offset > 0) iterator.forward(offset);
        while (iterator.hasNext() && items.length < limit) items.push(iterator.next());
    } finally {
        iterator.close();
    }
    return { items: items, total: total };
}

/**
 * @param {string} type - custom object type
 * @param {string} query - query
 * @param {Array} args - query arguments
 * @returns {number} number of matching records
 */
function queryCount(type, query, args) {
    var iterator = CustomObjectMgr.queryCustomObjects.apply(CustomObjectMgr, [type, query, null].concat(args || []));
    try {
        return iterator.count;
    } finally {
        iterator.close();
    }
}

/**
 * @param {?string} text - JSON
 * @param {*} fallback - value for missing or broken JSON
 * @returns {*} parsed value
 */
function parseJson(text, fallback) {
    if (!text) return fallback;
    try {
        return JSON.parse(text);
    } catch (e) {
        return fallback;
    }
}

/**
 * Takes the per-customer lock. Creating the row is atomic across app servers because the key
 * is unique, so only one money-moving operation runs per customer; a lock left by a crashed
 * request is reclaimed after LOCK_MINUTES.
 * @param {string} customerNo - customer
 * @returns {boolean} true when the lock was taken
 */
function acquireLock(customerNo) {
    var key = 'lock-' + customerNo;
    try {
        return Transaction.wrap(function () {
            var existing = CustomObjectMgr.getCustomObject('PrimeMembershipJobState', key);
            if (existing) {
                if (Date.now() - existing.custom.updatedAt.getTime() < LOCK_MINUTES * 60000) return false;
                existing.custom.updatedAt = new Date();
                return true;
            }
            CustomObjectMgr.createCustomObject('PrimeMembershipJobState', key).custom.updatedAt = new Date();
            return true;
        });
    } catch (e) {
        return false;
    }
}

/**
 * @param {string} customerNo - customer
 */
function releaseLock(customerNo) {
    Transaction.wrap(function () {
        var existing = CustomObjectMgr.getCustomObject('PrimeMembershipJobState', 'lock-' + customerNo);
        if (existing) CustomObjectMgr.remove(existing);
    });
}

/**
 * Records a change. Call inside the transaction of the change itself, so the two commit together.
 * @param {string} action - what happened
 * @param {string} actorReference - e.g. customer:123, admin:name, job:reconciliation
 * @param {string} subscriptionID - membership
 * @param {?string} previousState - state before
 * @param {?string} newState - state after
 * @param {?string} correlationID - links the records of one operation
 */
function audit(action, actorReference, subscriptionID, previousState, newState, correlationID) {
    var record = CustomObjectMgr.createCustomObject('PrimeMembershipAudit', createId('PMA'));
    record.custom.action = action;
    record.custom.actorReference = actorReference;
    record.custom.subscriptionID = subscriptionID;
    record.custom.previousState = previousState;
    record.custom.newState = newState;
    record.custom.correlationID = correlationID || null;
    record.custom.timestamp = new Date();
}

/**
 * Queues an e-mail. The dedupe key makes a retried operation queue nothing new, and only the
 * job sends, so a storefront request never waits for mail.
 * @param {string} customerNo - recipient
 * @param {string} type - notification type
 * @param {string} dedupeKey - unique per event
 * @param {Object} [params] - message values
 * @returns {boolean} true when a notification was queued
 */
function notify(customerNo, type, dedupeKey, params) {
    var key = type + ':' + dedupeKey;
    if (CustomObjectMgr.getCustomObject('PrimeMembershipNotification', key)) return false;
    var record = CustomObjectMgr.createCustomObject('PrimeMembershipNotification', key);
    record.custom.customerNo = customerNo;
    record.custom.type = type;
    record.custom.params = JSON.stringify(params || {});
    record.custom.status = 'PENDING';
    record.custom.attempts = 0;
    record.custom.nextAttemptAt = new Date();
    record.custom.createdAt = new Date();
    return true;
}

/**
 * @param {string} type - notification type
 * @param {Object} params - message values
 * @returns {{subject: string, body: string}} localized text
 */
function getNotificationText(type, params) {
    var values = Object.keys(params || {}).map(function (k) { return String(params[k]); });
    return {
        subject: Resource.msg('notification.' + type + '.subject', BUNDLE, null),
        body: Resource.msgf('notification.' + type + '.body', BUNDLE, null, values[0] || '', values[1] || '', values[2] || '')
    };
}

/**
 * Sends queued e-mails with retry and backoff. Marketing types respect the customer's choice;
 * service messages about a paid membership are always sent.
 * @param {number} limit - maximum per run
 * @returns {Object} counts
 */
function deliverNotifications(limit) {
    var log = Logger.getLogger('prime-membership', 'membership-notification');
    var counts = { sent: 0, skipped: 0, failed: 0, retried: 0 };
    var from = getPreference('primeMembershipFromEmail');
    if (!from) {
        log.error('Notification delivery skipped: primeMembershipFromEmail is not configured');
        counts.failed = 1;
        return counts;
    }
    var maxAttempts = getPreference('primeMembershipNotificationMaxAttempts');
    var marketing = ['BIRTHDAY_REWARD', 'MONTHLY_VOUCHER'];
    var due = queryPage('PrimeMembershipNotification', 'custom.status = {0} AND custom.nextAttemptAt <= {1}', 'custom.nextAttemptAt asc', ['PENDING', new Date()], 0, limit).items;
    due.forEach(function (n) {
        var customer = require('dw/customer/CustomerMgr').getCustomerByCustomerNumber(n.custom.customerNo);
        var email = customer && customer.profile ? customer.profile.email : null;
        var subscription = CustomObjectMgr.getCustomObject('PrimeMembershipSubscription', n.custom.customerNo);
        if (marketing.indexOf(n.custom.type) >= 0 && subscription && subscription.custom.marketingEmailsEnabled === false) {
            Transaction.wrap(function () { n.custom.status = 'SKIPPED'; });
            counts.skipped += 1;
            return;
        }
        var text = getNotificationText(n.custom.type, parseJson(n.custom.params, {}));
        var ok = !!email;
        if (email) {
            try {
                require('*/cartridge/scripts/helpers/emailHelpers').sendEmail({ to: email, from: from, subject: text.subject }, 'membership/email/notification', { subject: text.subject, body: text.body });
            } catch (e) {
                ok = false;
                log.warn('Notification {0} failed: {1}', n.custom.notificationID, e.message);
            }
        }
        Transaction.wrap(function () {
            n.custom.attempts = (n.custom.attempts || 0) + 1;
            if (ok) {
                n.custom.status = 'SENT';
                n.custom.sentAt = new Date();
                counts.sent += 1;
            } else if (n.custom.attempts >= maxAttempts || !email) {
                n.custom.status = 'FAILED';
                counts.failed += 1;
            } else {
                var delay = 60000;
                for (var i = 0; i < n.custom.attempts && delay < DAY; i++) delay *= 2;
                n.custom.nextAttemptAt = new Date(Date.now() + Math.min(delay, DAY));
                counts.retried += 1;
            }
        });
    });
    return counts;
}

/**
 * @param {string} jobId - job
 * @returns {Object} saved state
 */
function getJobState(jobId) {
    var record = CustomObjectMgr.getCustomObject('PrimeMembershipJobState', jobId);
    return record ? parseJson(record.custom.state, {}) : {};
}

/**
 * @param {string} jobId - job
 * @param {Object} state - state to save
 */
function saveJobState(jobId, state) {
    Transaction.wrap(function () {
        var record = CustomObjectMgr.getCustomObject('PrimeMembershipJobState', jobId) || CustomObjectMgr.createCustomObject('PrimeMembershipJobState', jobId);
        record.custom.state = JSON.stringify(state);
        record.custom.updatedAt = new Date();
    });
}

/**
 * @param {Object} result - helper result
 * @param {*} body - success body
 * @param {number} [status] - success status
 */
function renderApiResponse(result, body, status) {
    var RESTResponseMgr = require('dw/system/RESTResponseMgr');
    if (!result.error) {
        RESTResponseMgr.createSuccess(body, status || 200).render();
        return;
    }
    var problem = RESTResponseMgr.createError(API_STATUS[result.errorCode] || 400, 'prime-membership-' + result.errorCode, result.errorCode, result.errorMessage);
    if (result.fields) problem.custom.fields = JSON.stringify(result.fields);
    problem.render();
}

module.exports = {
    BUNDLE: BUNDLE,
    DAY: DAY,
    getPreference: getPreference,
    getListPreference: getListPreference,
    errorResult: errorResult,
    abort: abort,
    formatCents: formatCents,
    centsOf: centsOf,
    toCents: toCents,
    addMonths: addMonths,
    toDay: toDay,
    createId: createId,
    queryPage: queryPage,
    queryCount: queryCount,
    parseJson: parseJson,
    acquireLock: acquireLock,
    releaseLock: releaseLock,
    audit: audit,
    notify: notify,
    getNotificationText: getNotificationText,
    deliverNotifications: deliverNotifications,
    getJobState: getJobState,
    saveJobState: saveJobState,
    renderApiResponse: renderApiResponse
};
