'use strict';

/**
 * Entries. Purchase entries come only from the order record (status, payment status and
 * prorated line prices), read by a job: never from a browser event. The entry key is a keyed
 * hash of campaign and source, so an order or a free-entry slot creates one entry at most,
 * even when jobs overlap. Customers are referenced by customer number only.
 *
 * Statuses: PENDING (waiting for the hold period) -> ACTIVE -> SELECTED -> WINNER, or
 * NOT_SELECTED, INELIGIBLE, CANCELLED.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');
var luckyDrawHelpers = require('*/cartridge/scripts/helpers/luckyDrawHelpers');
var campaignHelpers = require('*/cartridge/scripts/helpers/luckyDrawCampaignHelpers');

var log = Logger.getLogger('plugin-luckydraw', 'luckydraw-entry');

var US_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX',
    'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
var OPEN = ['PENDING', 'ACTIVE'];
var ENTRY_FLOW = {
    PENDING: ['ACTIVE', 'INELIGIBLE', 'CANCELLED'],
    ACTIVE: ['SELECTED', 'NOT_SELECTED', 'INELIGIBLE', 'CANCELLED'],
    // An unused alternate of a campaign-wide pool goes back into the pool.
    SELECTED: ['WINNER', 'NOT_SELECTED', 'INELIGIBLE', 'ACTIVE'],
    WINNER: ['INELIGIBLE'],
    NOT_SELECTED: [],
    INELIGIBLE: [],
    CANCELLED: []
};

/**
 * @param {string} campaignId - campaign
 * @param {string} source - e.g. "ORDER:00012345" or "FREE:<customerNo>:<day>:<slot>"
 * @returns {string} entry key; keyed, so published snapshots do not reveal order numbers
 */
function getEntryId(campaignId, source) {
    var hash = luckyDrawHelpers.hmac('entry|' + campaignId + '|' + source);
    if (!hash) throw luckyDrawHelpers.abort('unavailable');
    return 'LDE-' + hash.slice(0, 24).toUpperCase();
}

/**
 * @param {string} campaignId - campaign
 * @param {string} customerNo - customer
 * @returns {string} pseudonymous participant token used in published snapshots
 */
function getParticipantToken(campaignId, customerNo) {
    var hash = luckyDrawHelpers.hmac('participant|' + campaignId + '|' + customerNo);
    if (!hash) throw luckyDrawHelpers.abort('unavailable');
    return hash.slice(0, 16);
}

/**
 * @param {string} campaignId - campaign
 * @param {string} customerNo - customer
 * @returns {?dw.object.CustomObject} participant record
 */
function getParticipant(campaignId, customerNo) {
    return CustomObjectMgr.getCustomObject('LuckyDrawParticipant', campaignId + ':' + customerNo);
}

/**
 * Inside a transaction.
 * @param {string} campaignId - campaign
 * @param {string} customerNo - customer
 * @returns {dw.object.CustomObject} participant record, created when missing
 */
function ensureParticipant(campaignId, customerNo) {
    var p = getParticipant(campaignId, customerNo);
    if (p) return p;
    p = CustomObjectMgr.createCustomObject('LuckyDrawParticipant', campaignId + ':' + customerNo);
    p.custom.campaignId = campaignId;
    p.custom.customerNo = customerNo;
    p.custom.token = getParticipantToken(campaignId, customerNo);
    p.custom.entryCount = 0;
    p.custom.freeEntryCount = 0;
    p.custom.wins = 0;
    p.custom.optedOut = false;
    p.custom.createdAt = new Date();
    return p;
}

/**
 * @param {string} productId - product
 * @returns {{ids: string[], categories: string[]}} product and master IDs, and categories with ancestors
 */
function getProductFacts(productId) {
    var product = require('dw/catalog/ProductMgr').getProduct(productId);
    if (!product) return { ids: [productId], categories: [] };
    var owner = product.isVariant() ? product.masterProduct : product;
    var categories = [];
    owner.categories.toArray().forEach(function (category) {
        var current = category;
        while (current && categories.indexOf(current.ID) < 0) {
            categories.push(current.ID);
            current = current.root ? null : current.parent;
        }
    });
    return { ids: [productId, owner.ID], categories: categories };
}

/**
 * Optional loyalty or referral bonus from an integration cartridge; only used when the
 * campaign enables it, and only where legal approved it.
 * @param {Object} r - campaign rules
 * @param {dw.order.Order} order - order
 * @returns {number} extra entries (0-100)
 */
function getExternalBonus(r, order) {
    var HookMgr = require('dw/system/HookMgr');
    if (!r.externalBonusEnabled || !HookMgr.hasHook('app.plugin.luckydraw.bonus')) return 0;
    try {
        var value = HookMgr.callHook('app.plugin.luckydraw.bonus', 'bonusEntries', { campaignId: r.campaignId, orderNo: order.orderNo, customerNo: order.customerNo });
        return typeof value === 'number' && Math.floor(value) === value && value >= 0 && value <= 100 ? value : 0;
    } catch (e) {
        log.warn('Bonus hook failed for campaign {0}: {1}', r.campaignId, e.message);
        return 0;
    }
}

/**
 * @param {Object} r - campaign rules
 * @param {dw.order.Order} order - order
 * @returns {{eligible: boolean, reason: ?string, entryCount: number, eligibleCents: number, region: ?string}} result
 */
function evaluateOrder(r, order) {
    var Order = require('dw/order/Order');
    var no = function (reason) { return { eligible: false, reason: reason, entryCount: 0, eligibleCents: 0, region: null }; };
    if (!order.customerNo) return no('guest');
    if (order.currencyCode !== 'USD') return no('currency');
    if ([Order.ORDER_STATUS_NEW, Order.ORDER_STATUS_OPEN, Order.ORDER_STATUS_COMPLETED].indexOf(order.status.value) < 0) return no('order-status');
    if (order.paymentStatus.value !== Order.PAYMENT_STATUS_PAID) return no('not-paid');
    if (!campaignHelpers.isAcceptingAt(r, order.creationDate.getTime())) return no('outside-campaign');
    var address = order.billingAddress;
    var country = address && address.countryCode ? String(address.countryCode.value || address.countryCode).toUpperCase() : '';
    if (r.eligibleCountries.indexOf(country) < 0 || luckyDrawHelpers.getAllowedCountries().indexOf(country) < 0) return no('country');
    var region = address.stateCode ? String(address.stateCode).toUpperCase() : '';
    if (US_STATES.indexOf(region) < 0 || r.excludedRegions.indexOf(region) >= 0) return no('region');
    if (r.customerGroupIds.length) {
        var customer = require('dw/customer/CustomerMgr').getCustomerByCustomerNumber(order.customerNo);
        if (!customer || !customer.isMemberOfAnyCustomerGroup.apply(customer, r.customerGroupIds)) return no('customer-group');
    }
    var eligibleCents = 0;
    var bonus = false;
    var needCategories = r.eligibleCategoryIds.length > 0 || r.bonusCategoryIds.length > 0;
    order.productLineItems.toArray().forEach(function (pli) {
        if (pli.bonusProductLineItem) return;
        var facts = needCategories || r.excludedProductIds.length ? getProductFacts(pli.productID) : { ids: [pli.productID], categories: [] };
        if (facts.ids.some(function (id) { return r.excludedProductIds.indexOf(id) >= 0; })) return;
        var inCategory = function (ids) { return facts.categories.some(function (c) { return ids.indexOf(c) >= 0; }); };
        if (r.eligibleCategoryIds.length && !inCategory(r.eligibleCategoryIds)) return;
        eligibleCents += luckyDrawHelpers.centsOf(pli.proratedPrice);
        if (r.bonusCategoryIds.length && inCategory(r.bonusCategoryIds)) bonus = true;
    });
    if (eligibleCents <= 0 || eligibleCents < r.minOrderCents) return no('amount');
    var count = r.entryMethod === 'PER_INCREMENT' ? Math.floor(eligibleCents / r.incrementCents) : 1;
    if (count < 1) return no('amount');
    if (bonus) count += r.bonusEntries;
    count += getExternalBonus(r, order);
    return { eligible: true, reason: null, entryCount: Math.min(count, r.maxEntriesPerOrder), eligibleCents: eligibleCents, region: region };
}

/**
 * @param {Object} r - campaign rules
 * @param {Object} w - window
 * @returns {boolean} true once the draw of that window has frozen its entries
 */
function isWindowFrozen(r, w) {
    var execution = CustomObjectMgr.getCustomObject('LuckyDrawExecution', r.campaignId + '_' + w.key);
    return !!(execution && execution.custom.status !== 'SCHEDULED');
}

/**
 * The window an entry belongs to. Entries that arrive after their window was frozen roll
 * into the current window, so a late job never changes a finished draw.
 * @param {Object} r - campaign rules
 * @param {number} atMs - entry time
 * @param {number} nowMs - current time
 * @returns {?Object} window, or null when no open window remains
 */
function getOpenWindow(r, atMs, nowMs) {
    var w = campaignHelpers.getWindowAt(r, atMs);
    if (w && !isWindowFrozen(r, w)) return w;
    var current = campaignHelpers.getWindowAt(r, nowMs);
    return current && !isWindowFrozen(r, current) ? current : null;
}

/**
 * Inside a transaction: writes the entry and updates the participant.
 * @param {Object} r - campaign rules
 * @param {Object} input - {id, customerNo, sourceType, sourceRef, count, windowKey, at, holdUntil, region, termsVersion, status, reason, actor}
 * @returns {dw.object.CustomObject} entry
 */
function writeEntry(r, input) {
    var p = ensureParticipant(r.campaignId, input.customerNo);
    var now = Date.now();
    var flagged = input.status !== 'INELIGIBLE' && luckyDrawHelpers.queryCount('LuckyDrawEntry', 'custom.campaignId = {0} AND custom.customerNo = {1} AND custom.createdAt >= {2}',
        [r.campaignId, input.customerNo, new Date(now - 86400000)]) >= luckyDrawHelpers.getPreference('luckyDrawVelocityMaxEntriesPerDay');
    var entry = CustomObjectMgr.createCustomObject('LuckyDrawEntry', input.id);
    var c = entry.custom;
    c.campaignId = r.campaignId;
    c.sourceType = input.sourceType;
    c.sourceRef = input.sourceRef;
    c.customerNo = input.customerNo;
    c.participantToken = p.custom.token;
    c.status = input.status;
    c.entryCount = input.count;
    c.windowKey = input.windowKey;
    c.entryAt = new Date(input.at);
    c.holdUntil = new Date(input.holdUntil);
    c.region = input.region;
    c.termsVersion = input.termsVersion || r.termsVersion;
    c.flagged = flagged;
    c.reason = input.reason || null;
    c.createdAt = new Date(now);
    c.updatedAt = new Date(now);
    if (input.status !== 'INELIGIBLE') {
        p.custom.entryCount += input.count;
        p.custom.lastEntryAt = new Date(now);
        if (input.sourceType === 'FREE') p.custom.freeEntryCount += 1;
    }
    luckyDrawHelpers.logAudit({ entityType: 'ENTRY', entityId: input.id, campaignId: r.campaignId, action: 'CREATE', actor: input.actor, to: input.status, detail: { sourceType: input.sourceType, entryCount: input.count, windowKey: input.windowKey } });
    if (flagged) luckyDrawHelpers.openCase({ caseType: 'SUSPICIOUS_VELOCITY', campaignId: r.campaignId, entityId: input.customerNo, severity: 'MEDIUM', dedupeKey: 'velocity:' + r.campaignId + ':' + input.customerNo });
    if (input.status !== 'INELIGIBLE' && r.notifyEntries) luckyDrawHelpers.notify(input.customerNo, 'ENTRY_CREATED', { campaign: r.name, entries: String(input.count) });
    return entry;
}

/**
 * @param {Object} r - campaign rules
 * @param {dw.order.Order} order - order
 * @param {number} nowMs - current time
 * @returns {string} created | duplicate | a reason the order does not qualify
 */
function createEntryFromOrder(r, order, nowMs) {
    var id = getEntryId(r.campaignId, 'ORDER:' + order.orderNo);
    if (CustomObjectMgr.getCustomObject('LuckyDrawEntry', id)) return 'duplicate';
    var result = evaluateOrder(r, order);
    if (!result.eligible) return result.reason;
    var p = getParticipant(r.campaignId, order.customerNo);
    if (p && p.custom.optedOut) return 'opted-out';
    var created = order.creationDate.getTime();
    var w = getOpenWindow(r, created, nowMs);
    var count = Math.max(0, Math.min(result.entryCount, r.maxEntriesPerCustomer - (p ? p.custom.entryCount : 0)));
    var reason = null;
    if (count <= 0) reason = 'customer-limit';
    else if (!w) reason = 'late';
    Transaction.wrap(function () {
        writeEntry(r, {
            id: id,
            customerNo: order.customerNo,
            sourceType: 'ORDER',
            sourceRef: order.orderNo,
            count: count,
            windowKey: w ? w.key : null,
            at: created,
            holdUntil: created + r.holdHours * 3600000,
            region: result.region,
            status: reason ? 'INELIGIBLE' : 'PENDING',
            reason: reason,
            actor: luckyDrawHelpers.actor('SYSTEM', 'entries-job')
        });
    });
    return reason || 'created';
}

/**
 * Job helper: turns paid orders of the lookback period into entries for every running
 * campaign. The cursor walks the period and restarts at its beginning when it reaches the
 * end, so orders paid late are still picked up while they are in the period.
 * @param {number} limit - maximum orders per run
 * @returns {Object} counts
 */
function processOrders(limit) {
    var Order = require('dw/order/Order');
    var OrderMgr = require('dw/order/OrderMgr');
    var counts = { orders: 0, created: 0, duplicate: 0, skipped: 0, failed: 0, reasons: {} };
    var running = luckyDrawHelpers.queryPage('LuckyDrawCampaign', 'custom.status = {0} OR custom.status = {1}', null, ['ACTIVE', 'PAUSED'], 0, 100).items.map(campaignHelpers.getCampaignRules);
    if (!running.length) return counts;
    var now = Date.now();
    var cursor = luckyDrawHelpers.getJobState('entries').cursor;
    var floor = now - luckyDrawHelpers.getPreference('luckyDrawEntryLookbackHours') * 3600000;
    var from = Math.max(cursor ? Date.parse(cursor) : floor, floor);
    var last = null;
    var orders = OrderMgr.searchOrders('creationDate >= {0} AND paymentStatus = {1}', 'creationDate asc', new Date(from), Order.PAYMENT_STATUS_PAID);
    try {
        while (orders.hasNext() && counts.orders < limit) {
            var order = orders.next();
            counts.orders += 1;
            last = order.creationDate;
            running.forEach(function (r) { // eslint-disable-line no-loop-func
                try {
                    var outcome = createEntryFromOrder(r, order, now);
                    if (outcome === 'created') counts.created += 1;
                    else if (outcome === 'duplicate') counts.duplicate += 1;
                    else {
                        // per-reason counts in the job status explain skipped orders (region, outside-campaign, not-paid...)
                        counts.skipped += 1;
                        counts.reasons[outcome] = (counts.reasons[outcome] || 0) + 1;
                    }
                } catch (e) {
                    counts.failed += 1;
                    log.error('Entry for order {0} in campaign {1} failed: {2}', order.orderNo, r.campaignId, e.errorCode || e.message);
                }
            });
        }
    } finally {
        orders.close();
    }
    luckyDrawHelpers.saveJobState('entries', { cursor: counts.orders >= limit && last ? last.toISOString() : null });
    return counts;
}

/**
 * Re-checks an entry against its source and campaign.
 * @param {dw.object.CustomObject} entry - entry
 * @param {Object} r - campaign rules
 * @returns {?string} reason the entry no longer counts, or null when it is still valid
 */
function getInvalidReason(entry, r) {
    var Order = require('dw/order/Order');
    var c = entry.custom;
    if (r.status === 'CANCELLED') return 'campaign-cancelled';
    var p = getParticipant(c.campaignId, c.customerNo);
    if (p && p.custom.optedOut) return 'opted-out';
    if (c.sourceType !== 'ORDER') return null;
    var order = require('dw/order/OrderMgr').getOrder(c.sourceRef);
    if (!order) return 'order-missing';
    if ([Order.ORDER_STATUS_CANCELLED, Order.ORDER_STATUS_FAILED].indexOf(order.status.value) >= 0) return 'order-cancelled';
    if (order.paymentStatus.value !== Order.PAYMENT_STATUS_PAID) return 'order-not-paid';
    return null;
}

/**
 * Inside a transaction: cancels an open entry and gives its entries back to the customer limit.
 * @param {dw.object.CustomObject} entry - PENDING or ACTIVE entry
 * @param {string} reason - reason
 * @param {Object} by - who
 */
function cancelOpenEntry(entry, reason, by) {
    var c = entry.custom;
    var from = c.status;
    c.status = 'CANCELLED';
    c.reason = reason;
    c.updatedAt = new Date();
    var p = getParticipant(c.campaignId, c.customerNo);
    if (p) p.custom.entryCount = Math.max(0, p.custom.entryCount - c.entryCount);
    luckyDrawHelpers.logAudit({ entityType: 'ENTRY', entityId: c.entryId, campaignId: c.campaignId, action: 'CANCEL', actor: by, from: from, to: 'CANCELLED', reason: reason });
    if (c.sourceType === 'ORDER') {
        var campaign = CustomObjectMgr.getCustomObject('LuckyDrawCampaign', c.campaignId);
        if (campaign && campaign.custom.notifyEntries) luckyDrawHelpers.notify(c.customerNo, 'ENTRY_CANCELLED', { campaign: campaign.custom.name });
    }
}

/**
 * Job helper: cancels entries whose order was cancelled, failed or is no longer paid, and
 * activates entries whose hold period is over. Cursor-based.
 * @param {number} limit - maximum entries per run
 * @returns {Object} counts
 */
function reconcileEntries(limit) {
    var counts = { checked: 0, activated: 0, cancelled: 0 };
    var cursor = luckyDrawHelpers.getJobState('reconcile').cursor || '';
    var now = Date.now();
    var rulesOf = {};
    var system = luckyDrawHelpers.actor('SYSTEM', 'reconcile-job');
    var last = null;
    luckyDrawHelpers.queryPage('LuckyDrawEntry', '(custom.status = {0} OR custom.status = {1}) AND custom.entryId > {2}', 'custom.entryId asc', ['PENDING', 'ACTIVE', cursor], 0, limit).items.forEach(function (entry) {
        var c = entry.custom;
        counts.checked += 1;
        last = c.entryId;
        if (!rulesOf[c.campaignId]) rulesOf[c.campaignId] = campaignHelpers.getCampaignRules(CustomObjectMgr.getCustomObject('LuckyDrawCampaign', c.campaignId));
        var reason = getInvalidReason(entry, rulesOf[c.campaignId]);
        Transaction.wrap(function () {
            if (reason) {
                cancelOpenEntry(entry, reason, system);
                counts.cancelled += 1;
            } else if (c.status === 'PENDING' && c.holdUntil.getTime() <= now) {
                c.status = 'ACTIVE';
                c.updatedAt = new Date();
                counts.activated += 1;
            }
        });
    });
    luckyDrawHelpers.saveJobState('reconcile', { cursor: counts.checked >= limit ? last : null });
    return counts;
}

/**
 * @param {dw.customer.Customer} customer - current customer
 * @returns {?string} customer number of a signed-in registered customer
 */
function getCustomerNo(customer) {
    return customer && customer.authenticated && customer.registered && customer.profile ? customer.profile.customerNo : null;
}

/**
 * @param {Object} r - campaign rules
 * @param {string} customerNo - customer
 * @returns {number} free entries the customer made today (campaign time zone)
 */
function getFreeEntriesToday(r, customerNo) {
    var day = campaignHelpers.getLocalDayKey(Date.now(), r.timeZone);
    var made = 0;
    for (var n = 1; n <= r.freeEntriesPerDay; n++) {
        if (CustomObjectMgr.getCustomObject('LuckyDrawEntry', getEntryId(r.campaignId, 'FREE:' + customerNo + ':' + day + ':' + n))) made += 1;
    }
    return made;
}

/**
 * Checks the state of residence of an entrant.
 * @param {Object} r - campaign rules
 * @param {string} region - two-letter state code
 * @returns {boolean} true when residents of that state may enter
 */
function isRegionAllowed(r, region) {
    return US_STATES.indexOf(region) >= 0 && r.excludedRegions.indexOf(region) < 0;
}

/**
 * @param {dw.object.CustomObject} entry - entry
 * @returns {Object} view for the entrant
 */
function getEntryView(entry) {
    var c = entry.custom;
    return {
        entryId: c.entryId,
        campaignId: c.campaignId,
        sourceType: c.sourceType,
        orderNo: c.sourceType === 'ORDER' ? c.sourceRef : null,
        status: c.status,
        entryCount: c.entryCount,
        windowKey: c.windowKey,
        entryAt: c.entryAt,
        reason: c.reason || null
    };
}

/**
 * Free alternative method of entry: no purchase, same campaign, a fixed number of entries per
 * day in the campaign time zone, after accepting the current rules and confirming age.
 * @param {string} campaignId - campaign
 * @param {dw.customer.Customer} customer - signed-in customer
 * @param {Object} data - {acceptTerms, termsVersion, ageConfirmed, region}
 * @returns {Object} result with entryView
 */
function createFreeEntry(campaignId, customer, data) {
    if (!luckyDrawHelpers.isLuckyDrawEnabled()) return luckyDrawHelpers.errorResult('disabled');
    var customerNo = getCustomerNo(customer);
    if (!customerNo) return luckyDrawHelpers.errorResult('unauthenticated');
    var campaign = campaignHelpers.getCampaign(campaignId);
    if (!campaign) return luckyDrawHelpers.errorResult('not-found');
    var r = campaignHelpers.getCampaignRules(campaign);
    var now = Date.now();
    if (!r.freeEntryEnabled) return luckyDrawHelpers.errorResult('forbidden', { reason: 'no-free-entry' });
    if (r.status !== 'ACTIVE' || !campaignHelpers.isAcceptingAt(r, now)) return luckyDrawHelpers.errorResult('not-eligible', { reason: 'not-open' });
    var input = data || {};
    var region = luckyDrawHelpers.cleanText(input.region).toUpperCase();
    var invalid = {};
    if ([true, 'true', 'on'].indexOf(input.acceptTerms) < 0 || String(input.termsVersion || '') !== r.termsVersion) invalid.acceptTerms = 'required';
    if ([true, 'true', 'on'].indexOf(input.ageConfirmed) < 0) invalid.ageConfirmed = 'required';
    if (!/^[A-Z]{2}$/.test(region)) invalid.region = 'invalid';
    if (Object.keys(invalid).length) return luckyDrawHelpers.errorResult('invalid', invalid);
    if (!isRegionAllowed(r, region)) return luckyDrawHelpers.errorResult('not-eligible', { reason: 'region' });
    if (!luckyDrawHelpers.checkRateLimit('free-entry', customerNo, luckyDrawHelpers.getPreference('luckyDrawFreeEntryRateLimitPerHour'), 3600)) return luckyDrawHelpers.errorResult('rate-limited');
    var w = getOpenWindow(r, now, now);
    if (!w) return luckyDrawHelpers.errorResult('not-eligible', { reason: 'not-open' });
    var entry;
    try {
        var day = campaignHelpers.getLocalDayKey(now, r.timeZone);
        Transaction.wrap(function () {
            var p = getParticipant(r.campaignId, customerNo);
            if (p && p.custom.optedOut) throw luckyDrawHelpers.abort('forbidden', { reason: 'opted-out' });
            var id = null;
            var slot = 0;
            for (var n = 1; n <= r.freeEntriesPerDay && !id; n++) {
                var candidate = getEntryId(r.campaignId, 'FREE:' + customerNo + ':' + day + ':' + n);
                if (!CustomObjectMgr.getCustomObject('LuckyDrawEntry', candidate)) {
                    id = candidate;
                    slot = n;
                }
            }
            if (!id) throw luckyDrawHelpers.abort('limit-reached', { limit: 'free-entries-per-day' });
            var remaining = r.maxEntriesPerCustomer - (p ? p.custom.entryCount : 0);
            if (remaining <= 0) throw luckyDrawHelpers.abort('limit-reached', { limit: 'entries-per-customer' });
            entry = writeEntry(r, {
                id: id,
                customerNo: customerNo,
                sourceType: 'FREE',
                sourceRef: day + ':' + slot,
                count: Math.min(r.freeEntryWeight, remaining),
                windowKey: w.key,
                at: now,
                holdUntil: now,
                region: region,
                termsVersion: r.termsVersion,
                status: 'ACTIVE',
                actor: luckyDrawHelpers.actor('SHOPPER', customerNo)
            });
        });
    } catch (e) {
        return luckyDrawHelpers.toErrorResult(e);
    }
    return { error: false, entryView: getEntryView(entry) };
}

/**
 * Mail-in entry recorded by an administrator (the postal free method of entry).
 * @param {string} campaignId - campaign
 * @param {Object} data - {customerNo, reference, region}
 * @param {Object} by - admin actor
 * @returns {Object} result with entryId
 */
function recordMailInEntry(campaignId, data, by) {
    var campaign = campaignHelpers.getCampaign(campaignId);
    if (!campaign) return luckyDrawHelpers.errorResult('not-found');
    var r = campaignHelpers.getCampaignRules(campaign);
    var now = Date.now();
    var customerNo = luckyDrawHelpers.cleanText(data && data.customerNo);
    var reference = luckyDrawHelpers.cleanText(data && data.reference);
    var region = luckyDrawHelpers.cleanText(data && data.region).toUpperCase();
    var invalid = {};
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(customerNo)) invalid.customerNo = 'invalid';
    if (!/^[A-Za-z0-9_.-]{4,60}$/.test(reference)) invalid.reference = 'invalid';
    if (!/^[A-Z]{2}$/.test(region)) invalid.region = 'invalid';
    if (Object.keys(invalid).length) return luckyDrawHelpers.errorResult('invalid', invalid);
    if (!r.freeEntryEnabled || r.status !== 'ACTIVE' || !campaignHelpers.isAcceptingAt(r, now)) return luckyDrawHelpers.errorResult('not-eligible', { reason: 'not-open' });
    if (!isRegionAllowed(r, region)) return luckyDrawHelpers.errorResult('not-eligible', { reason: 'region' });
    if (!require('dw/customer/CustomerMgr').getCustomerByCustomerNumber(customerNo)) return luckyDrawHelpers.errorResult('not-found');
    var w = getOpenWindow(r, now, now);
    if (!w) return luckyDrawHelpers.errorResult('not-eligible', { reason: 'not-open' });
    var id;
    try {
        id = getEntryId(r.campaignId, 'MAIL:' + reference);
        Transaction.wrap(function () {
            if (CustomObjectMgr.getCustomObject('LuckyDrawEntry', id)) throw luckyDrawHelpers.abort('conflict', { reference: 'used' });
            var p = getParticipant(r.campaignId, customerNo);
            if (p && p.custom.optedOut) throw luckyDrawHelpers.abort('forbidden', { reason: 'opted-out' });
            var remaining = r.maxEntriesPerCustomer - (p ? p.custom.entryCount : 0);
            if (remaining <= 0) throw luckyDrawHelpers.abort('limit-reached', { limit: 'entries-per-customer' });
            writeEntry(r, {
                id: id,
                customerNo: customerNo,
                sourceType: 'MAIL_IN',
                sourceRef: reference,
                count: Math.min(r.freeEntryWeight, remaining),
                windowKey: w.key,
                at: now,
                holdUntil: now,
                region: region,
                status: 'ACTIVE',
                actor: by
            });
        });
    } catch (e) {
        return luckyDrawHelpers.toErrorResult(e);
    }
    return { error: false, entryId: id };
}

/**
 * Business Manager: cancels one open entry.
 * @param {string} entryId - entry
 * @param {string} reason - reason (at least 10 characters)
 * @param {Object} by - admin actor
 * @returns {Object} result
 */
function cancelEntry(entryId, reason, by) {
    var entry = CustomObjectMgr.getCustomObject('LuckyDrawEntry', String(entryId));
    if (!entry) return luckyDrawHelpers.errorResult('not-found');
    var text = luckyDrawHelpers.cleanText(reason);
    if (text.length < 10) return luckyDrawHelpers.errorResult('invalid', { reason: 'required' });
    if (OPEN.indexOf(entry.custom.status) < 0) return luckyDrawHelpers.errorResult('forbidden', { reason: 'entry-already-drawn' });
    Transaction.wrap(function () { cancelOpenEntry(entry, text.slice(0, 1000), by); });
    return { error: false };
}

/**
 * Business Manager: sets or clears a velocity flag. Flagged entries are left out of draws.
 * @param {string} entryId - entry
 * @param {boolean} flagged - new flag
 * @param {string} reason - reason (at least 10 characters)
 * @param {Object} by - admin actor
 * @returns {Object} result
 */
function setEntryFlag(entryId, flagged, reason, by) {
    var entry = CustomObjectMgr.getCustomObject('LuckyDrawEntry', String(entryId));
    if (!entry) return luckyDrawHelpers.errorResult('not-found');
    var text = luckyDrawHelpers.cleanText(reason);
    if (text.length < 10) return luckyDrawHelpers.errorResult('invalid', { reason: 'required' });
    Transaction.wrap(function () {
        entry.custom.flagged = !!flagged;
        entry.custom.updatedAt = new Date();
        luckyDrawHelpers.logAudit({ entityType: 'ENTRY', entityId: entryId, campaignId: entry.custom.campaignId, action: flagged ? 'FLAG' : 'CLEAR_FLAG', actor: by, reason: text.slice(0, 1000) });
    });
    return { error: false };
}

/**
 * Order cancelled, refunded, charged back or flagged as fraud (OMS through the admin API):
 * open entries are cancelled; drawn entries disqualify their winner.
 * @param {string} orderNo - order
 * @param {string} event - CANCELLED | REFUNDED | CHARGEBACK | FRAUD
 * @param {Object} by - integration actor
 * @returns {{cancelled: number, disqualified: number}} counts
 */
function applyOrderEvent(orderNo, event, by) {
    var counts = { cancelled: 0, disqualified: 0 };
    var reason = 'order-' + event.toLowerCase();
    luckyDrawHelpers.queryPage('LuckyDrawEntry', 'custom.sourceType = {0} AND custom.sourceRef = {1}', null, ['ORDER', orderNo], 0, 100).items.forEach(function (entry) {
        var status = entry.custom.status;
        if (OPEN.indexOf(status) >= 0) {
            Transaction.wrap(function () { cancelOpenEntry(entry, reason, by); });
            counts.cancelled += 1;
        } else if (status === 'SELECTED' || status === 'WINNER') {
            require('*/cartridge/scripts/helpers/luckyDrawDrawHelpers').disqualifyEntry(entry, reason, by);
            counts.disqualified += 1;
        }
    });
    return counts;
}

/**
 * @param {string} campaignId - campaign
 * @param {dw.customer.Customer} customer - signed-in customer
 * @returns {Object} result with cancelledEntries (others follow in the reconciliation job)
 */
function optOut(campaignId, customer) {
    var customerNo = getCustomerNo(customer);
    if (!customerNo) return luckyDrawHelpers.errorResult('unauthenticated');
    var campaign = campaignHelpers.getCampaign(campaignId);
    if (!campaign) return luckyDrawHelpers.errorResult('not-found');
    var by = luckyDrawHelpers.actor('SHOPPER', customerNo);
    var open = luckyDrawHelpers.queryPage('LuckyDrawEntry', 'custom.campaignId = {0} AND custom.customerNo = {1} AND (custom.status = {2} OR custom.status = {3})', null, [campaignId, customerNo, 'PENDING', 'ACTIVE'], 0, 500).items;
    try {
        Transaction.wrap(function () {
            var p = ensureParticipant(campaignId, customerNo);
            p.custom.optedOut = true;
            p.custom.optedOutAt = new Date();
            luckyDrawHelpers.logAudit({ entityType: 'PARTICIPANT', entityId: campaignId + ':' + customerNo, campaignId: campaignId, action: 'OPT_OUT', actor: by });
            open.forEach(function (entry) { cancelOpenEntry(entry, 'opted-out', by); });
        });
    } catch (e) {
        return luckyDrawHelpers.toErrorResult(e);
    }
    return { error: false, cancelledEntries: open.length };
}

/**
 * @param {string} customerNo - entrant
 * @param {?string} campaignId - campaign filter
 * @param {number} offset - rows to skip
 * @param {number} limit - page size
 * @returns {{items: Object[], total: number}} the customer's own entries
 */
function getCustomerEntries(customerNo, campaignId, offset, limit) {
    var query = 'custom.customerNo = {0}' + (campaignId ? ' AND custom.campaignId = {1}' : '');
    var page = luckyDrawHelpers.queryPage('LuckyDrawEntry', query, 'custom.createdAt desc', campaignId ? [customerNo, campaignId] : [customerNo], offset, limit);
    return { items: page.items.map(getEntryView), total: page.total };
}

module.exports = {
    US_STATES: US_STATES,
    ENTRY_FLOW: ENTRY_FLOW,
    getEntryId: getEntryId,
    getParticipantToken: getParticipantToken,
    getParticipant: getParticipant,
    evaluateOrder: evaluateOrder,
    createEntryFromOrder: createEntryFromOrder,
    processOrders: processOrders,
    getInvalidReason: getInvalidReason,
    reconcileEntries: reconcileEntries,
    getCustomerNo: getCustomerNo,
    getFreeEntriesToday: getFreeEntriesToday,
    createFreeEntry: createFreeEntry,
    recordMailInEntry: recordMailInEntry,
    cancelEntry: cancelEntry,
    setEntryFlag: setEntryFlag,
    applyOrderEvent: applyOrderEvent,
    optOut: optOut,
    getEntryView: getEntryView,
    getCustomerEntries: getCustomerEntries
};
