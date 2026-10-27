'use strict';

/**
 * Shared wallet helpers: site preferences, result objects, custom object queries, ids and
 * hashes, rate limits, audit trail, notifications, one-time codes, review cases and the
 * Custom API response. Used by the other wallet helpers.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Resource = require('dw/web/Resource');
var Site = require('dw/system/Site');
var Logger = require('dw/system/Logger');

var ADMIN = 'ADMIN';
var CASE_TYPES = ['FAILED_CODES', 'CHARGEBACK', 'CHARGEBACK_SHORTFALL', 'REFUND_ABUSE', 'TOPUP_VELOCITY', 'RECONCILIATION_MISMATCH',
    'HOLD_REVIEW', 'GATEWAY_MISMATCH', 'INTEGRATION_FAILURE', 'SUSPICIOUS_ACTIVITY'];
var CASE_FLOW = {
    OPEN: ['IN_PROGRESS', 'RESOLVED', 'DISMISSED'],
    IN_PROGRESS: ['OPEN', 'RESOLVED', 'DISMISSED'],
    RESOLVED: [],
    DISMISSED: []
};

/**
 * @param {string} id - site preference ID
 * @returns {*} preference value (the metadata default when not set)
 */
function getPreference(id) {
    return Site.getCurrent().getCustomPreferenceValue(id);
}

/**
 * @param {string} id - enum preference ID
 * @returns {?string} selected value
 */
function getEnumPreference(id) {
    var value = getPreference(id);
    return value ? String(value.value !== undefined ? value.value : value) : null;
}

/**
 * @param {string} id - set-of-string preference ID
 * @returns {string[]} values
 */
function getListPreference(id) {
    return Array.prototype.slice.call(getPreference(id) || []).map(String);
}

/**
 * @param {string} errorCode - kebab-case code, also the resource key suffix (error.<code>)
 * @param {Object} [fields] - field name => problem, or safe details such as {limit: 'daily'}
 * @returns {{error: boolean, errorCode: string, errorMessage: string, fields: ?Object}} failed result
 */
function errorResult(errorCode, fields) {
    return {
        error: true,
        errorCode: errorCode,
        errorMessage: Resource.msg('error.' + errorCode, 'wallet', Resource.msg('error.general', 'wallet', null)),
        fields: fields || null
    };
}

/**
 * Error to throw inside Transaction.wrap, so the transaction rolls back.
 * @param {string} errorCode - error code for the caller's result
 * @returns {Error} error carrying the code
 */
function abort(errorCode) {
    var error = new Error(errorCode);
    error.errorCode = errorCode;
    return error;
}

/**
 * @param {Error} e - caught error
 * @returns {Object} error result; unexpected errors are logged and reported as "general"
 */
function toErrorResult(e) {
    if (e && e.errorCode) return errorResult(e.errorCode);
    Logger.getLogger('plugin-wallet', 'wallet-transaction').error('Wallet error: {0}', e && e.message);
    return errorResult('general');
}

/**
 * @returns {boolean} true when the wallet is switched on for this USD site
 */
function isWalletEnabled() {
    return getPreference('walletEnabled') === true && getPreference('walletCurrency') === 'USD' && Site.getCurrent().getDefaultCurrency() === 'USD';
}

/**
 * @returns {boolean} true while the wallet runs on the sandbox gateway
 */
function isSandbox() {
    return getEnumPreference('walletGatewayMode') !== 'EXTERNAL';
}

/**
 * Sandbox money never runs on a production instance, and a real gateway only runs after
 * the regulatory and provider approval flag is set.
 * @returns {boolean} true when top-ups may be started
 */
function canTopUp() {
    if (!isWalletEnabled()) return false;
    if (!isSandbox()) return getPreference('walletLiveMoneyApproved') === true;
    var System = require('dw/system/System');
    return System.getInstanceType() !== System.PRODUCTION_SYSTEM;
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
 * @param {string} prefix - record prefix, e.g. "TOP"
 * @returns {string} unguessable ID, e.g. "TOP-3F9A..."
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
 * @param {string} serviceId - plugin-wallet.hmac or plugin-wallet.webhook
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
    if (!parts.v1 || !(timestamp > 0) || Math.abs(Date.now() / 1000 - timestamp) > getPreference('walletWebhookToleranceSeconds')) return false;
    var expected = hmac('plugin-wallet.webhook', parts.t + '.' + body);
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
        var bucket = CustomObjectMgr.getCustomObject('WalletRateBucket', key);
        if (!bucket) {
            bucket = CustomObjectMgr.createCustomObject('WalletRateBucket', key);
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
 * @param {string} type - OWNER | MEMBER | ADMIN | SYSTEM | PROVIDER
 * @param {string} ref - customer number, BM user, job or provider
 * @returns {{type: string, ref: string}} who acted
 */
function actor(type, ref) {
    return { type: type, ref: String(ref || 'unknown').slice(0, 128) };
}

var SENSITIVE = /(password|secret|token|otp|code|card|bank|account|iban|routing|ssn|email|phone)/i;

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
 * @param {Object} event - {entityType, entityId, walletId, action, actor, from, to, reason, detail}
 */
function logAudit(event) {
    var record = CustomObjectMgr.createCustomObject('WalletAuditEvent', createId('AUD'));
    record.custom.entityType = event.entityType;
    record.custom.entityId = String(event.entityId);
    record.custom.walletId = event.walletId || null;
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
 * @param {string} recipient - customer number, or ADMIN
 * @param {string} type - message type (resource key notification.<type>.*)
 * @param {Object} params - short values, in placeholder order
 */
function notify(recipient, type, params) {
    var channels = recipient === ADMIN ? ['EMAIL'] : getListPreference('walletNotificationChannels');
    if (!channels.length) channels = ['INBOX'];
    channels.forEach(function (channel) {
        var record = CustomObjectMgr.createCustomObject('WalletNotification', createId('WNTF'));
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
        subject: Resource.msg('notification.' + type + '.subject', 'wallet', Resource.msg('notification.default.subject', 'wallet', null)),
        body: Resource.msgf('notification.' + type + '.body', 'wallet', Resource.msg('notification.default.body', 'wallet', null), values[0] || '', values[1] || '', values[2] || '')
    };
}

/**
 * @param {string} customerNo - recipient
 * @param {number} offset - rows to skip
 * @param {number} limit - page size
 * @returns {{items: Object[], total: number, unread: number}} inbox page
 */
function getInbox(customerNo, offset, limit) {
    var query = 'custom.recipient = {0} AND custom.channel = {1}';
    var page = queryPage('WalletNotification', query, 'custom.createdAt desc', [customerNo, 'INBOX'], offset, limit);
    return {
        items: page.items.map(function (n) {
            var text = getNotificationText(n.custom.type, parseJson(n.custom.params, {}));
            return { id: n.custom.notificationId, type: n.custom.type, subject: text.subject, body: text.body, read: n.custom.status === 'READ', createdAt: n.custom.createdAt };
        }),
        total: page.total,
        unread: queryCount('WalletNotification', query + ' AND custom.status = {2}', [customerNo, 'INBOX', 'UNREAD'])
    };
}

/**
 * @param {string} customerNo - signed-in customer
 * @param {string} notificationId - message
 * @returns {Object} result
 */
function markNotificationRead(customerNo, notificationId) {
    var record = CustomObjectMgr.getCustomObject('WalletNotification', String(notificationId));
    // Another customer's message is reported as missing, so IDs cannot be probed.
    if (!record || record.custom.recipient !== customerNo || record.custom.channel !== 'INBOX') return errorResult('not-found');
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
    var log = Logger.getLogger('plugin-wallet', 'wallet-notifications');
    var counts = { sent: 0, failed: 0, retried: 0 };
    var from = getPreference('walletFromEmail');
    if (!from) {
        log.error('Notification delivery skipped: walletFromEmail is not configured');
        return counts;
    }
    var maxAttempts = getPreference('walletNotificationMaxAttempts');
    var due = queryPage('WalletNotification', 'custom.channel = {0} AND custom.status = {1} AND custom.nextAttemptAt <= {2}', 'custom.nextAttemptAt asc', ['EMAIL', 'PENDING', new Date()], 0, limit).items;
    due.forEach(function (n) {
        var addresses = [];
        if (n.custom.recipient === ADMIN) {
            addresses = getListPreference('walletAdminNotificationEmails');
        } else {
            var customer = require('dw/customer/CustomerMgr').getCustomerByCustomerNumber(n.custom.recipient);
            if (customer && customer.profile && customer.profile.email) addresses = [customer.profile.email];
        }
        var text = getNotificationText(n.custom.type, parseJson(n.custom.params, {}));
        var ok = addresses.length > 0;
        addresses.forEach(function (to) {
            try {
                require('*/cartridge/scripts/helpers/emailHelpers').sendEmail({ to: to, from: from, subject: text.subject }, 'wallet/email/notification', { subject: text.subject, body: text.body });
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
 * E-mails a one-time code. Only a keyed hash of salt + code is stored, bound to the purpose,
 * the subject and the session; the code is never logged. Resends are limited.
 * @param {string} purpose - wallet-pay | wallet-unlock | family-accept
 * @param {string} subject - who or what the code is for
 * @param {string} sessionRef - session ID
 * @param {string} email - where to send it
 * @param {string} subjectKey - resource key of the e-mail subject
 * @param {Object} params - extra template values
 * @returns {Object} result
 */
function sendCode(purpose, subject, sessionRef, email, subjectKey, params) {
    var from = getPreference('walletFromEmail');
    if (!from || !email) return errorResult('unavailable');
    var key = purpose + ':' + subject;
    var record = CustomObjectMgr.getCustomObject('WalletOtp', key);
    if (record && record.custom.lastSentAt && Date.now() - record.custom.lastSentAt.getTime() < getPreference('walletOtpResendCooldownSeconds') * 1000) return errorResult('rate-limited');
    if (!checkRateLimit('otp-send', key, getPreference('walletOtpMaxSendsPerHour'), 3600)) return errorResult('rate-limited');
    var SecureRandom = require('dw/crypto/SecureRandom');
    var random = new SecureRandom();
    var code = '';
    for (var i = 0; i < getPreference('walletOtpLength'); i++) code += String(random.nextInt(10));
    var salt = randomHex(16);
    var codeHash = hmac('plugin-wallet.hmac', salt + ':' + code);
    if (!codeHash) return errorResult('unavailable');
    Transaction.wrap(function () {
        var otp = record || CustomObjectMgr.createCustomObject('WalletOtp', key);
        otp.custom.codeHash = codeHash;
        otp.custom.salt = salt;
        otp.custom.sessionHash = sha256(sessionRef);
        otp.custom.expiresAt = new Date(Date.now() + getPreference('walletOtpTtlMinutes') * 60000);
        otp.custom.attempts = 0;
        otp.custom.lastSentAt = new Date();
        otp.custom.consumedAt = null;
    });
    require('*/cartridge/scripts/helpers/emailHelpers').sendEmail({ to: email, from: from, subject: Resource.msg(subjectKey, 'wallet', null) },
        'wallet/email/code', Object.assign({ code: code, minutes: String(getPreference('walletOtpTtlMinutes')) }, params || {}));
    return { error: false };
}

/**
 * @param {string} purpose - purpose used by sendCode
 * @param {string} subject - subject used by sendCode
 * @param {string} code - entered code
 * @param {string} sessionRef - session ID
 * @returns {Object} result; errorCode code-invalid | code-expired | code-locked | code-missing
 */
function checkCode(purpose, subject, code, sessionRef) {
    var record = CustomObjectMgr.getCustomObject('WalletOtp', purpose + ':' + subject);
    if (!record || record.custom.consumedAt) return errorResult('code-missing');
    var maxAttempts = getPreference('walletOtpMaxAttempts');
    var outcome = 'code-invalid';
    Transaction.wrap(function () {
        var o = record.custom;
        if (o.attempts >= maxAttempts) {
            outcome = 'code-locked';
        } else if (o.expiresAt.getTime() < Date.now()) {
            outcome = 'code-expired';
        } else {
            o.attempts += 1;
            var matches = /^\d{6,8}$/.test(String(code || ''))
                && safeEquals(o.codeHash, hmac('plugin-wallet.hmac', o.salt + ':' + code))
                && safeEquals(o.sessionHash, sha256(sessionRef));
            if (matches) {
                o.consumedAt = new Date();
                outcome = 'ok';
            } else if (o.attempts >= maxAttempts) {
                outcome = 'code-locked';
            }
        }
    });
    return outcome === 'ok' ? { error: false } : errorResult(outcome);
}

/**
 * Opens a review case unless an open one with the same dedupe key exists.
 * Call inside a transaction.
 * @param {Object} input - {caseType, walletId, entityId, severity, detail, dedupeKey}
 * @returns {dw.object.CustomObject} case
 */
function openCase(input) {
    if (input.dedupeKey) {
        var existing = queryPage('WalletCase', 'custom.dedupeKey = {0} AND (custom.status = {1} OR custom.status = {2})', null, [input.dedupeKey, 'OPEN', 'IN_PROGRESS'], 0, 1).items[0];
        if (existing) return existing;
    }
    var record = CustomObjectMgr.createCustomObject('WalletCase', createId('WCASE'));
    var c = record.custom;
    c.caseType = input.caseType;
    c.status = 'OPEN';
    c.severity = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].indexOf(input.severity) >= 0 ? input.severity : 'MEDIUM';
    c.walletId = input.walletId || null;
    c.entityId = input.entityId ? String(input.entityId) : null;
    c.dedupeKey = input.dedupeKey || null;
    c.detail = safeDetail(input.detail);
    c.notes = '[]';
    c.createdAt = new Date();
    c.updatedAt = new Date();
    c.revision = 0;
    logAudit({ entityType: 'CASE', entityId: c.caseId, walletId: c.walletId, action: 'OPEN', actor: actor('SYSTEM', input.caseType), to: 'OPEN' });
    return record;
}

/**
 * Business Manager: note, progress, resolve, dismiss or reopen a case.
 * @param {string} caseId - case
 * @param {string} action - note | progress | resolve | dismiss | reopen
 * @param {string} message - note text
 * @param {?number} revision - revision the page showed
 * @param {Object} by - admin actor
 * @returns {Object} result
 */
function updateCase(caseId, action, message, revision, by) {
    var record = CustomObjectMgr.getCustomObject('WalletCase', String(caseId));
    if (!record) return errorResult('not-found');
    var c = record.custom;
    var target = { progress: 'IN_PROGRESS', resolve: 'RESOLVED', dismiss: 'DISMISSED', reopen: 'OPEN' }[action];
    if (!target && action !== 'note') return errorResult('invalid', { action: 'invalid' });
    var text = cleanText(message).slice(0, 2000);
    if (action !== 'progress' && action !== 'reopen' && text.length < 3) return errorResult('invalid', { message: 'required' });
    if (target && !canMove(CASE_FLOW, c.status, target)) return errorResult('not-allowed-now');
    if (revision !== null && revision !== undefined && revision !== (c.revision || 0)) return errorResult('stale');
    var from = c.status;
    Transaction.wrap(function () {
        var notes = parseJson(c.notes, []);
        if (text) notes.push({ at: new Date().toISOString(), by: by.ref, text: text });
        c.notes = JSON.stringify(notes.slice(-50));
        if (target) c.status = target;
        c.updatedAt = new Date();
        c.revision = (c.revision || 0) + 1;
        logAudit({ entityType: 'CASE', entityId: caseId, walletId: c.walletId, action: 'ADMIN_' + action.toUpperCase(), actor: by, from: from, to: target || from });
    });
    return { error: false };
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
 * @param {*} value - dollar amount that may be negative, e.g. "-12.50"
 * @returns {?number} signed integer cents, or null
 */
function toSignedCents(value) {
    var text = String(value === null || value === undefined ? '' : value).trim();
    var negative = text.charAt(0) === '-';
    var cents = toCents(negative ? text.slice(1) : text);
    return cents === null ? null : (negative ? -cents : cents); // eslint-disable-line no-nested-ternary
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

/**
 * @param {number} cents - amount in cents
 * @returns {dw.value.Money} USD money for platform setters
 */
function toMoney(cents) {
    var Money = require('dw/value/Money');
    return new Money(cents / 100, 'USD');
}

var API_STATUS = {
    invalid: 400, 'code-invalid': 400, 'code-expired': 400, 'code-locked': 400, 'code-missing': 400, unauthenticated: 401, forbidden: 403,
    'not-found': 404, conflict: 409, 'not-allowed-now': 409, stale: 409, 'limit-reached': 422, 'insufficient-funds': 422, locked: 423,
    'rate-limited': 429, disabled: 503, unavailable: 503
};

/**
 * Custom API response: the body on success, or an RFC 9457 problem with the error code.
 * @param {Object} result - helper result ({error, errorCode, fields} on failure)
 * @param {Object} body - response body on success
 * @param {number} [status] - success status (200)
 */
function renderApiResponse(result, body, status) {
    var RESTResponseMgr = require('dw/system/RESTResponseMgr');
    if (!result.error) {
        RESTResponseMgr.createSuccess(body, status || 200).render();
        return;
    }
    var problem = RESTResponseMgr.createError(API_STATUS[result.errorCode] || 500, 'wallet-' + result.errorCode, result.errorCode, result.errorMessage);
    if (result.fields) problem.custom.fields = JSON.stringify(result.fields);
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
 * @returns {{offset: number, limit: number}} paging from c_offset / c_limit, at most walletApiMaxPageSize
 */
function getApiPaging() {
    var max = getPreference('walletApiMaxPageSize');
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
    var record = CustomObjectMgr.getCustomObject('WalletJobState', jobId);
    return record ? parseJson(record.custom.state, {}) : {};
}

/**
 * @param {string} jobId - job state key
 * @param {Object} state - state to keep
 */
function saveJobState(jobId, state) {
    Transaction.wrap(function () {
        var record = CustomObjectMgr.getCustomObject('WalletJobState', jobId) || CustomObjectMgr.createCustomObject('WalletJobState', jobId);
        record.custom.state = JSON.stringify(state);
        record.custom.updatedAt = new Date();
    });
}

module.exports = {
    ADMIN: ADMIN,
    CASE_TYPES: CASE_TYPES,
    getPreference: getPreference,
    getEnumPreference: getEnumPreference,
    getListPreference: getListPreference,
    errorResult: errorResult,
    abort: abort,
    toErrorResult: toErrorResult,
    isWalletEnabled: isWalletEnabled,
    isSandbox: isSandbox,
    canTopUp: canTopUp,
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
    sendCode: sendCode,
    checkCode: checkCode,
    openCase: openCase,
    updateCase: updateCase,
    cleanText: cleanText,
    toCents: toCents,
    toSignedCents: toSignedCents,
    formatCents: formatCents,
    centsOf: centsOf,
    toMoney: toMoney,
    renderApiResponse: renderApiResponse,
    getApiQuery: getApiQuery,
    getApiPaging: getApiPaging,
    getApiBody: getApiBody,
    getJobState: getJobState,
    saveJobState: saveJobState
};
