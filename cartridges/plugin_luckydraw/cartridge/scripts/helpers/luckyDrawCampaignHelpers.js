'use strict';

/**
 * Campaigns, their draw windows and the storefront page models.
 *
 * Every business value of a campaign (amounts, windows, prizes, limits, legal references) is
 * stored on its record and edited in Business Manager while it is a DRAFT. Scheduling runs the
 * readiness checks, including the legal gate, and freezes the rules: a running campaign can
 * only be paused, resumed or cancelled, never re-ruled.
 *
 * Draw windows are computed in the campaign's own time zone. A window ends at the campaign's
 * draw time (local wall clock) every day, week or month, or once at the campaign end, always
 * counted from the campaign start, so boundaries never depend on when a job runs and a
 * daylight-saving change moves the UTC instant but not the local draw time.
 *
 * Pages never show other participants: past winners appear only as "A. (TX)" and only when
 * both the site and the campaign publish winners; draws expose entry IDs and hashes.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var luckyDrawHelpers = require('*/cartridge/scripts/helpers/luckyDrawHelpers');

var ID = /^[a-z0-9][a-z0-9-]{2,40}$/;
var REF = /^[A-Za-z0-9_.-]{1,100}$/;
var VISIBLE = ['SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED'];
var MAX_WINDOWS = 1000;
var US_TIME_ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'];
var CAMPAIGN_FLOW = {
    DRAFT: ['SCHEDULED', 'CANCELLED'],
    SCHEDULED: ['DRAFT', 'ACTIVE', 'PAUSED', 'CANCELLED'],
    ACTIVE: ['PAUSED', 'COMPLETED', 'CANCELLED'],
    PAUSED: ['ACTIVE', 'SCHEDULED', 'COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: []
};

// Campaign fields edited in Business Manager. Amounts (minOrder, increment) are dollars.
var TEXT_FIELDS = {
    name: [3, 120, true], description: [0, 2000, false, null, true], timeZone: [1, 60, true], startLocal: [1, 16, true], endLocal: [1, 16, true],
    drawTime: [0, 5, false, /^([01]\d|2[0-3]):[0-5]\d$/], termsContentAssetId: [0, 100, false, REF], termsVersion: [0, 20, false, /^[A-Za-z0-9._-]{1,20}$/],
    legalApprovalRef: [0, 120, false], fundingReference: [0, 120, false]
};
var CHOICE_FIELDS = {
    mode: [['SWEEPSTAKES', 'GUARANTEED'], true], drawFrequency: [['DAILY', 'WEEKLY', 'MONTHLY', 'CAMPAIGN'], true], entryMethod: [['PER_ORDER', 'PER_INCREMENT'], true],
    selectionMode: [['ENTRY', 'PARTICIPANT'], false], poolScope: [['WINDOW', 'CAMPAIGN'], true], fundingSource: [['MARKETPLACE', 'SELLER', 'SHARED'], true],
    randomSource: [['PLATFORM', 'EXTERNAL'], true]
};
var NUMBER_FIELDS = {
    drawDelayMinutes: [0, 10080, true], holdHours: [0, 720, true], maxEntriesPerOrder: [1, 1000, true], maxEntriesPerCustomer: [1, 100000, true],
    bonusEntries: [0, 100, false], alternatesPerDraw: [0, 20, false], maxWinsPerParticipant: [1, 100, true], freeEntriesPerDay: [1, 10, false],
    freeEntryWeight: [1, 100, false], minimumAge: [18, 21, true]
};
var LIST_FIELDS = {
    eligibleCountries: [5, /^[A-Z]{2}$/, true], excludedRegions: [60, /^[A-Z]{2}$/], customerGroupIds: [20, REF], eligibleCategoryIds: [100, REF],
    excludedProductIds: [500, REF], bonusCategoryIds: [100, REF], excludedCampaignIds: [20, ID]
};
var FLAG_FIELDS = ['externalBonusEnabled', 'requireWinnerVerification', 'freeEntryEnabled', 'notifyEntries', 'notifyWinners', 'publishWinners'];

/**
 * @returns {string[]} IANA time zones campaigns may use (US zones when the preference is empty)
 */
function getAllowedTimeZones() {
    var zones = luckyDrawHelpers.getListPreference('luckyDrawAllowedTimeZones');
    return zones.length ? zones : US_TIME_ZONES;
}

/**
 * @param {number} ms - instant
 * @param {string} timeZone - IANA time zone
 * @returns {{y: number, mo: number, d: number, h: number, mi: number}} local wall clock (mo 1-12)
 */
function getLocalParts(ms, timeZone) {
    var Calendar = require('dw/util/Calendar');
    var calendar = new Calendar(new Date(ms));
    calendar.setTimeZone(timeZone);
    return {
        y: calendar.get(Calendar.YEAR),
        mo: calendar.get(Calendar.MONTH) + 1,
        d: calendar.get(Calendar.DAY_OF_MONTH),
        h: calendar.get(Calendar.HOUR_OF_DAY),
        mi: calendar.get(Calendar.MINUTE)
    };
}

/**
 * @param {Object} parts - local wall clock
 * @param {string} timeZone - IANA time zone
 * @returns {number} instant of that wall clock time
 */
function toInstant(parts, timeZone) {
    var Calendar = require('dw/util/Calendar');
    var calendar = new Calendar();
    calendar.setTimeZone(timeZone);
    calendar.set(parts.y, parts.mo - 1, parts.d, parts.h, parts.mi, 0);
    calendar.set(Calendar.MILLISECOND, 0);
    return calendar.getTime().getTime();
}

/**
 * @param {Object} parts - local date
 * @param {number} days - days to add
 * @param {number} months - months to add (day clamped to the month length)
 * @returns {Object} shifted local date with the same wall clock time
 */
function shiftLocal(parts, days, months) {
    var monthIndex = parts.mo - 1 + months;
    var y = parts.y + Math.floor(monthIndex / 12);
    var mo = ((monthIndex % 12) + 12) % 12;
    var lastDay = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    var date = new Date(Date.UTC(y, mo, Math.min(parts.d, lastDay) + days));
    return { y: date.getUTCFullYear(), mo: date.getUTCMonth() + 1, d: date.getUTCDate(), h: parts.h, mi: parts.mi };
}

/**
 * @param {Object} parts - local wall clock
 * @returns {string} sortable key "YYYYMMDDTHHMM"
 */
function getPartsKey(parts) {
    var two = function (n) { return (n < 10 ? '0' : '') + n; };
    return String(parts.y) + two(parts.mo) + two(parts.d) + 'T' + two(parts.h) + two(parts.mi);
}

// Per-request memo: the entry job asks for the windows of many orders of the same campaign.
var windowMemo = {};

/**
 * @param {Object} rules - {startAt, endAt, timeZone, drawFrequency, drawTime "HH:MM", drawDelayMinutes}
 * @returns {Array<{key: string, start: number, end: number, drawAt: number}>} all windows of the campaign
 */
function getDrawWindows(rules) {
    var memoKey = [rules.startAt.getTime(), rules.endAt.getTime(), rules.timeZone, rules.drawFrequency, rules.drawTime, rules.drawDelayMinutes].join('|');
    if (windowMemo[memoKey]) return windowMemo[memoKey];
    var start = rules.startAt.getTime();
    var end = rules.endAt.getTime();
    var delay = (rules.drawDelayMinutes || 0) * 60000;
    var tz = rules.timeZone;
    var result = [];
    var push = function (from, to) {
        result.push({ key: getPartsKey(getLocalParts(to, tz)), start: from, end: to, drawAt: to + delay });
    };
    if (rules.drawFrequency === 'CAMPAIGN') {
        push(start, end);
    } else {
        var time = /^(\d{2}):(\d{2})$/.exec(rules.drawTime || '');
        var first = getLocalParts(start, tz);
        first.h = time ? Number(time[1]) : 0;
        first.mi = time ? Number(time[2]) : 0;
        if (toInstant(first, tz) <= start) first = shiftLocal(first, 1, 0);
        var from = start;
        for (var i = 0; i < MAX_WINDOWS && from < end; i++) {
            var boundary;
            if (rules.drawFrequency === 'WEEKLY') boundary = shiftLocal(first, 7 * i, 0);
            else if (rules.drawFrequency === 'MONTHLY') boundary = shiftLocal(first, 0, i);
            else boundary = shiftLocal(first, i, 0);
            var to = Math.min(toInstant(boundary, tz), end);
            push(from, to);
            from = to;
        }
    }
    windowMemo[memoKey] = result;
    return result;
}

/**
 * @param {Object} rules - campaign rules
 * @param {number} ms - instant
 * @returns {?Object} window containing the instant, or null outside the campaign
 */
function getWindowAt(rules, ms) {
    return getDrawWindows(rules).filter(function (w) { return ms >= w.start && ms < w.end; })[0] || null;
}

/**
 * @param {number} ms - instant
 * @param {string} timeZone - IANA time zone
 * @returns {string} "YYYY-MM-DD HH:MM" in that zone, for display
 */
function formatLocalTime(ms, timeZone) {
    var k = getPartsKey(getLocalParts(ms, timeZone));
    return k.slice(0, 4) + '-' + k.slice(4, 6) + '-' + k.slice(6, 8) + ' ' + k.slice(9, 11) + ':' + k.slice(11, 13);
}

/**
 * @param {string} text - "YYYY-MM-DD HH:MM" entered for the campaign time zone
 * @param {string} timeZone - IANA time zone
 * @returns {?Date} instant, or null when the text is not a valid local date and time
 */
function parseLocalTime(text, timeZone) {
    var match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(String(text || '').trim());
    if (!match) return null;
    var parts = { y: Number(match[1]), mo: Number(match[2]), d: Number(match[3]), h: Number(match[4]), mi: Number(match[5]) };
    if (parts.mo < 1 || parts.mo > 12 || parts.d < 1 || parts.d > 31 || parts.h > 23 || parts.mi > 59) return null;
    if (new Date(Date.UTC(parts.y, parts.mo - 1, parts.d)).getUTCDate() !== parts.d) return null;
    return new Date(toInstant(parts, timeZone));
}

/**
 * @param {number} ms - instant
 * @param {string} timeZone - IANA time zone
 * @returns {string} local calendar day "YYYYMMDD", used for per-day limits
 */
function getLocalDayKey(ms, timeZone) {
    return getPartsKey(getLocalParts(ms, timeZone)).slice(0, 8);
}

/**
 * @param {string} text - prizes JSON from the campaign form
 * @returns {{prizes: ?Array<Object>, problem: ?string}} prize tiers, or why they are invalid
 */
function parsePrizes(text) {
    var parsed = luckyDrawHelpers.parseJson(text, null);
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 10) return { prizes: null, problem: 'invalid' };
    var number = function (value, min, max) { return typeof value === 'number' && Math.floor(value) === value && value >= min && value <= max; };
    var tiers = parsed.map(function (p) {
        var label = luckyDrawHelpers.cleanText(p && p.label);
        var valid = p && /^[a-z0-9-]{1,30}$/.test(String(p.tier || '')) && label.length >= 1 && label.length <= 80
            && number(p.winners, 1, 100) && REF.test(String(p.couponId || '')) && number(p.validityDays, 1, 365);
        return valid ? { tier: p.tier, label: label, winners: p.winners, couponId: p.couponId, validityDays: p.validityDays } : null;
    });
    if (tiers.some(function (t) { return !t; })) return { prizes: null, problem: 'invalid-tier' };
    if (tiers.reduce(function (sum, t) { return sum + t.winners; }, 0) > 100) return { prizes: null, problem: 'too-many-winners' };
    return { prizes: tiers, problem: null };
}

/**
 * Checks the campaign form.
 * @param {Object} data - untrusted fields from the Business Manager form
 * @returns {{value: Object, invalid: Object}} attribute values and field problems
 */
function checkCampaignFields(data) {
    var value = {};
    var invalid = {};
    var has = function (name) { return data[name] !== undefined && data[name] !== null && String(data[name]) !== ''; };
    Object.keys(TEXT_FIELDS).forEach(function (name) {
        var rule = TEXT_FIELDS[name];
        var text = luckyDrawHelpers.cleanText(data[name]);
        if (!text) {
            if (rule[2]) invalid[name] = 'required';
            value[name] = null;
        } else if (text.length < rule[0] || text.length > rule[1] || (!rule[4] && /[\r\n]/.test(text)) || (rule[3] && !rule[3].test(text))) {
            invalid[name] = 'invalid';
        } else {
            value[name] = text;
        }
    });
    Object.keys(CHOICE_FIELDS).forEach(function (name) {
        var rule = CHOICE_FIELDS[name];
        var choice = has(name) ? String(data[name]) : null;
        if (choice && rule[0].indexOf(choice) < 0) invalid[name] = 'invalid';
        else if (!choice && rule[1]) invalid[name] = 'required';
        value[name] = choice;
    });
    Object.keys(NUMBER_FIELDS).forEach(function (name) {
        var rule = NUMBER_FIELDS[name];
        var n = has(name) ? Number(data[name]) : null;
        if (n === null) {
            if (rule[2]) invalid[name] = 'required';
        } else if (Math.floor(n) !== n || n < rule[0] || n > rule[1]) {
            invalid[name] = 'out-of-range';
        }
        value[name] = n;
    });
    Object.keys(LIST_FIELDS).forEach(function (name) {
        var rule = LIST_FIELDS[name];
        var items = String(data[name] || '').split(/[\n,]/).map(luckyDrawHelpers.cleanText).filter(Boolean);
        if (name === 'eligibleCountries' || name === 'excludedRegions') items = items.map(function (i) { return i.toUpperCase(); });
        if (!items.length && rule[2]) invalid[name] = 'required';
        else if (items.length > rule[0] || items.some(function (i) { return !rule[1].test(i); })) invalid[name] = 'invalid';
        value[name] = items;
    });
    FLAG_FIELDS.forEach(function (name) { value[name] = [true, 'true', 'on'].indexOf(data[name]) >= 0; });
    value.minOrderCents = luckyDrawHelpers.toCents(data.minOrder);
    if (value.minOrderCents === null || value.minOrderCents > 100000000) invalid.minOrder = has('minOrder') ? 'invalid' : 'required';
    value.incrementCents = has('increment') ? luckyDrawHelpers.toCents(data.increment) : null;
    if (has('increment') && !value.incrementCents) invalid.increment = 'invalid';
    var prizes = parsePrizes(data.prizes);
    if (prizes.problem) invalid.prizes = has('prizes') ? prizes.problem : 'required';
    else value.prizes = JSON.stringify(prizes.prizes);
    if (!invalid.timeZone && value.timeZone && getAllowedTimeZones().indexOf(value.timeZone) < 0) invalid.timeZone = 'not-allowed';
    if (!Object.keys(invalid).length) {
        value.startAt = parseLocalTime(value.startLocal, value.timeZone);
        value.endAt = parseLocalTime(value.endLocal, value.timeZone);
        if (!value.startAt || !value.endAt || value.startAt.getTime() >= value.endAt.getTime()) invalid.endLocal = 'before-start';
        if (value.drawFrequency !== 'CAMPAIGN' && !value.drawTime) invalid.drawTime = 'required';
    }
    delete value.startLocal;
    delete value.endLocal;
    return { value: value, invalid: invalid };
}

/**
 * @param {dw.object.CustomObject} campaign - campaign record
 * @returns {Object} plain rules used by entries, draws and pages
 */
function getCampaignRules(campaign) {
    var c = campaign.custom;
    var list = function (v) { return Array.prototype.slice.call(v || []).map(String); };
    return {
        campaignId: c.campaignId,
        name: c.name,
        description: c.description || '',
        status: c.status,
        mode: c.mode,
        startAt: c.startAt,
        endAt: c.endAt,
        timeZone: c.timeZone,
        drawFrequency: c.drawFrequency,
        drawTime: c.drawTime,
        drawDelayMinutes: c.drawDelayMinutes || 0,
        holdHours: c.holdHours || 0,
        eligibleCountries: list(c.eligibleCountries),
        excludedRegions: list(c.excludedRegions),
        customerGroupIds: list(c.customerGroupIds),
        minOrderCents: c.minOrderCents || 0,
        eligibleCategoryIds: list(c.eligibleCategoryIds),
        excludedProductIds: list(c.excludedProductIds),
        entryMethod: c.entryMethod,
        incrementCents: c.incrementCents || 0,
        maxEntriesPerOrder: c.maxEntriesPerOrder,
        maxEntriesPerCustomer: c.maxEntriesPerCustomer,
        bonusCategoryIds: list(c.bonusCategoryIds),
        bonusEntries: c.bonusEntries || 0,
        externalBonusEnabled: !!c.externalBonusEnabled,
        selectionMode: c.selectionMode || null,
        poolScope: c.poolScope,
        prizes: luckyDrawHelpers.parseJson(c.prizes, []),
        alternatesPerDraw: c.alternatesPerDraw || 0,
        maxWinsPerParticipant: c.maxWinsPerParticipant || 1,
        excludedCampaignIds: list(c.excludedCampaignIds),
        requireWinnerVerification: !!c.requireWinnerVerification,
        freeEntryEnabled: !!c.freeEntryEnabled,
        freeEntriesPerDay: c.freeEntriesPerDay || 1,
        freeEntryWeight: c.freeEntryWeight || 1,
        minimumAge: c.minimumAge || 18,
        termsContentAssetId: c.termsContentAssetId || null,
        termsVersion: c.termsVersion || null,
        legalApprovalRef: c.legalApprovalRef || null,
        notifyEntries: !!c.notifyEntries,
        notifyWinners: !!c.notifyWinners,
        publishWinners: !!c.publishWinners,
        fundingSource: c.fundingSource,
        fundingReference: c.fundingReference || null,
        randomSource: c.randomSource,
        pauses: luckyDrawHelpers.parseJson(c.pauses, []),
        revision: c.revision || 0
    };
}

/**
 * @param {string} campaignId - campaign
 * @returns {?dw.object.CustomObject} campaign record
 */
function getCampaign(campaignId) {
    return ID.test(String(campaignId || '')) ? CustomObjectMgr.getCustomObject('LuckyDrawCampaign', String(campaignId)) : null;
}

/**
 * Creates a draft, or changes a draft. Only drafts can be changed.
 * @param {?string} campaignId - existing campaign, or null to create
 * @param {Object} data - campaign form fields (with campaignId when creating)
 * @param {?number} revision - revision the editor saw
 * @param {Object} by - admin actor
 * @returns {Object} result with campaignId
 */
function saveCampaign(campaignId, data, revision, by) {
    var check = checkCampaignFields(data || {});
    var id = campaignId || luckyDrawHelpers.cleanText(data && data.campaignId).toLowerCase();
    if (!ID.test(id)) check.invalid.campaignId = 'invalid';
    if (Object.keys(check.invalid).length) return luckyDrawHelpers.errorResult('invalid', check.invalid);
    var existing = CustomObjectMgr.getCustomObject('LuckyDrawCampaign', id);
    if (!campaignId && existing) return luckyDrawHelpers.errorResult('conflict', { campaignId: 'exists' });
    if (campaignId && !existing) return luckyDrawHelpers.errorResult('not-found');
    if (existing && existing.custom.status !== 'DRAFT') return luckyDrawHelpers.errorResult('forbidden', { reason: 'rules-frozen' });
    if (existing && revision !== null && revision !== undefined && revision !== (existing.custom.revision || 0)) return luckyDrawHelpers.errorResult('stale');
    Transaction.wrap(function () {
        var record = existing || CustomObjectMgr.createCustomObject('LuckyDrawCampaign', id);
        var c = record.custom;
        Object.keys(check.value).forEach(function (name) { c[name] = check.value[name]; });
        if (!existing) {
            c.status = 'DRAFT';
            c.pauses = '[]';
            c.createdAt = new Date();
            c.revision = 0;
        } else {
            c.revision = (c.revision || 0) + 1;
        }
        c.updatedAt = new Date();
        luckyDrawHelpers.logAudit({ entityType: 'CAMPAIGN', entityId: id, campaignId: id, action: existing ? 'UPDATE' : 'CREATE', actor: by });
    });
    return { error: false, campaignId: id };
}

/**
 * @param {string} couponId - coupon of a prize tier
 * @returns {?string} problem, or null when the coupon can issue single-use codes
 */
function getCouponProblem(couponId) {
    var CouponMgr = require('dw/campaign/CouponMgr');
    var Coupon = require('dw/campaign/Coupon');
    var coupon = CouponMgr.getCoupon(couponId);
    if (!coupon) return 'missing';
    if (!coupon.isEnabled()) return 'disabled';
    if (coupon.getType() !== Coupon.TYPE_SYSTEM_CODES && coupon.getType() !== Coupon.TYPE_MULTIPLE_CODES) return 'not-multi-code';
    if (coupon.getRedemptionLimitPerCode() !== 1) return 'not-single-use';
    return null;
}

/**
 * Everything that must hold before a campaign may be scheduled.
 * @param {Object} r - campaign rules
 * @returns {string[]} problems; empty when ready
 */
function getReadinessProblems(r) {
    var problems = [];
    if (!r.legalApprovalRef) problems.push('legal-approval-reference-missing');
    if (!luckyDrawHelpers.isLiveAllowed()) problems.push('instance-not-legally-approved');
    if (r.mode === 'SWEEPSTAKES' && !r.freeEntryEnabled) problems.push('free-entry-method-required');
    if (r.mode === 'SWEEPSTAKES' && !r.selectionMode) problems.push('selection-mode-required');
    if (r.mode === 'GUARANTEED' && r.prizes.length !== 1) problems.push('guaranteed-needs-one-prize');
    if (!r.termsVersion) problems.push('terms-version-missing');
    var terms = r.termsContentAssetId ? require('dw/content/ContentMgr').getContent(r.termsContentAssetId) : null;
    if (!terms || !terms.isOnline()) problems.push('terms-content-missing');
    var allowed = luckyDrawHelpers.getAllowedCountries();
    if (!r.eligibleCountries.length || r.eligibleCountries.some(function (c) { return allowed.indexOf(c) < 0; })) problems.push('countries-not-allowed');
    if (getAllowedTimeZones().indexOf(r.timeZone) < 0) problems.push('time-zone-not-allowed');
    if (r.endAt.getTime() <= Date.now()) problems.push('campaign-already-ended');
    if (getDrawWindows(r).length >= MAX_WINDOWS) problems.push('too-many-draw-windows');
    if (r.drawDelayMinutes < r.holdHours * 60) problems.push('draw-delay-shorter-than-hold');
    if (r.entryMethod === 'PER_INCREMENT' && !r.incrementCents) problems.push('increment-missing');
    r.prizes.forEach(function (p) {
        var problem = getCouponProblem(p.couponId);
        if (problem) problems.push('coupon-' + p.couponId + '-' + problem);
    });
    return problems;
}

/**
 * @param {Object} r - campaign rules
 * @param {number} ms - instant
 * @returns {boolean} true when an order or free entry at that instant can count
 */
function isAcceptingAt(r, ms) {
    if (['ACTIVE', 'PAUSED'].indexOf(r.status) < 0) return false;
    if (ms < r.startAt.getTime() || ms >= r.endAt.getTime()) return false;
    return !r.pauses.some(function (p) {
        var from = Date.parse(p.from);
        var to = p.to ? Date.parse(p.to) : Infinity;
        return ms >= from && ms < to;
    });
}

/**
 * Business Manager status change.
 * @param {string} campaignId - campaign
 * @param {string} action - schedule | unschedule | pause | resume | cancel
 * @param {string} reason - reason (required to pause and cancel)
 * @param {Object} by - admin actor
 * @returns {Object} result with status, or problems when scheduling is blocked
 */
function changeCampaignStatus(campaignId, action, reason, by) {
    var campaign = getCampaign(campaignId);
    if (!campaign) return luckyDrawHelpers.errorResult('not-found');
    var r = getCampaignRules(campaign);
    var now = Date.now();
    var text = luckyDrawHelpers.cleanText(reason).slice(0, 1000);
    var target = { schedule: 'SCHEDULED', unschedule: 'DRAFT', pause: 'PAUSED', resume: now < r.startAt.getTime() ? 'SCHEDULED' : 'ACTIVE', cancel: 'CANCELLED' }[action];
    if (!target) return luckyDrawHelpers.errorResult('invalid', { action: 'invalid' });
    if ((action === 'pause' || action === 'cancel') && text.length < 10) return luckyDrawHelpers.errorResult('invalid', { reason: 'required' });
    if (action === 'schedule') {
        var problems = getReadinessProblems(r);
        if (problems.length) {
            var blocked = luckyDrawHelpers.errorResult('invalid', { readiness: problems.join(',') });
            blocked.problems = problems;
            return blocked;
        }
    }
    if (action === 'unschedule' && now >= r.startAt.getTime()) return luckyDrawHelpers.errorResult('forbidden', { reason: 'already-started' });
    if (action === 'resume' && now >= r.endAt.getTime()) target = 'COMPLETED';
    if (!luckyDrawHelpers.canMove(CAMPAIGN_FLOW, r.status, target)) return luckyDrawHelpers.errorResult('not-allowed-now');
    Transaction.wrap(function () {
        var c = campaign.custom;
        var pauses = r.pauses.slice();
        if (target === 'PAUSED') pauses.push({ from: new Date(now).toISOString(), to: null, reason: text });
        if (r.status === 'PAUSED' && pauses.length) pauses[pauses.length - 1].to = new Date(now).toISOString();
        c.pauses = JSON.stringify(pauses);
        c.status = target;
        c.updatedAt = new Date();
        if (action === 'schedule') {
            c.scheduledAt = new Date();
            c.scheduledBy = by.ref;
        }
        c.revision = (c.revision || 0) + 1;
        luckyDrawHelpers.logAudit({ entityType: 'CAMPAIGN', entityId: campaignId, campaignId: campaignId, action: action.toUpperCase(), actor: by, from: r.status, to: target, reason: text });
    });
    return { error: false, status: target };
}

/**
 * Job helper: starts scheduled campaigns and completes ended ones whose draws are all done.
 * @param {number} limit - maximum campaigns
 * @returns {{activated: number, completed: number}} counts
 */
function advanceCampaigns(limit) {
    var counts = { activated: 0, completed: 0 };
    var now = Date.now();
    var system = luckyDrawHelpers.actor('SYSTEM', 'campaign-status');
    luckyDrawHelpers.queryPage('LuckyDrawCampaign', 'custom.status = {0} OR custom.status = {1} OR custom.status = {2}', null, ['SCHEDULED', 'ACTIVE', 'PAUSED'], 0, limit).items.forEach(function (campaign) {
        var r = getCampaignRules(campaign);
        var target = null;
        if (r.status === 'SCHEDULED' && now >= r.startAt.getTime()) target = 'ACTIVE';
        if (r.status !== 'SCHEDULED' && now >= r.endAt.getTime()) {
            var open = luckyDrawHelpers.queryCount('LuckyDrawExecution', 'custom.campaignId = {0} AND custom.status != {1} AND custom.status != {2} AND custom.status != {3}', [r.campaignId, 'FINALIZED', 'VOID', 'CANCELLED']);
            var last = getDrawWindows(r)[getDrawWindows(r).length - 1];
            if (open === 0 && CustomObjectMgr.getCustomObject('LuckyDrawExecution', r.campaignId + '_' + last.key)) target = 'COMPLETED';
        }
        if (!target || !luckyDrawHelpers.canMove(CAMPAIGN_FLOW, r.status, target)) return;
        Transaction.wrap(function () {
            campaign.custom.status = target;
            campaign.custom.updatedAt = new Date();
            campaign.custom.revision = (campaign.custom.revision || 0) + 1;
            luckyDrawHelpers.logAudit({ entityType: 'CAMPAIGN', entityId: r.campaignId, campaignId: r.campaignId, action: 'STATUS', actor: system, from: r.status, to: target });
        });
        counts[target === 'ACTIVE' ? 'activated' : 'completed'] += 1;
    });
    return counts;
}

/**
 * @param {Object} r - campaign rules
 * @returns {Object} public view (no legal references, coupons or funding)
 */
function getCampaignView(r) {
    return {
        campaignId: r.campaignId,
        name: r.name,
        description: r.description,
        status: r.status,
        mode: r.mode,
        startAt: r.startAt,
        endAt: r.endAt,
        timeZone: r.timeZone,
        startFormatted: formatLocalTime(r.startAt.getTime(), r.timeZone),
        endFormatted: formatLocalTime(r.endAt.getTime(), r.timeZone),
        drawFrequency: r.drawFrequency,
        drawTime: r.drawTime,
        minOrderFormatted: luckyDrawHelpers.formatCents(r.minOrderCents),
        entryMethod: r.entryMethod,
        incrementFormatted: r.incrementCents ? luckyDrawHelpers.formatCents(r.incrementCents) : null,
        maxEntriesPerOrder: r.maxEntriesPerOrder,
        maxEntriesPerCustomer: r.maxEntriesPerCustomer,
        eligibleCountries: r.eligibleCountries,
        excludedRegions: r.excludedRegions,
        hasCategoryRule: r.eligibleCategoryIds.length > 0,
        prizes: r.prizes.map(function (p) { return { tier: p.tier, label: p.label, winners: p.winners, validityDays: p.validityDays }; }),
        freeEntryEnabled: r.freeEntryEnabled,
        freeEntriesPerDay: r.freeEntriesPerDay,
        minimumAge: r.minimumAge,
        termsContentAssetId: r.termsContentAssetId,
        termsVersion: r.termsVersion,
        demonstration: !luckyDrawHelpers.isProduction() && luckyDrawHelpers.getPreference('luckyDrawLegalApproved') !== true
    };
}

/**
 * @param {string} campaignId - campaign
 * @returns {?Object} rules of a campaign shoppers may see
 */
function getVisibleCampaignRules(campaignId) {
    var campaign = getCampaign(campaignId);
    var r = campaign ? getCampaignRules(campaign) : null;
    return r && VISIBLE.indexOf(r.status) >= 0 ? r : null;
}

/**
 * @param {number} limit - maximum campaigns
 * @returns {Array<Object>} rules of campaigns visible on the storefront, newest start first
 */
function getVisibleCampaigns(limit) {
    return luckyDrawHelpers.queryPage('LuckyDrawCampaign', VISIBLE.map(function (s, i) { return 'custom.status = {' + i + '}'; }).join(' OR '), 'custom.startAt desc', VISIBLE, 0, limit).items.map(getCampaignRules);
}

/**
 * @param {Object} r - campaign rules
 * @param {number} nowMs - current time
 * @returns {?{at: Date, formatted: string, iso: string}} next draw that has not happened yet
 */
function getNextDraw(r, nowMs) {
    if (['SCHEDULED', 'ACTIVE', 'PAUSED'].indexOf(r.status) < 0) return null;
    var next = getDrawWindows(r).filter(function (w) {
        var execution = CustomObjectMgr.getCustomObject('LuckyDrawExecution', r.campaignId + '_' + w.key);
        return w.drawAt > nowMs || (execution && ['FINALIZED', 'VOID', 'CANCELLED'].indexOf(execution.custom.status) < 0);
    })[0];
    return next ? { at: new Date(next.drawAt), formatted: formatLocalTime(next.drawAt, r.timeZone), iso: new Date(next.drawAt).toISOString() } : null;
}

/**
 * @param {Object} r - campaign rules
 * @param {number} limit - maximum winners
 * @returns {Object[]} public winner list, or empty when winners are not published
 */
function getPublicWinners(r, limit) {
    if (luckyDrawHelpers.getPreference('luckyDrawPublishWinners') !== true || !r.publishWinners) return [];
    return luckyDrawHelpers.queryPage('LuckyDrawWinner', 'custom.campaignId = {0} AND custom.status = {1}', 'custom.createdAt desc', [r.campaignId, 'CONFIRMED'], 0, limit).items.map(function (w) {
        return { displayName: w.custom.displayName, prize: w.custom.prizeLabel, drawnAt: w.custom.createdAt };
    });
}

/**
 * @param {Object} r - campaign rules
 * @param {number} limit - maximum draws
 * @returns {Object[]} finished draws with their verification data
 */
function getFinishedDraws(r, limit) {
    var getDrawView = require('*/cartridge/scripts/helpers/luckyDrawDrawHelpers').getDrawView;
    return luckyDrawHelpers.queryPage('LuckyDrawExecution', 'custom.campaignId = {0} AND (custom.status = {1} OR custom.status = {2})', 'custom.windowEnd desc', [r.campaignId, 'FINALIZED', 'VOID'], 0, limit).items.map(function (x) {
        return getDrawView(x, true);
    });
}

/**
 * @param {Object} r - campaign rules
 * @returns {Object[]} orderable products of the first eligible category, when enabled
 */
function getRecommendations(r) {
    if (luckyDrawHelpers.getPreference('luckyDrawRecommendationsEnabled') !== true || !r.eligibleCategoryIds.length) return [];
    var ProductSearchModel = require('dw/catalog/ProductSearchModel');
    var search = new ProductSearchModel();
    search.setCategoryID(r.eligibleCategoryIds[0]);
    search.setOrderableProductsOnly(true);
    search.search();
    var result = [];
    var max = luckyDrawHelpers.getPreference('luckyDrawRecommendationsMax');
    var hits = search.getProductSearchHits();
    while (hits.hasNext() && result.length < max) {
        var product = hits.next().product;
        var price = product.priceModel.price;
        if (product.online && r.excludedProductIds.indexOf(product.ID) < 0 && price && price.available) {
            result.push({ id: product.ID, name: product.name, price: luckyDrawHelpers.formatCents(luckyDrawHelpers.centsOf(price)), url: require('dw/web/URLUtils').url('Product-Show', 'pid', product.ID).toString() });
        }
    }
    return result;
}

/**
 * @param {Object} r - campaign rules
 * @param {string} customerNo - signed-in customer
 * @returns {Object} the customer's own standing in the campaign
 */
function getCustomerStanding(r, customerNo) {
    var entryHelpers = require('*/cartridge/scripts/helpers/luckyDrawEntryHelpers');
    var p = entryHelpers.getParticipant(r.campaignId, customerNo);
    var total = p ? p.custom.entryCount : 0;
    var thresholds = luckyDrawHelpers.getListPreference('luckyDrawBadgeThresholds').map(Number).filter(function (t) { return t > 0; });
    if (!thresholds.length) thresholds = [1, 5, 10];
    thresholds.sort(function (a, b) { return a - b; });
    return {
        signedIn: true,
        optedOut: !!(p && p.custom.optedOut),
        totalEntries: total,
        maxEntries: r.maxEntriesPerCustomer,
        progressPercent: Math.min(100, Math.round((total * 100) / r.maxEntriesPerCustomer)),
        badges: thresholds.map(function (t) { return { threshold: t, earned: total >= t }; }),
        freeEntriesLeftToday: Math.max(0, r.freeEntriesPerDay - entryHelpers.getFreeEntriesToday(r, customerNo)),
        entries: entryHelpers.getCustomerEntries(customerNo, r.campaignId, 0, luckyDrawHelpers.getPreference('luckyDrawHistoryPageSize')).items,
        rewards: require('*/cartridge/scripts/helpers/luckyDrawRewardHelpers').getCustomerRewards(customerNo, 20).filter(function (rw) { return rw.campaignId === r.campaignId; })
    };
}

/**
 * @param {string} campaignId - campaign
 * @param {?string} customerNo - signed-in customer, or null for a guest
 * @returns {?Object} campaign page model, or null when the campaign is not visible
 */
function getCampaignPage(campaignId, customerNo) {
    var r = getVisibleCampaignRules(campaignId);
    if (!r) return null;
    var now = Date.now();
    return {
        campaign: getCampaignView(r),
        open: r.status === 'ACTIVE' && isAcceptingAt(r, now),
        nextDraw: getNextDraw(r, now),
        winners: getPublicWinners(r, 20),
        draws: getFinishedDraws(r, 10),
        recommendations: getRecommendations(r),
        me: customerNo ? getCustomerStanding(r, customerNo) : { signedIn: false }
    };
}

/**
 * @returns {Object[]} visible campaigns for the overview page and the API
 */
function getOverview() {
    var now = Date.now();
    return getVisibleCampaigns(50).map(function (r) {
        var v = getCampaignView(r);
        v.nextDraw = getNextDraw(r, now);
        v.open = r.status === 'ACTIVE' && isAcceptingAt(r, now);
        return v;
    });
}

module.exports = {
    ID: ID,
    MAX_WINDOWS: MAX_WINDOWS,
    CAMPAIGN_FLOW: CAMPAIGN_FLOW,
    getAllowedTimeZones: getAllowedTimeZones,
    getDrawWindows: getDrawWindows,
    getWindowAt: getWindowAt,
    formatLocalTime: formatLocalTime,
    parseLocalTime: parseLocalTime,
    getLocalDayKey: getLocalDayKey,
    parsePrizes: parsePrizes,
    checkCampaignFields: checkCampaignFields,
    getCampaignRules: getCampaignRules,
    getCampaign: getCampaign,
    saveCampaign: saveCampaign,
    getReadinessProblems: getReadinessProblems,
    isAcceptingAt: isAcceptingAt,
    changeCampaignStatus: changeCampaignStatus,
    advanceCampaigns: advanceCampaigns,
    getCampaignView: getCampaignView,
    getVisibleCampaignRules: getVisibleCampaignRules,
    getVisibleCampaigns: getVisibleCampaigns,
    getNextDraw: getNextDraw,
    getPublicWinners: getPublicWinners,
    getFinishedDraws: getFinishedDraws,
    getCustomerStanding: getCustomerStanding,
    getCampaignPage: getCampaignPage,
    getOverview: getOverview
};
