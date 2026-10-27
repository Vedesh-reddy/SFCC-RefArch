'use strict';

/**
 * Shared marketplace helpers: custom object queries, ids and hashes, audit trail,
 * notifications, rate limits and result objects. Used by the other seller helpers.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Resource = require('dw/web/Resource');
var Site = require('dw/system/Site');

var ADMIN = 'ADMIN';

/**
 * @param {string} errorCode - kebab-case code, also the resource key suffix (error.<code>)
 * @param {Object} [fields] - field name => problem, for forms and API callers
 * @returns {{error: boolean, errorCode: string, errorMessage: string, fields: ?Object}} failed result
 */
function errorResult(errorCode, fields) {
    return {
        error: true,
        errorCode: errorCode,
        errorMessage: Resource.msg('error.' + errorCode, 'seller', Resource.msg('error.general', 'seller', null)),
        fields: fields || null
    };
}

/**
 * @returns {boolean} true when the marketplace is switched on for this USD site
 */
function isMarketplaceEnabled() {
    var site = Site.getCurrent();
    return site.getCustomPreferenceValue('sellerMarketplaceEnabled') === true
        && site.getCustomPreferenceValue('sellerCurrency') === 'USD'
        && site.getDefaultCurrency() === 'USD';
}

/**
 * @param {string} text - JSON text from a custom attribute
 * @param {*} fallback - value for empty or unreadable text
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
 * @param {string} type - custom object type
 * @param {string} query - query with {n} placeholders
 * @param {?string} sort - sort expression
 * @param {Array} args - query arguments
 * @param {number} offset - rows to skip
 * @param {number} limit - maximum rows
 * @returns {{items: dw.object.CustomObject[], total: number}} one page
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
 * @param {Array} args - arguments
 * @returns {number} matching records
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
 * @param {number} bytes - random bytes
 * @returns {string} lowercase hex from SecureRandom
 */
function randomHex(bytes) {
    var SecureRandom = require('dw/crypto/SecureRandom');
    var Encoding = require('dw/crypto/Encoding');
    return Encoding.toHex(new SecureRandom().nextBytes(bytes));
}

/**
 * @param {string} prefix - record prefix, e.g. "SUB"
 * @returns {string} unguessable ID, e.g. "SUB-3F9A..."
 */
function createId(prefix) {
    return prefix + '-' + randomHex(12).toUpperCase();
}

/**
 * @param {string} value - text
 * @returns {string} hex SHA-256
 */
function sha256(value) {
    var MessageDigest = require('dw/crypto/MessageDigest');
    var Encoding = require('dw/crypto/Encoding');
    var Bytes = require('dw/util/Bytes');
    return Encoding.toHex(new MessageDigest(MessageDigest.DIGEST_SHA_256).digestBytes(new Bytes(String(value), 'UTF-8')));
}

/**
 * The key is the password of a Service Framework credential, so it is not in code or preferences.
 * @param {string} serviceId - plugin-seller.hmac or plugin-seller.webhook
 * @param {string} value - text
 * @returns {?string} hex HMAC-SHA256, or null when the key is not configured
 */
function hmac(serviceId, value) {
    var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
    var Mac = require('dw/crypto/Mac');
    var Encoding = require('dw/crypto/Encoding');
    var service = LocalServiceRegistry.createService(serviceId, {
        createRequest: function () { return null; },
        parseResponse: function () { return null; }
    });
    var credential = service.getConfiguration().getCredential();
    var key = credential ? credential.getPassword() : null;
    if (!key || key.length < 32) return null;
    return Encoding.toHex(new Mac(Mac.HMAC_SHA_256).digest(String(value), key));
}

/**
 * Compares without stopping at the first difference, so timing reveals nothing.
 * @param {string} a - first value
 * @param {string} b - second value
 * @returns {boolean} true when equal
 */
function safeEquals(a, b) {
    var left = String(a || '');
    var right = String(b || '');
    var same = left.length === right.length;
    for (var i = 0; i < Math.max(left.length, right.length); i++) {
        if (left.charAt(i) !== right.charAt(i)) same = false;
    }
    return same;
}

/**
 * Checks a provider signature header "t=<unix seconds>,v1=<hex>", where
 * v1 = HMAC-SHA256(webhook secret, t + "." + body).
 * @param {string} header - signature header
 * @param {string} body - raw request body
 * @returns {boolean} true when the signature is valid and fresh
 */
function isValidWebhookSignature(header, body) {
    var parts = {};
    String(header || '').split(',').forEach(function (part) {
        var index = part.indexOf('=');
        if (index > 0) parts[part.slice(0, index).trim()] = part.slice(index + 1).trim();
    });
    var timestamp = Number(parts.t);
    var tolerance = Site.getCurrent().getCustomPreferenceValue('sellerWebhookToleranceSeconds');
    if (!parts.v1 || !(timestamp > 0) || Math.abs(Date.now() / 1000 - timestamp) > tolerance) return false;
    var expected = hmac('plugin-seller.webhook', parts.t + '.' + body);
    return !!expected && safeEquals(expected, parts.v1.toLowerCase());
}

/**
 * Fixed-window counter on a unique custom object key (safe under concurrent requests).
 * @param {string} name - limit name, e.g. "otp-send"
 * @param {string} subject - who is limited
 * @param {number} limit - hits per window
 * @param {number} windowSeconds - window length
 * @returns {boolean} true when the hit is allowed
 */
function checkRateLimit(name, subject, limit, windowSeconds) {
    var now = Date.now();
    var windowStart = Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000;
    var key = name + ':' + sha256(subject).slice(0, 24) + ':' + windowStart;
    var allowed = true;
    Transaction.wrap(function () {
        var bucket = CustomObjectMgr.getCustomObject('MarketplaceRateBucket', key);
        if (!bucket) {
            bucket = CustomObjectMgr.createCustomObject('MarketplaceRateBucket', key);
            bucket.custom.count = 0;
            bucket.custom.expiresAt = new Date(windowStart + windowSeconds * 1000);
        }
        if (bucket.custom.count >= limit) {
            allowed = false;
        } else {
            bucket.custom.count += 1;
        }
    });
    return allowed;
}

/**
 * @param {Object} flow - status => statuses it may move to
 * @param {string} from - current status
 * @param {string} to - wanted status
 * @returns {boolean} true when the move is allowed
 */
function canMove(flow, from, to) {
    return !!(flow[from] && flow[from].indexOf(to) >= 0);
}

/**
 * @param {string} type - SELLER | ADMIN | SYSTEM | SHOPPER | PROVIDER
 * @param {string} ref - customer number, BM user, job or provider
 * @returns {{type: string, ref: string}} who acted
 */
function actor(type, ref) {
    return { type: type, ref: String(ref || 'unknown').slice(0, 128) };
}

var SENSITIVE = /(password|secret|token|otp|code|tax|bank|account|iban|routing|ssn|email|phone)/i;

/**
 * @param {Object} detail - extra context
 * @returns {string} JSON without sensitive keys, long values cut
 */
function safeDetail(detail) {
    var safe = {};
    Object.keys(detail || {}).forEach(function (key) {
        var value = detail[key];
        if (SENSITIVE.test(key)) return;
        if (typeof value === 'string' && value.length > 500) value = value.slice(0, 500);
        if (value === null || ['string', 'number', 'boolean'].indexOf(typeof value) >= 0) safe[key] = value;
    });
    return JSON.stringify(safe);
}

/**
 * Append-only audit event. Call inside the transaction of the change it describes.
 * @param {Object} event - {entityType, entityId, sellerId, action, actor, from, to, reason, detail}
 */
function logAudit(event) {
    var record = CustomObjectMgr.createCustomObject('MarketplaceAuditEvent', createId('AUD'));
    record.custom.entityType = event.entityType;
    record.custom.entityId = String(event.entityId);
    record.custom.sellerId = event.sellerId || null;
    record.custom.action = event.action;
    record.custom.actorType = event.actor.type;
    record.custom.actorRef = event.actor.ref;
    record.custom.fromStatus = event.from || null;
    record.custom.toStatus = event.to || null;
    record.custom.reason = event.reason ? String(event.reason).slice(0, 1000) : null;
    record.custom.detail = safeDetail(event.detail);
    record.custom.occurredAt = new Date();
}

/**
 * Queues a notification (inbox and/or e-mail). Call inside the transaction of the change.
 * Records hold no e-mail address: it is looked up when the e-mail is sent.
 * @param {string} recipient - seller ID, or ADMIN
 * @param {string} type - message type (resource key notification.<type>.*)
 * @param {Object} params - short values, in placeholder order
 */
function notify(recipient, type, params) {
    var channels = recipient === ADMIN ? ['EMAIL'] : Array.prototype.slice.call(Site.getCurrent().getCustomPreferenceValue('sellerNotificationChannels') || []);
    if (!channels.length) channels = ['INBOX'];
    channels.forEach(function (channel) {
        var record = CustomObjectMgr.createCustomObject('MarketplaceNotification', createId('NTF'));
        record.custom.recipient = recipient;
        record.custom.type = type;
        record.custom.channel = channel;
        record.custom.params = JSON.stringify(params || {});
        record.custom.status = channel === 'INBOX' ? 'UNREAD' : 'PENDING';
        record.custom.attempts = 0;
        record.custom.nextAttemptAt = channel === 'EMAIL' ? new Date() : null;
        record.custom.createdAt = new Date();
    });
}

/**
 * @param {string} type - notification type
 * @param {Object} params - values
 * @returns {{subject: string, body: string}} localized texts
 */
function getNotificationText(type, params) {
    var values = Object.keys(params || {}).map(function (k) { return String(params[k]); });
    return {
        subject: Resource.msg('notification.' + type + '.subject', 'seller', Resource.msg('notification.default.subject', 'seller', null)),
        body: Resource.msgf('notification.' + type + '.body', 'seller', Resource.msg('notification.default.body', 'seller', null), values[0] || '', values[1] || '', values[2] || '')
    };
}

/**
 * @param {string} sellerId - seller
 * @param {number} offset - rows to skip
 * @param {number} limit - page size
 * @returns {{items: Object[], total: number, unread: number}} the seller's inbox
 */
function getInbox(sellerId, offset, limit) {
    var query = 'custom.recipient = {0} AND custom.channel = {1}';
    var page = queryPage('MarketplaceNotification', query, 'custom.createdAt desc', [sellerId, 'INBOX'], offset, limit);
    return {
        items: page.items.map(function (n) {
            var text = getNotificationText(n.custom.type, parseJson(n.custom.params, {}));
            return { id: n.custom.notificationId, type: n.custom.type, subject: text.subject, body: text.body, read: n.custom.status === 'READ', createdAt: n.custom.createdAt };
        }),
        total: page.total,
        unread: queryCount('MarketplaceNotification', query + ' AND custom.status = {2}', [sellerId, 'INBOX', 'UNREAD'])
    };
}

/**
 * @param {string} sellerId - seller
 * @param {string} notificationId - message
 * @returns {Object} result
 */
function markNotificationRead(sellerId, notificationId) {
    var record = CustomObjectMgr.getCustomObject('MarketplaceNotification', String(notificationId));
    // Another seller's message is reported as missing, so IDs cannot be probed.
    if (!record || record.custom.recipient !== sellerId || record.custom.channel !== 'INBOX') return errorResult('not-found');
    if (record.custom.status !== 'READ') {
        Transaction.wrap(function () {
            record.custom.status = 'READ';
            record.custom.readAt = new Date();
        });
    }
    return { error: false };
}

/**
 * Job helper: sends due e-mail notifications with backoff (2, 4, 8 ... minutes, at most a day).
 * @param {number} limit - maximum notifications
 * @returns {{sent: number, failed: number, retried: number}} counts
 */
function deliverNotifications(limit) {
    var Logger = require('dw/system/Logger');
    var log = Logger.getLogger('plugin-seller', 'seller-notifications');
    var site = Site.getCurrent();
    var counts = { sent: 0, failed: 0, retried: 0 };
    var from = site.getCustomPreferenceValue('sellerFromEmail');
    if (!from) {
        log.error('Notification delivery skipped: sellerFromEmail is not configured');
        return counts;
    }
    var maxAttempts = site.getCustomPreferenceValue('sellerNotificationMaxAttempts');
    var due = queryPage('MarketplaceNotification', 'custom.channel = {0} AND custom.status = {1} AND custom.nextAttemptAt <= {2}', 'custom.nextAttemptAt asc', ['EMAIL', 'PENDING', new Date()], 0, limit).items;
    due.forEach(function (n) {
        var addresses = [];
        if (n.custom.recipient === ADMIN) {
            addresses = Array.prototype.slice.call(site.getCustomPreferenceValue('sellerAdminNotificationEmails') || []);
        } else {
            var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', n.custom.recipient);
            if (seller && seller.custom.contactEmail && seller.custom.status !== 'TERMINATED') addresses = [seller.custom.contactEmail];
        }
        var text = getNotificationText(n.custom.type, parseJson(n.custom.params, {}));
        var ok = addresses.length > 0;
        addresses.forEach(function (to) {
            try {
                require('*/cartridge/scripts/helpers/emailHelpers').sendEmail({ to: to, from: from, subject: text.subject }, 'seller/email/notification', { subject: text.subject, body: text.body });
            } catch (e) {
                ok = false;
                log.warn('Notification {0} e-mail failed: {1}', n.custom.notificationId, e.message);
            }
        });
        Transaction.wrap(function () {
            n.custom.attempts = (n.custom.attempts || 0) + 1;
            if (ok) {
                n.custom.status = 'SENT';
                n.custom.sentAt = new Date();
                counts.sent += 1;
            } else if (n.custom.attempts >= maxAttempts || !addresses.length) {
                n.custom.status = 'FAILED';
                counts.failed += 1;
            } else {
                var delay = 60000;
                for (var i = 0; i < n.custom.attempts && delay < 86400000; i++) delay *= 2;
                n.custom.nextAttemptAt = new Date(Date.now() + Math.min(delay, 86400000));
                counts.retried += 1;
            }
        });
    });
    return counts;
}

/**
 * @param {*} value - untrusted text
 * @returns {string} trimmed text without control characters (tab and newline kept)
 */
function cleanText(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim(); // eslint-disable-line no-control-regex
}

/**
 * @param {*} value - dollar amount from a form or API, e.g. "12.50" or 12.5
 * @returns {?number} integer cents, or null when it is not a plain non-negative amount
 */
function toCents(value) {
    var text = String(value === null || value === undefined ? '' : value).trim();
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) return null;
    return Math.round(Number(text) * 100);
}

/**
 * @param {number} cents - amount in cents
 * @returns {string} formatted USD, e.g. "$1,234.50"
 */
function formatCents(cents) {
    var Money = require('dw/value/Money');
    var StringUtils = require('dw/util/StringUtils');
    return StringUtils.formatMoney(new Money(cents / 100, 'USD'));
}

/**
 * @param {dw.value.Money} money - platform money
 * @returns {number} integer cents (0 for N/A money)
 */
function centsOf(money) {
    return money && money.available ? Math.round(money.value * 100) : 0;
}

var API_STATUS = {
    invalid: 400, incomplete: 400, unauthenticated: 401, forbidden: 403, 'not-found': 404, conflict: 409, 'not-allowed-now': 409, stale: 409,
    'limit-reached': 422, 'code-invalid': 400, 'code-expired': 400, 'code-locked': 400, 'code-missing': 400, 'rate-limited': 429, disabled: 503, unavailable: 503
};

/**
 * Custom API response: the body on success, or an RFC 9457 problem with the error code.
 * @param {Object} result - helper result ({error, errorCode, fields, problems} on failure)
 * @param {Object} body - response body on success
 * @param {number} [status] - success status (200)
 */
function renderApiResponse(result, body, status) {
    var RESTResponseMgr = require('dw/system/RESTResponseMgr');
    if (!result.error) {
        RESTResponseMgr.createSuccess(body, status || 200).render();
        return;
    }
    var problem = RESTResponseMgr.createError(API_STATUS[result.errorCode] || 500, 'marketplace-' + result.errorCode, result.errorCode, result.errorMessage);
    if (result.fields) problem.custom.fields = JSON.stringify(result.fields);
    if (result.problems) problem.custom.problems = result.problems.join(',');
    problem.render();
}

/**
 * @param {string} name - query parameter (c_ prefix)
 * @returns {?string} value
 */
function getApiQuery(name) {
    var value = request.getHttpParameterMap().get(name);
    return value && value.submitted ? value.stringValue : null;
}

/**
 * @returns {{offset: number, limit: number}} paging from c_offset / c_limit, at most sellerApiMaxPageSize
 */
function getApiPaging() {
    var max = Site.getCurrent().getCustomPreferenceValue('sellerApiMaxPageSize');
    var offset = Number(getApiQuery('c_offset') || 0);
    var limit = Number(getApiQuery('c_limit') || max);
    return { offset: offset >= 0 && offset <= 100000 ? Math.floor(offset) : 0, limit: limit >= 1 && limit <= max ? Math.floor(limit) : max };
}

/**
 * @returns {?Object} the JSON request body, or null when it is not a JSON object
 */
function getApiBody() {
    var parsed = parseJson(request.getHttpParameterMap().getRequestBodyAsString(), null);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
}

/**
 * @param {string} jobId - job state key
 * @returns {Object} stored job state
 */
function getJobState(jobId) {
    var record = CustomObjectMgr.getCustomObject('MarketplaceJobState', jobId);
    return record ? parseJson(record.custom.state, {}) : {};
}

/**
 * @param {string} jobId - job state key
 * @param {Object} state - state to keep
 */
function saveJobState(jobId, state) {
    Transaction.wrap(function () {
        var record = CustomObjectMgr.getCustomObject('MarketplaceJobState', jobId) || CustomObjectMgr.createCustomObject('MarketplaceJobState', jobId);
        record.custom.state = JSON.stringify(state);
        record.custom.updatedAt = new Date();
    });
}

module.exports = {
    ADMIN: ADMIN,
    errorResult: errorResult,
    isMarketplaceEnabled: isMarketplaceEnabled,
    parseJson: parseJson,
    queryPage: queryPage,
    queryCount: queryCount,
    randomHex: randomHex,
    createId: createId,
    sha256: sha256,
    hmac: hmac,
    safeEquals: safeEquals,
    isValidWebhookSignature: isValidWebhookSignature,
    checkRateLimit: checkRateLimit,
    canMove: canMove,
    actor: actor,
    logAudit: logAudit,
    notify: notify,
    getNotificationText: getNotificationText,
    getInbox: getInbox,
    markNotificationRead: markNotificationRead,
    deliverNotifications: deliverNotifications,
    cleanText: cleanText,
    toCents: toCents,
    formatCents: formatCents,
    centsOf: centsOf,
    renderApiResponse: renderApiResponse,
    getApiQuery: getApiQuery,
    getApiPaging: getApiPaging,
    getApiBody: getApiBody,
    getJobState: getJobState,
    saveJobState: saveJobState
};
