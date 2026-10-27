'use strict';

/**
 * Job side of the analytics. Only these steps write the daily aggregates, and they hold the
 * writer lock while they do, so there is never more than one writer per record. Event batches
 * are folded into the aggregates and removed in the same transaction (exactly once). Sales come
 * only from orders: each order keeps the snapshot it last contributed, and a changed order
 * (placed, paid, cancelled, refunded) contributes the difference.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');
var analyticsHelpers = require('*/cartridge/scripts/helpers/analyticsHelpers');

var log = Logger.getLogger('plugin-analytics', 'analytics-jobs');
var DAY = 86400000;
var CHUNK = 50;
var LOCK_MINUTES = 60;
var STALE_BATCH_DAYS = 7;
var SITE = 'AnalyticsSiteDaily';
var PRODUCT = 'AnalyticsProductDaily';
var CATEGORY = 'AnalyticsCategoryDaily';
var SEARCH = 'AnalyticsSearchDaily';
var BATCH = 'AnalyticsEventBatch';
var CHECKPOINT = 'AnalyticsJobCheckpoint';
var REFUND_INVOICE_TYPES = ['RETURN', 'RETURN_CASE', 'APPEASEMENT'];

/**
 * @param {string} type - custom object type
 * @param {string} query - query
 * @param {Array} args - query arguments
 * @param {number} limit - most keys returned
 * @param {string} [sort] - sort order
 * @returns {string[]} keys, read before anything is changed or removed
 */
function queryKeys(type, query, args, limit, sort) {
    var keys = [];
    var iterator = CustomObjectMgr.queryCustomObjects.apply(CustomObjectMgr, [type, query, sort || null].concat(args));
    try {
        while (iterator.hasNext() && keys.length < limit) {
            var record = iterator.next();
            keys.push(record.custom[{ AnalyticsEventBatch: 'batchKey', AnalyticsJobCheckpoint: 'jobId' }[type] || 'recordKey']);
        }
    } finally {
        iterator.close();
    }
    return keys;
}

/**
 * @param {string} type - custom object type
 * @param {string} query - query
 * @param {Array} args - query arguments
 * @returns {number} matching records
 */
function queryCount(type, query, args) {
    var iterator = CustomObjectMgr.queryCustomObjects.apply(CustomObjectMgr, [type, query, null].concat(args));
    try {
        return iterator.count;
    } finally {
        iterator.close();
    }
}

/**
 * @param {string} jobId - checkpoint ID
 * @returns {?dw.object.CustomObject} checkpoint
 */
function getCheckpoint(jobId) {
    return CustomObjectMgr.getCustomObject(CHECKPOINT, jobId);
}

/**
 * @param {string} jobId - checkpoint ID
 * @param {Object} fields - attributes to set
 */
function saveCheckpoint(jobId, fields) {
    Transaction.wrap(function () {
        var record = getCheckpoint(jobId) || CustomObjectMgr.createCustomObject(CHECKPOINT, jobId);
        Object.keys(fields).forEach(function (name) { record.custom[name] = fields[name]; });
    });
}

/**
 * Takes the writer lock. Creating a record with a fixed key succeeds for one job only; a
 * lock older than LOCK_MINUTES belongs to a run that died and is taken over.
 * @param {string} owner - job taking the lock
 * @returns {boolean} true when the lock is held
 */
function acquireLock(owner) {
    var existing = getCheckpoint('writer-lock');
    if (existing) {
        if (Date.now() - existing.custom.lastRunAt.getTime() < LOCK_MINUTES * 60000) return false;
        log.warn('Taking over the writer lock of {0}', existing.custom.status);
        Transaction.wrap(function () { CustomObjectMgr.remove(existing); });
    }
    try {
        Transaction.wrap(function () {
            var lock = CustomObjectMgr.createCustomObject(CHECKPOINT, 'writer-lock');
            lock.custom.status = owner;
            lock.custom.lastRunAt = new Date();
        });
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Releases the writer lock.
 */
function releaseLock() {
    var lock = getCheckpoint('writer-lock');
    if (lock) Transaction.wrap(function () { CustomObjectMgr.remove(lock); });
}

/**
 * Resolves product IDs once per run: variants roll up to their master, and every product
 * belongs to exactly one category (its primary or classification category, else the
 * master's), so category totals never count a product twice.
 * @returns {Function} productId => {id, categoryId} or null for unknown products
 */
function createProductResolver() {
    var ProductMgr = require('dw/catalog/ProductMgr');
    var cache = {};
    var size = 0;
    return function (productId) {
        if (Object.prototype.hasOwnProperty.call(cache, productId)) return cache[productId];
        if (size >= 20000) {
            cache = {};
            size = 0;
        }
        var product = analyticsHelpers.PRODUCT_ID.test(productId) ? ProductMgr.getProduct(productId) : null;
        var result = null;
        if (product) {
            var master = product.variant && product.masterProduct ? product.masterProduct : product;
            var category = product.primaryCategory || master.primaryCategory || product.classificationCategory || master.classificationCategory;
            result = { id: master.ID, categoryId: category ? category.ID : null };
        }
        cache[productId] = result;
        size += 1;
        return result;
    };
}

/**
 * @param {Object} deltas - pending changes
 * @param {string} type - aggregate type
 * @param {string} key - record key
 * @param {Object} attrs - identifying attributes set when the record is created
 * @param {string} field - counter
 * @param {number} amount - change
 */
function addDelta(deltas, type, key, attrs, field, amount) {
    var id = type + '|' + key;
    if (!deltas[id]) deltas[id] = { type: type, key: key, attrs: attrs, add: {}, sampleRate: null };
    deltas[id].add[field] = (deltas[id].add[field] || 0) + amount;
}

/**
 * Applies pending changes inside the caller's transaction.
 * @param {Object} deltas - pending changes
 */
function applyDeltas(deltas) {
    var now = new Date();
    Object.keys(deltas).forEach(function (id) {
        var delta = deltas[id];
        var fields = Object.keys(delta.add).filter(function (field) { return delta.add[field] !== 0; });
        if (!fields.length && !delta.sampleRate) return;
        var record = CustomObjectMgr.getCustomObject(delta.type, delta.key);
        if (!record) {
            record = CustomObjectMgr.createCustomObject(delta.type, delta.key);
            Object.keys(delta.attrs).forEach(function (name) { record.custom[name] = delta.attrs[name]; });
        }
        fields.forEach(function (field) { record.custom[field] = (record.custom[field] || 0) + delta.add[field]; });
        if (delta.sampleRate) record.custom.sampleRate = Math.min(record.custom.sampleRate || 100, delta.sampleRate);
        record.custom.updatedAt = now;
    });
}

/**
 * @param {Object} deltas - pending changes
 * @param {string} day - reporting day
 * @returns {Function} (field, amount) for the site record of the day
 */
function siteCounter(deltas, day) {
    return function (field, amount) { addDelta(deltas, SITE, day, { day: day }, field, amount === undefined ? 1 : amount); };
}

/**
 * Adds one stored event to the pending changes.
 * @param {Object} deltas - pending changes
 * @param {string} day - reporting day of the batch
 * @param {Object} event - stored event
 * @param {Function} resolve - product resolver
 * @returns {boolean} false when the event refers to an unknown product or is malformed
 */
function addEvent(deltas, day, event, resolve) {
    var site = siteCounter(deltas, day);
    if (event.s) site('sessions');
    if (event.n === 'begin_checkout' || event.n === 'add_shipping_info' || event.n === 'add_payment_info') {
        var step = { begin_checkout: 'checkout', add_shipping_info: 'shipping', add_payment_info: 'payment' }[event.n];
        site(step === 'checkout' ? 'checkoutStarts' : step + 'Submits');
        if (event.f) site(step + 'Flows');
        return true;
    }
    if (event.n === 'search') {
        var searchKey = day + '_' + String(event.t).replace(/ /g, '_');
        site('searches');
        addDelta(deltas, SEARCH, searchKey, { day: day, term: event.t }, 'searches', 1);
        if (event.r === 0) {
            site('noResultSearches');
            addDelta(deltas, SEARCH, searchKey, { day: day, term: event.t }, 'noResults', 1);
        }
        return true;
    }
    var product = resolve(event.p);
    if (!product) return false;
    var productKey = day + '_' + product.id;
    var count = function (field, amount) {
        addDelta(deltas, PRODUCT, productKey, { day: day, productId: product.id, categoryId: product.categoryId || '' }, field, amount === undefined ? 1 : amount);
        if (product.categoryId && field.indexOf('unique') !== 0) {
            addDelta(deltas, CATEGORY, day + '_' + product.categoryId, { day: day, categoryId: product.categoryId }, field, amount === undefined ? 1 : amount);
        }
    };
    if (event.n === 'view_item_list') {
        count('impressions');
        if (event.f) count('uniqueImpressions');
        site('impressions');
        if (event.k) site('impressionSessions');
    } else if (event.n === 'select_item') {
        count('selections');
        if (event.f) count('uniqueSelections');
        site('selections');
        if (event.k) site('selectionSessions');
        if (event.l === 'search') {
            site('searchSelections');
            if (event.t) addDelta(deltas, SEARCH, day + '_' + String(event.t).replace(/ /g, '_'), { day: day, term: event.t }, 'selections', 1);
        }
    } else if (event.n === 'view_item') {
        count('views');
        if (event.f) count('uniqueViews');
        site('views');
        if (event.k) site('viewSessions');
    } else if (event.n === 'add_to_cart') {
        if (!(event.q >= 1 && event.q <= 10000 && Math.floor(event.q) === event.q)) return false;
        count('cartAdds');
        count('unitsAdded', event.q);
        if (event.f) count('uniqueCartAdds');
        site('cartAdds');
        site('unitsAdded', event.q);
        if (event.k) site('cartSessions');
    } else {
        return false;
    }
    return true;
}

/**
 * Folds one chunk of batches into the aggregates and removes the batches, in one transaction.
 * @param {string[]} keys - batch keys
 * @param {Function} resolve - product resolver
 * @param {Object} counts - run counts, updated
 */
function aggregateChunk(keys, resolve, counts) {
    var deltas = {};
    var batches = [];
    keys.forEach(function (key) {
        var batch = CustomObjectMgr.getCustomObject(BATCH, key);
        if (!batch) return;
        batches.push(batch);
        if (!counts.oldestMinutes) counts.oldestMinutes = Math.round((Date.now() - batch.custom.receivedAt.getTime()) / 60000);
        var day = batch.custom.day;
        var events = analyticsHelpers.parseJson(batch.custom.events, []);
        var rejected = batch.custom.rejected || 0;
        var accepted = 0;
        (Array.isArray(events) ? events : []).forEach(function (event) {
            if (event && addEvent(deltas, day, event, resolve)) accepted += 1;
            else rejected += 1;
        });
        var site = siteCounter(deltas, day);
        site('batches');
        site('eventsAccepted', accepted);
        site('eventsRejected', rejected);
        site('eventsDropped', batch.custom.dropped || 0);
        var siteDelta = deltas[SITE + '|' + day];
        siteDelta.sampleRate = Math.min(siteDelta.sampleRate || 100, batch.custom.sampleRate || 100);
        counts.events += accepted;
        counts.rejected += rejected;
        counts.dropped += batch.custom.dropped || 0;
    });
    Transaction.wrap(function () {
        applyDeltas(deltas);
        batches.forEach(function (batch) { CustomObjectMgr.remove(batch); });
    });
    counts.batches += batches.length;
}

/**
 * Folds event batches into the daily aggregates, oldest first, CHUNK batches per transaction.
 * Afterwards it pauses collection while the backlog is above analyticsMaxBacklog.
 * @param {number} limit - most batches per run
 * @returns {Object} counts
 */
function aggregateEvents(limit) {
    var counts = { batches: 0, events: 0, rejected: 0, dropped: 0, oldestMinutes: 0, backlog: 0 };
    var resolve = createProductResolver();
    var keys = queryKeys(BATCH, 'custom.receivedAt != NULL', [], limit, 'custom.receivedAt asc');
    for (var start = 0; start < keys.length; start += CHUNK) aggregateChunk(keys.slice(start, start + CHUNK), resolve, counts);
    counts.backlog = queryCount(BATCH, 'custom.receivedAt != NULL', []);
    var paused = counts.backlog > analyticsHelpers.getIntPreference('analyticsMaxBacklog', 1000, 10000000, 200000);
    if (paused) log.warn('Collection paused: {0} event batches waiting', counts.backlog);
    saveCheckpoint('aggregate-events', { collectionPaused: paused, backlog: counts.backlog });
    return counts;
}

/**
 * @param {dw.value.Money} money - amount
 * @returns {number} cents
 */
function cents(money) {
    return analyticsHelpers.toCents(money);
}

/**
 * @param {dw.order.Order} order - order
 * @returns {number} refunded cents from return, return case and appeasement invoices
 */
function getRefundCents(order) {
    var total = 0;
    try {
        order.invoices.toArray().forEach(function (invoice) {
            if (REFUND_INVOICE_TYPES.indexOf(String(invoice.type.value || invoice.type)) >= 0) total += cents(invoice.refundedAmount);
        });
    } catch (e) {
        // Sites without the invoice API have no refund data; cancellations still count.
        log.debug('No invoices for order {0}: {1}', order.orderNo, e.message);
    }
    return total;
}

/**
 * What an order contributes to the reports. Only USD orders count. A qualifying order is
 * placed (NEW, OPEN or COMPLETED) and, with analyticsQualifyingOrders = PAID, paid. A
 * cancelled order contributes only to the cancelled count. Product lines are rolled up to the
 * master product; refunds are spread over the lines by their net amount.
 * @param {dw.order.Order} order - order
 * @param {string} mode - PLACED or PAID
 * @param {Function} resolve - product resolver
 * @param {string} day - order day
 * @returns {?Object} snapshot
 */
function buildSnapshot(order, mode, resolve, day) {
    var Order = require('dw/order/Order');
    var status = order.status.value;
    if (order.currencyCode !== 'USD') return null;
    if (status === Order.ORDER_STATUS_CANCELLED) return { v: 1, d: day, s: 'C' };
    if ([Order.ORDER_STATUS_NEW, Order.ORDER_STATUS_OPEN, Order.ORDER_STATUS_COMPLETED].indexOf(status) < 0) return null;
    if (mode === 'PAID' && order.paymentStatus.value !== Order.PAYMENT_STATUS_PAID) return null;

    var byProduct = {};
    var lines = [];
    // Top-level lines only: bundled children are part of their bundle's price.
    order.productLineItems.toArray().forEach(function (pli) {
        var product = pli.product ? resolve(pli.productID) : null;
        var id = product ? product.id : pli.productID;
        if (!byProduct[id]) {
            byProduct[id] = [id, product ? product.categoryId || '' : '', 0, 0, 0, 0, 0];
            lines.push(byProduct[id]);
        }
        var line = byProduct[id];
        var gross = cents(pli.price);
        var net = cents(pli.proratedPrice);
        line[2] += pli.quantityValue;
        line[3] += gross;
        line[4] += gross - net;
        line[5] += net;
    });
    var total = cents(order.totalGrossPrice);
    var refund = Math.min(getRefundCents(order), total);
    var merchandiseNet = lines.reduce(function (sum, line) { return sum + line[5]; }, 0);
    var spread = Math.max(0, Math.min(refund, merchandiseNet));
    var left = spread;
    lines.forEach(function (line, index) {
        var share = spread ? Math.floor(spread * line[5] / merchandiseNet) : 0;
        if (index === lines.length - 1) share = left;
        line[6] = share;
        left -= share;
    });
    return {
        v: 1,
        d: day,
        s: 'Q',
        fd: order.custom.analyticsFlowDay || '',
        l: lines,
        g: lines.reduce(function (sum, line) { return sum + line[3]; }, 0),
        dc: lines.reduce(function (sum, line) { return sum + line[4]; }, 0),
        sh: cents(order.adjustedShippingTotalPrice),
        tx: cents(order.totalTax),
        tot: total,
        rf: refund
    };
}

/**
 * @param {Object} deltas - pending changes
 * @param {?Object} snapshot - order snapshot
 * @param {number} sign - 1 to add, -1 to take back
 */
function addSnapshot(deltas, snapshot, sign) {
    if (!snapshot) return;
    var site = siteCounter(deltas, snapshot.d);
    if (snapshot.s === 'C') {
        site('cancelledOrders', sign);
        return;
    }
    var units = 0;
    var categories = {};
    snapshot.l.forEach(function (line) {
        var productKey = snapshot.d + '_' + line[0];
        var attrs = { day: snapshot.d, productId: line[0], categoryId: line[1] };
        units += line[2];
        addDelta(deltas, PRODUCT, productKey, attrs, 'orders', sign);
        addDelta(deltas, PRODUCT, productKey, attrs, 'unitsSold', sign * line[2]);
        addDelta(deltas, PRODUCT, productKey, attrs, 'grossCents', sign * line[3]);
        addDelta(deltas, PRODUCT, productKey, attrs, 'discountCents', sign * line[4]);
        addDelta(deltas, PRODUCT, productKey, attrs, 'refundCents', sign * line[6]);
        addDelta(deltas, PRODUCT, productKey, attrs, 'netCents', sign * (line[5] - line[6]));
        if (line[1]) {
            var categoryKey = snapshot.d + '_' + line[1];
            var categoryAttrs = { day: snapshot.d, categoryId: line[1] };
            addDelta(deltas, CATEGORY, categoryKey, categoryAttrs, 'unitsSold', sign * line[2]);
            addDelta(deltas, CATEGORY, categoryKey, categoryAttrs, 'netCents', sign * (line[5] - line[6]));
            if (!categories[line[1]]) addDelta(deltas, CATEGORY, categoryKey, categoryAttrs, 'orders', sign);
            categories[line[1]] = true;
        }
    });
    site('orders', sign);
    site('unitsSold', sign * units);
    site('grossCents', sign * snapshot.g);
    site('discountCents', sign * snapshot.dc);
    site('shippingCents', sign * snapshot.sh);
    site('taxCents', sign * snapshot.tx);
    site('totalCents', sign * snapshot.tot);
    site('refundCents', sign * snapshot.rf);
    site('netCents', sign * (snapshot.g - snapshot.dc - snapshot.rf));
    if (snapshot.rf > 0) site('refundedOrders', sign);
    if (snapshot.fd) siteCounter(deltas, snapshot.fd)('completedFlows', sign);
}

/**
 * Brings one order's contribution up to date. Running it twice changes nothing.
 * @param {dw.order.Order} order - order
 * @param {string} mode - PLACED or PAID
 * @param {Function} resolve - product resolver
 * @param {string} earliestDay - orders before the retention window are left alone
 * @returns {string} 'changed', 'unchanged' or 'skipped'
 */
function reconcileOrder(order, mode, resolve, earliestDay) {
    var day = analyticsHelpers.getDay(order.creationDate);
    if (day < earliestDay) return 'skipped';
    var next = buildSnapshot(order, mode, resolve, day);
    var previousText = order.custom.analyticsSnapshot || '';
    var nextText = next ? JSON.stringify(next) : '';
    if (previousText === nextText) return 'unchanged';
    var deltas = {};
    addSnapshot(deltas, analyticsHelpers.parseJson(previousText, null), -1);
    addSnapshot(deltas, next, 1);
    Transaction.wrap(function () {
        applyDeltas(deltas);
        order.custom.analyticsSnapshot = nextText || null;
    });
    return 'changed';
}

/**
 * Reconciles orders changed since the last run, oldest change first, one order per
 * transaction. The cursor keeps whole seconds (queries compare datetimes to the second) and
 * the orders already handled in that second.
 * @param {number} limit - most orders per run
 * @returns {Object} counts
 */
function reconcileOrders(limit) {
    var OrderMgr = require('dw/order/OrderMgr');
    var counts = { orders: 0, changed: 0, unchanged: 0, skipped: 0, failed: 0 };
    var retentionDays = analyticsHelpers.getIntPreference('analyticsRetentionDays', 31, 1100, 400);
    var earliest = new Date(Date.now() - retentionDays * DAY);
    var earliestDay = analyticsHelpers.getDay(earliest);
    var checkpoint = getCheckpoint('reconcile-orders');
    var cursor = checkpoint && checkpoint.custom.cursorDate ? checkpoint.custom.cursorDate : earliest;
    var second = Math.floor(cursor.getTime() / 1000);
    var handled = checkpoint ? analyticsHelpers.parseJson(checkpoint.custom.cursorIds, []) : [];
    var mode = analyticsHelpers.getPreference('analyticsQualifyingOrders') === 'PAID' ? 'PAID' : 'PLACED';
    var resolve = createProductResolver();

    // Order numbers are read first; reconciling changes lastModified, the sort key.
    var orderNos = [];
    var iterator = OrderMgr.searchOrders('lastModified >= {0}', 'lastModified asc', new Date(second * 1000));
    try {
        while (iterator.hasNext() && orderNos.length < limit) {
            var found = iterator.next();
            var foundSecond = Math.floor(found.lastModified.getTime() / 1000);
            if (foundSecond !== second || handled.indexOf(found.orderNo) < 0) {
                if (foundSecond !== second) {
                    second = foundSecond;
                    handled = [];
                }
                handled.push(found.orderNo);
                orderNos.push(found.orderNo);
            }
        }
    } finally {
        iterator.close();
    }
    orderNos.forEach(function (orderNo) {
        counts.orders += 1;
        try {
            counts[reconcileOrder(OrderMgr.getOrder(orderNo), mode, resolve, earliestDay)] += 1;
        } catch (e) {
            counts.failed += 1;
            log.error('Order {0} not reconciled: {1}', orderNo, e.message);
        }
    });
    saveCheckpoint('reconcile-orders', { cursorDate: new Date(second * 1000), cursorIds: JSON.stringify(handled.slice(-500)) });
    return counts;
}

/**
 * Removes aggregates older than analyticsRetentionDays and event batches that waited more
 * than STALE_BATCH_DAYS (the aggregation job was not running), in bounded batches.
 * @param {number} limit - most records removed per run
 * @returns {Object} counts
 */
function cleanup(limit) {
    var retentionDays = analyticsHelpers.getIntPreference('analyticsRetentionDays', 31, 1100, 400);
    var cutoffDay = analyticsHelpers.getDay(new Date(Date.now() - retentionDays * DAY));
    var counts = { removed: 0, staleBatches: 0 };
    var remove = function (type, keys) {
        for (var start = 0; start < keys.length; start += 100) {
            Transaction.wrap(function () { // eslint-disable-line no-loop-func
                keys.slice(start, start + 100).forEach(function (key) {
                    var record = CustomObjectMgr.getCustomObject(type, key);
                    if (record) CustomObjectMgr.remove(record);
                });
            });
        }
        return keys.length;
    };
    var stale = queryKeys(BATCH, 'custom.receivedAt < {0}', [new Date(Date.now() - STALE_BATCH_DAYS * DAY)], limit);
    counts.staleBatches = remove(BATCH, stale);
    if (counts.staleBatches) log.warn('Removed {0} event batches that were never aggregated', counts.staleBatches);
    [SITE, PRODUCT, CATEGORY, SEARCH].forEach(function (type) {
        if (counts.removed + counts.staleBatches < limit) counts.removed += remove(type, queryKeys(type, 'custom.day < {0}', [cutoffDay], limit - counts.removed - counts.staleBatches));
    });
    return counts;
}

/**
 * @param {string} day - yyyyMMdd
 * @returns {Object} {start, end} of the day in the site time zone
 */
function dayBounds(day) {
    var Site = require('dw/system/Site');
    var Calendar = require('dw/util/Calendar');
    var calendar = Site.getCalendar();
    calendar.parseByFormat(day, 'yyyyMMdd');
    var start = calendar.getTime();
    calendar.add(Calendar.DATE, 1);
    return { start: start, end: calendar.getTime() };
}

/**
 * Checks the last days: product totals must add up to the site totals, the site's order count
 * must match the qualifying orders, records must sit under their own key, and the
 * aggregation must be recent.
 * @param {number} days - days to check, ending yesterday
 * @param {number} limit - most records read per day
 * @returns {Object} counts and problems
 */
function checkIntegrity(days, limit) {
    var OrderMgr = require('dw/order/OrderMgr');
    var mode = analyticsHelpers.getPreference('analyticsQualifyingOrders') === 'PAID' ? 'PAID' : 'PLACED';
    var resolve = createProductResolver();
    var result = { days: 0, daysWithoutData: 0, mismatches: 0, problems: [] };
    var fields = ['impressions', 'selections', 'views', 'cartAdds', 'unitsAdded', 'unitsSold', 'grossCents'];
    for (var i = 1; i <= days; i++) {
        var day = analyticsHelpers.getDay(new Date(Date.now() - i * DAY));
        result.days += 1;
        var site = CustomObjectMgr.getCustomObject(SITE, day);
        var sums = {};
        var truncated = false;
        var iterator = CustomObjectMgr.queryCustomObjects(PRODUCT, 'custom.day = {0}', null, day);
        try {
            var read = 0;
            while (iterator.hasNext() && read < limit) {
                var record = iterator.next();
                read += 1;
                if (record.custom.recordKey !== day + '_' + record.custom.productId) result.problems.push(day + ': record ' + record.custom.recordKey + ' does not match its product');
                fields.forEach(function (field) { sums[field] = (sums[field] || 0) + (record.custom[field] || 0); }); // eslint-disable-line no-loop-func
            }
            truncated = iterator.hasNext();
        } finally {
            iterator.close();
        }
        if (truncated) {
            result.problems.push(day + ': more than ' + limit + ' product records, sums not checked');
        } else if (!site) {
            result.daysWithoutData += 1;
            if (Object.keys(sums).some(function (f) { return sums[f]; })) result.problems.push(day + ': product data without a site record'); // eslint-disable-line no-loop-func
        } else {
            fields.forEach(function (field) { // eslint-disable-line no-loop-func
                if ((site.custom[field] || 0) !== (sums[field] || 0)) {
                    result.mismatches += 1;
                    result.problems.push(day + ': ' + field + ' site ' + (site.custom[field] || 0) + ' vs products ' + (sums[field] || 0));
                }
            });
        }
        var bounds = dayBounds(day);
        var qualifying = 0;
        var orders = OrderMgr.searchOrders('creationDate >= {0} AND creationDate < {1}', null, bounds.start, bounds.end);
        try {
            var seen = 0;
            while (orders.hasNext() && seen < limit) {
                var snapshot = buildSnapshot(orders.next(), mode, resolve, day);
                seen += 1;
                if (snapshot && snapshot.s === 'Q') qualifying += 1;
            }
        } finally {
            orders.close();
        }
        if (qualifying !== (site ? site.custom.orders || 0 : 0)) {
            result.mismatches += 1;
            result.problems.push(day + ': ' + qualifying + ' qualifying orders, reports show ' + (site ? site.custom.orders || 0 : 0) + ' (reconciliation pending or orders changed)');
        }
    }
    var aggregate = getCheckpoint('aggregate-events');
    if (!aggregate || !aggregate.custom.lastSuccessAt || Date.now() - aggregate.custom.lastSuccessAt.getTime() > DAY) {
        result.problems.push('event aggregation has not succeeded in the last 24 hours');
    }
    if (aggregate && aggregate.custom.collectionPaused) result.problems.push('collection is paused because of the event backlog');
    return result;
}

module.exports = {
    SITE: SITE,
    PRODUCT: PRODUCT,
    CATEGORY: CATEGORY,
    SEARCH: SEARCH,
    BATCH: BATCH,
    CHECKPOINT: CHECKPOINT,
    queryCount: queryCount,
    getCheckpoint: getCheckpoint,
    saveCheckpoint: saveCheckpoint,
    acquireLock: acquireLock,
    releaseLock: releaseLock,
    createProductResolver: createProductResolver,
    addEvent: addEvent,
    aggregateEvents: aggregateEvents,
    buildSnapshot: buildSnapshot,
    addSnapshot: addSnapshot,
    reconcileOrder: reconcileOrder,
    reconcileOrders: reconcileOrders,
    cleanup: cleanup,
    checkIntegrity: checkIntegrity
};
