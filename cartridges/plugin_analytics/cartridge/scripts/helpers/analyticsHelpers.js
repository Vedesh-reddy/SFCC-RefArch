'use strict';

/**
 * Storefront side of the analytics: site preferences, the small per-session state, validation
 * of browser events and the bounded event batches that the aggregation job reads. Storefront
 * requests only ever create batches (one custom object per request); they never update the
 * daily aggregates, so there is no concurrent write to the same record.
 */

var Site = require('dw/system/Site');
var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var StringUtils = require('dw/util/StringUtils');
var Logger = require('dw/system/Logger');

var log = Logger.getLogger('plugin-analytics', 'analytics-collect');

// Browser events may only describe what the shopper saw or clicked. Cart, checkout and
// purchase figures come from the server and from orders.
var CLIENT_EVENTS = { view_item_list: 'product', select_item: 'product', view_item: 'product', search: 'search' };
var MAX_BODY_LENGTH = 16384;
// Session strings are limited to 2000 characters and the whole session to 10 KB.
var MAX_SEEN = 120;
var PRODUCT_ID = /^[A-Za-z0-9_.-]{1,100}$/;
var LIST_ID = /^[A-Za-z0-9_.:-]{1,64}$/;
var BATCH_ID = /^[a-z0-9]{16,32}$/;
var METHOD_ID = /^[A-Za-z0-9_.-]{1,64}$/;
var BATCH_TYPE = 'AnalyticsEventBatch';
var CHECKPOINT_TYPE = 'AnalyticsJobCheckpoint';

/**
 * @param {string} id - site preference ID
 * @returns {*} value, enum values as their string value
 */
function getPreference(id) {
    var value = Site.getCurrent().getCustomPreferenceValue(id);
    return value && typeof value === 'object' && 'value' in value ? value.value : value;
}

/**
 * @param {string} id - int site preference
 * @param {number} min - smallest allowed value
 * @param {number} max - largest allowed value
 * @param {number} fallback - used when the value is missing or out of range
 * @returns {number} value
 */
function getIntPreference(id, min, max, fallback) {
    var value = getPreference(id);
    return typeof value === 'number' && Math.floor(value) === value && value >= min && value <= max ? value : fallback;
}

/**
 * @param {?string} area - 'product', 'checkout', 'purchase' or 'search'; null for the master switch
 * @returns {boolean} true when analytics runs for the area on this site (USD sites only)
 */
function isEnabled(area) {
    if (getPreference('analyticsEnabled') !== true || Site.getCurrent().getDefaultCurrency() !== 'USD') return false;
    var flags = {
        product: 'analyticsProductTrackingEnabled',
        checkout: 'analyticsCheckoutTrackingEnabled',
        purchase: 'analyticsPurchaseTrackingEnabled',
        search: 'analyticsSearchTrackingEnabled'
    };
    return !area || getPreference(flags[area]) === true;
}

/**
 * @param {Date} [date] - moment, now when omitted
 * @returns {string} reporting day yyyyMMdd in the site time zone
 */
function getDay(date) {
    var calendar = Site.getCalendar();
    if (date) calendar.setTime(date);
    return StringUtils.formatCalendar(calendar, 'yyyyMMdd');
}

/**
 * @param {string} text - JSON
 * @param {*} fallback - returned when text is empty or invalid
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
 * @param {number} bytes - random bytes
 * @returns {string} lowercase hex
 */
function randomHex(bytes) {
    var SecureRandom = require('dw/crypto/SecureRandom');
    return require('dw/crypto/Encoding').toHex(new SecureRandom().nextBytes(bytes));
}

/**
 * @param {string} value - text
 * @returns {string} SHA-256 hex
 */
function sha256(value) {
    var MessageDigest = require('dw/crypto/MessageDigest');
    var Bytes = require('dw/util/Bytes');
    var digest = new MessageDigest(MessageDigest.DIGEST_SHA_256).digestBytes(new Bytes(String(value), 'UTF-8'));
    return require('dw/crypto/Encoding').toHex(digest);
}

/**
 * Short, non-reversible marker for the session's "already seen" list (32-bit FNV-1a).
 * @param {string} text - event name and product
 * @returns {string} base-36 hash
 */
function marker(text) {
    var hash = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i); // eslint-disable-line no-bitwise
        hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0; // eslint-disable-line no-bitwise
    }
    return hash.toString(36);
}

/**
 * The analytics state of the shopper's session: an opaque token (never the session ID or a
 * customer number), the sampling decision, first-in-session markers for the current day, the
 * open checkout flow and a per-minute counter. Privacy data ends with the session's soft
 * timeout, which is the "session" of every unique-session metric.
 * @param {string} day - reporting day
 * @returns {Object} state
 */
function getState(day) {
    var state = parseJson(session.privacy.analyticsState, null) || {};
    if (!state.t) {
        var rate = getIntPreference('analyticsSampleRate', 1, 100, 100);
        var SecureRandom = require('dw/crypto/SecureRandom');
        state = { t: randomHex(12), s: rate === 100 || new SecureRandom().nextInt(100) < rate, x: 0 };
    }
    if (state.d !== day) {
        state.d = day;
        state.f = [];
        state.u = '';
    }
    return state;
}

/**
 * @param {Object} state - analytics session state
 */
function saveState(state) {
    session.privacy.analyticsState = JSON.stringify(state);
}

/**
 * @param {Object} state - analytics session state
 * @param {string} key - event name and product
 * @returns {boolean} true the first time today; false afterwards or when the list is full
 */
function firstForProduct(state, key) {
    var hash = marker(key);
    if (state.f.indexOf(hash) >= 0 || state.f.length >= MAX_SEEN) return false;
    state.f.push(hash);
    return true;
}

/**
 * @param {Object} state - analytics session state
 * @param {string} letter - one letter per event kind
 * @returns {boolean} true the first time today
 */
function firstForSession(state, letter) {
    if (state.u.indexOf(letter) >= 0) return false;
    state.u += letter;
    return true;
}

/**
 * @param {Object} state - analytics session state
 * @returns {boolean} true when the session already sent its batches for this minute
 */
function isRateLimited(state) {
    var minute = Math.floor(Date.now() / 60000);
    if (!state.r || state.r[0] !== minute) state.r = [minute, 0];
    state.r[1] += 1;
    return state.r[1] > getIntPreference('analyticsMaxBatchesPerMinute', 1, 120, 12);
}

/**
 * @returns {boolean} true when the shopper's session may be tracked
 */
function isTrackingAllowed() {
    return getPreference('analyticsRequireConsent') !== true || session.trackingAllowed === true;
}

/**
 * @returns {boolean} true while the aggregation job reports a backlog above analyticsMaxBacklog
 */
function isCollectionPaused() {
    var checkpoint = CustomObjectMgr.getCustomObject(CHECKPOINT_TYPE, 'aggregate-events');
    return !!(checkpoint && checkpoint.custom.collectionPaused);
}

/**
 * Turns one browser event into its stored form, or null when it is not acceptable.
 * Markers for unique-session counts are decided here, never by the browser.
 * @param {Object} raw - event as sent by the browser
 * @param {Object} state - analytics session state
 * @returns {?Object} stored event
 */
function toStoredEvent(raw, state) {
    if (!raw || typeof raw !== 'object' || !Object.prototype.hasOwnProperty.call(CLIENT_EVENTS, raw.n)) return null;
    var area = CLIENT_EVENTS[raw.n];
    if (!isEnabled(area)) return null;
    var event = { n: raw.n };
    if (area === 'search') {
        var term = cleanSearchTerm(raw.t);
        var results = Number(raw.r);
        if (!term || !(results >= 0 && results <= 1000000 && Math.floor(results) === results)) return null;
        event.t = term;
        event.r = results;
        if (firstForSession(state, 'Q')) event.k = 1;
        return event;
    }
    if (typeof raw.p !== 'string' || !PRODUCT_ID.test(raw.p)) return null;
    event.p = raw.p;
    if (raw.n !== 'view_item') {
        if (typeof raw.l !== 'string' || !LIST_ID.test(raw.l)) return null;
        var position = Number(raw.o);
        if (!(position >= 1 && position <= 10000 && Math.floor(position) === position)) return null;
        event.l = raw.l;
        event.o = position;
        if (raw.l === 'search' && isEnabled('search')) {
            var searched = cleanSearchTerm(raw.t);
            if (searched) event.t = searched;
        }
    }
    var letter = { view_item_list: 'I', select_item: 'S', view_item: 'V' }[raw.n];
    if (firstForProduct(state, letter + raw.p)) event.f = 1;
    if (firstForSession(state, letter)) event.k = 1;
    return event;
}

/**
 * Normalizes a search term and refuses terms that look like personal data.
 * @param {*} value - raw term
 * @returns {?string} lowercase term of at most 50 characters
 */
function cleanSearchTerm(value) {
    if (typeof value !== 'string') return null;
    var term = value.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!term || term.length > 50 || /@/.test(term) || /\d{5,}/.test(term.replace(/[\s.()-]/g, ''))) return null;
    return /^[a-z0-9 '&.-]+$/.test(term) ? term : null;
}

/**
 * Stores the events of one request as one batch. A batch ID that already exists is a replay
 * or a transport retry and is ignored.
 * @param {string} batchId - batch ID
 * @param {string} source - CLIENT or SERVER
 * @param {Object} state - analytics session state (the dropped counter is reported and reset)
 * @param {Array} events - stored events
 * @param {number} rejected - events refused in this request
 * @returns {string} 'stored' or 'duplicate'
 */
function writeBatch(batchId, source, state, events, rejected) {
    var key = state.d + '_' + batchId;
    if (CustomObjectMgr.getCustomObject(BATCH_TYPE, key)) return 'duplicate';
    Transaction.wrap(function () {
        var batch = CustomObjectMgr.createCustomObject(BATCH_TYPE, key);
        batch.custom.day = state.d;
        batch.custom.receivedAt = new Date();
        batch.custom.source = source;
        batch.custom.sessionToken = state.t;
        batch.custom.sampleRate = getIntPreference('analyticsSampleRate', 1, 100, 100);
        batch.custom.rejected = rejected;
        batch.custom.dropped = state.x || 0;
        batch.custom.events = JSON.stringify(events);
    });
    state.x = 0;
    return 'stored';
}

/**
 * Accepts one beacon from the storefront script: {b: batch ID, e: events}.
 * @param {string} body - request body
 * @returns {Object} {status, accepted, rejected}
 */
function collect(body) {
    if (!isEnabled(null) || !isTrackingAllowed()) return { status: 'disabled', accepted: 0, rejected: 0 };
    if (!body || body.length > MAX_BODY_LENGTH) return { status: 'invalid', accepted: 0, rejected: 0 };
    var payload = parseJson(body, null);
    if (!payload || typeof payload.b !== 'string' || !BATCH_ID.test(payload.b) || !Array.isArray(payload.e)) return { status: 'invalid', accepted: 0, rejected: 0 };

    var state = getState(getDay());
    var maxEvents = getIntPreference('analyticsBatchSize', 1, 50, 20);
    var result;
    if (!state.s) {
        result = { status: 'not-sampled', accepted: 0, rejected: 0 };
    } else if (isRateLimited(state) || isCollectionPaused()) {
        state.x = (state.x || 0) + Math.min(payload.e.length, maxEvents);
        result = { status: 'dropped', accepted: 0, rejected: 0 };
    } else {
        var events = [];
        var rejected = Math.max(0, payload.e.length - maxEvents);
        payload.e.slice(0, maxEvents).forEach(function (raw) {
            var event = toStoredEvent(raw, state);
            if (event) events.push(event);
            else rejected += 1;
        });
        if (firstForSession(state, 'X') && events.length) events[0].s = 1;
        var status = events.length || rejected ? writeBatch(payload.b, 'CLIENT', state, events, rejected) : 'empty';
        result = { status: status, accepted: status === 'stored' ? events.length : 0, rejected: rejected };
    }
    saveState(state);
    return result;
}

/**
 * Records the server-side events of one request (cart and checkout steps) as one batch.
 * @param {Object[]} items - {event, letter: first-in-session marker of the event kind, key: product or flow marker}
 */
function recordServerEvents(items) {
    var state = getState(getDay());
    if (!state.s || !items.length) return;
    if (isRateLimited(state)) {
        state.x = (state.x || 0) + items.length;
        saveState(state);
        return;
    }
    var events = items.map(function (item) {
        if (item.key && firstForProduct(state, item.key)) item.event.f = 1;
        if (firstForSession(state, item.letter)) item.event.k = 1;
        return item.event;
    });
    if (firstForSession(state, 'X')) events[0].s = 1;
    writeBatch(randomHex(12), 'SERVER', state, events, 0);
    saveState(state);
}

/**
 * Runs analytics work for a storefront request. Analytics must never change or break the
 * shopper's request, so every failure is logged and swallowed.
 * @param {string} area - preference area
 * @param {Function} fn - work
 */
function recordSafely(area, fn) {
    try {
        if (isEnabled(area) && isTrackingAllowed()) fn();
    } catch (e) {
        log.error('Analytics event not recorded: {0}', e.message);
    }
}

/**
 * @param {dw.value.Money} money - amount
 * @returns {number} integer cents (0 when not available)
 */
function toCents(money) {
    return money && money.available ? Math.round(money.value * 100) : 0;
}

/**
 * @param {dw.order.Basket} basket - basket
 * @returns {string} checkout flow ID: a hash of the basket, stable while the basket lives
 */
function getFlowId(basket) {
    return sha256(basket.UUID).slice(0, 16);
}

/**
 * Successful Cart-AddProduct: one event per product added, with the server price.
 * @param {dw.order.Basket} basket - current basket
 * @param {Object} form - Cart-AddProduct form (pid and quantity, or pidsObj for product sets)
 * @param {string} pliUUID - line item the base route added
 */
function addToCart(basket, form, pliUUID) {
    recordSafely('product', function () {
        var added = form.pidsObj
            ? JSON.parse(form.pidsObj).map(function (item) { return { pid: String(item.pid), quantity: parseInt(item.qty, 10), uuid: null }; })
            : [{ pid: String(form.pid), quantity: parseInt(form.quantity, 10), uuid: pliUUID }];
        var items = [];
        added.forEach(function (item) {
            if (!PRODUCT_ID.test(item.pid) || !(item.quantity > 0)) return;
            var unitCents = 0;
            var lines = basket.allProductLineItems.toArray();
            for (var i = 0; i < lines.length; i++) {
                if (lines[i].UUID === item.uuid || (!item.uuid && lines[i].productID === item.pid)) {
                    unitCents = toCents(lines[i].basePrice);
                    break;
                }
            }
            items.push({ event: { n: 'add_to_cart', p: item.pid, q: item.quantity, u: unitCents }, letter: 'A', key: 'A' + item.pid });
        });
        recordServerEvents(items);
    });
}

/**
 * Checkout-Begin: one checkout attempt per basket and session, so reloads and returning to
 * the checkout page do not count again.
 * @param {dw.order.Basket} basket - current basket
 * @param {boolean} registered - shopper is signed in
 */
function beginCheckout(basket, registered) {
    recordSafely('checkout', function () {
        if (!basket || basket.productLineItems.length === 0) return;
        var flowId = getFlowId(basket);
        var state = getState(getDay());
        if (state.c === flowId) return;
        state.c = flowId;
        state.cd = state.d;
        saveState(state);
        var quantity = 0;
        basket.productLineItems.toArray().forEach(function (line) { quantity += line.quantityValue; });
        recordServerEvents([{
            event: { n: 'begin_checkout', w: flowId, i: basket.productLineItems.length, q: quantity, a: toCents(basket.totalGrossPrice), g: registered ? 1 : 0 },
            letter: 'B',
            key: 'B' + flowId
        }]);
    });
}

/**
 * The server accepted the shipping step. Only the method and country are kept.
 * @param {dw.order.Basket} basket - current basket
 */
function shippingAccepted(basket) {
    recordSafely('checkout', function () {
        if (!basket) return;
        var shipment = basket.defaultShipment;
        var method = shipment && shipment.shippingMethodID;
        var country = shipment && shipment.shippingAddress && shipment.shippingAddress.countryCode ? String(shipment.shippingAddress.countryCode.value || shipment.shippingAddress.countryCode) : '';
        var flowId = getFlowId(basket);
        recordServerEvents([{
            event: { n: 'add_shipping_info', w: flowId, m: method && METHOD_ID.test(method) ? method : 'unknown', y: /^[A-Z]{2}$/.test(country) ? country : '', h: basket.shipments.length },
            letter: 'H',
            key: 'H' + flowId
        }]);
    });
}

/**
 * The server accepted the payment step. Only the payment method ID is kept, never card,
 * token or billing data.
 * @param {dw.order.Basket} basket - current basket
 */
function paymentAccepted(basket) {
    recordSafely('checkout', function () {
        if (!basket) return;
        var methods = basket.paymentInstruments.toArray().map(function (pi) { return pi.paymentMethod; }).filter(function (m) { return METHOD_ID.test(m); });
        var flowId = getFlowId(basket);
        recordServerEvents([{
            event: { n: 'add_payment_info', w: flowId, m: methods.length ? methods.sort().join('+').slice(0, 64) : 'unknown', a: toCents(basket.totalGrossPrice) },
            letter: 'P',
            key: 'P' + flowId
        }]);
    });
}

/**
 * After a successful PlaceOrder, ties the order to the checkout attempt so the funnel can
 * count completed attempts. The purchase itself is read from the order by the job.
 * @param {dw.order.Order} order - placed order
 */
function linkOrder(order) {
    recordSafely('purchase', function () {
        var state = getState(getDay());
        if (!state.c || !state.s) return;
        Transaction.wrap(function () {
            order.custom.analyticsFlowId = state.c;
            order.custom.analyticsFlowDay = state.cd;
            order.custom.analyticsSessionToken = state.t;
        });
        state.c = null;
        state.cd = null;
        saveState(state);
    });
}

module.exports = {
    CLIENT_EVENTS: CLIENT_EVENTS,
    MAX_SEEN: MAX_SEEN,
    PRODUCT_ID: PRODUCT_ID,
    getPreference: getPreference,
    getIntPreference: getIntPreference,
    isEnabled: isEnabled,
    getDay: getDay,
    parseJson: parseJson,
    randomHex: randomHex,
    sha256: sha256,
    toCents: toCents,
    cleanSearchTerm: cleanSearchTerm,
    collect: collect,
    addToCart: addToCart,
    beginCheckout: beginCheckout,
    shippingAccepted: shippingAccepted,
    paymentAccepted: paymentAccepted,
    linkOrder: linkOrder
};
