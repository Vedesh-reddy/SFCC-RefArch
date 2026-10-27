'use strict';

/**
 * Business Manager desk of the lucky draw (Merchant Tools > Lucky Draw). Nodes are grouped
 * under permission-scoped menu actions in bm_extensions.xml, so campaign editors, draw
 * operators and fraud reviewers can be separate roles. Every change is a CSRF-protected POST
 * recorded with the BM user name. No node runs a draw or edits a result: draws run only in
 * the job, and winners change only through audited disqualification or confirmation.
 */

var ISML = require('dw/template/ISML');
var URLUtils = require('dw/web/URLUtils');
var CSRFProtection = require('dw/web/CSRFProtection');
var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Logger = require('dw/system/Logger');
var luckyDrawHelpers = require('*/cartridge/scripts/helpers/luckyDrawHelpers');
var campaignHelpers = require('*/cartridge/scripts/helpers/luckyDrawCampaignHelpers');

var log = Logger.getLogger('plugin-luckydraw', 'luckydraw-admin');
var PAGE = 50;
var REQUIRED_PREFERENCES = ['luckyDrawCurrency', 'luckyDrawFromEmail', 'luckyDrawAdminNotificationEmails'];

/**
 * @param {string} name - parameter
 * @returns {string} trimmed value
 */
function param(name) {
    var value = request.httpParameterMap.get(name);
    return value && value.submitted ? String(value.stringValue || '').trim() : '';
}

/**
 * @returns {Object} audit actor for the BM user
 */
function actor() {
    return luckyDrawHelpers.actor('ADMIN', session.userName);
}

/**
 * @returns {boolean} true for an authenticated BM session
 */
function allowed() {
    if (!session.userAuthenticated) {
        response.setStatus(403);
        return false;
    }
    return true;
}

/**
 * @param {Date} date - date
 * @returns {string} UTC date and time to the minute
 */
function when(date) {
    return date ? date.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '';
}

/**
 * @param {number} cents - amount
 * @returns {string} dollars for an input field, e.g. "2500.00"
 */
function dollars(cents) {
    return typeof cents === 'number' ? (cents / 100).toFixed(2) : '';
}

/**
 * @param {Object} model - {title, back, sections}
 */
function render(model) {
    model.message = param('message');
    model.error = param('error');
    model.csrf = { name: CSRFProtection.getTokenName(), token: CSRFProtection.generateToken() };
    model.enabled = luckyDrawHelpers.isLuckyDrawEnabled();
    ISML.renderTemplate('luckydrawadmin/page', { model: model });
}

/**
 * Runs a POST action and redirects with the outcome.
 * @param {Function} fn - performs the action and returns a result object
 * @param {Function} back - result => return URL
 */
function post(fn, back) {
    if (request.httpMethod !== 'POST' || !CSRFProtection.validateRequest()) {
        response.setStatus(403);
        return;
    }
    var result;
    try {
        result = fn() || { error: false };
    } catch (e) {
        log.error('Lucky draw desk action failed: {0}', e.message);
        result = luckyDrawHelpers.errorResult('general');
    }
    var url = back(result);
    if (!result.error) {
        response.redirect(url.append('message', 'done'));
        return;
    }
    response.redirect(url.append('error', result.errorCode + (result.fields ? ' ' + JSON.stringify(result.fields).slice(0, 300) : '')));
}

/**
 * @param {string} type - custom object type
 * @param {string} query - query
 * @param {Array} args - arguments
 * @returns {string} number of matching records
 */
function count(type, query, args) {
    return String(luckyDrawHelpers.queryCount(type, query, args));
}

/**
 * @param {string} name - field
 * @param {string} label - label
 * @param {Object} [extra] - options
 * @returns {Object} field
 */
function field(name, label, extra) {
    return Object.assign({ name: name, label: label, type: 'text', value: '', required: false }, extra || {});
}

/**
 * @param {string} value - value
 * @param {string} label - label
 * @returns {Object} option
 */
function option(value, label) {
    return { value: value, label: label };
}

/**
 * @param {string[]} values - allowed values
 * @returns {Object[]} select options
 */
function options(values) {
    return values.map(function (v) { return option(v, v); });
}

/**
 * @param {string} name - action name
 * @param {string} label - label
 * @param {Array} values - allowed values
 * @param {*} current - current value
 * @returns {Object} select field
 */
function select(name, label, values, current) {
    return field(name, label, { type: 'select', options: options(values), value: current === undefined || current === null ? values[0] : String(current) });
}

/**
 * Campaign form fields, filled from the current rules when editing.
 * @param {?Object} r - campaign rules, or null for a new campaign
 * @returns {Object[]} fields
 */
function campaignFields(r) {
    var v = r || {};
    var list = function (value) { return (value || []).join(', '); };
    var bool = function (name, label, value) { return select(name, label, ['false', 'true'], value ? 'true' : 'false'); };
    var fields = [];
    if (!r) fields.push(field('campaignId', 'Campaign ID (lowercase, digits, hyphens)', { required: true }));
    return fields.concat([
        field('name', 'Name', { value: v.name || '', required: true }),
        field('description', 'Description', { type: 'textarea', value: v.description || '' }),
        select('mode', 'Mode (SWEEPSTAKES = random draw with free entry; GUARANTEED = every qualifying entry is rewarded)', ['SWEEPSTAKES', 'GUARANTEED'], v.mode),
        field('timeZone', 'Time zone (IANA, from luckyDrawAllowedTimeZones)', { value: v.timeZone || 'America/New_York', required: true }),
        field('startLocal', 'Start (YYYY-MM-DD HH:MM, campaign time zone)', { value: r ? campaignHelpers.formatLocalTime(r.startAt.getTime(), r.timeZone) : '', required: true }),
        field('endLocal', 'End (YYYY-MM-DD HH:MM, campaign time zone)', { value: r ? campaignHelpers.formatLocalTime(r.endAt.getTime(), r.timeZone) : '', required: true }),
        select('drawFrequency', 'Draw frequency', ['DAILY', 'WEEKLY', 'MONTHLY', 'CAMPAIGN'], v.drawFrequency),
        field('drawTime', 'Draw time (HH:MM local; not used for CAMPAIGN)', { value: v.drawTime || '20:00' }),
        field('drawDelayMinutes', 'Minutes after the window end before the draw (at least the hold period)', { value: String(v.drawDelayMinutes !== undefined ? v.drawDelayMinutes : 1440) }),
        field('holdHours', 'Hold period for order entries, hours (cancellation window)', { value: String(v.holdHours !== undefined ? v.holdHours : 24) }),
        field('eligibleCountries', 'Eligible countries', { value: list(v.eligibleCountries) || 'US' }),
        field('excludedRegions', 'Excluded states (two-letter codes, comma separated)', { value: list(v.excludedRegions) }),
        field('customerGroupIds', 'Customer groups (empty = all registered customers)', { value: list(v.customerGroupIds) }),
        field('minOrder', 'Minimum eligible merchandise (USD)', { value: r ? dollars(v.minOrderCents) : '', required: true }),
        field('eligibleCategoryIds', 'Eligible category IDs (empty = all)', { value: list(v.eligibleCategoryIds) }),
        field('excludedProductIds', 'Excluded product IDs', { value: list(v.excludedProductIds) }),
        select('entryMethod', 'Entry method', ['PER_ORDER', 'PER_INCREMENT'], v.entryMethod),
        field('increment', 'Increment per entry (USD, for PER_INCREMENT)', { value: r && v.incrementCents ? dollars(v.incrementCents) : '' }),
        field('maxEntriesPerOrder', 'Maximum entries per order', { value: String(v.maxEntriesPerOrder || 1) }),
        field('maxEntriesPerCustomer', 'Maximum entries per customer', { value: String(v.maxEntriesPerCustomer || 10) }),
        field('bonusCategoryIds', 'Bonus category IDs', { value: list(v.bonusCategoryIds) }),
        field('bonusEntries', 'Bonus entries for a bonus category', { value: String(v.bonusEntries || 0) }),
        bool('externalBonusEnabled', 'Loyalty/referral bonus hook (only where legally permitted)', v.externalBonusEnabled),
        select('selectionMode', 'Selection (ENTRY = each entry one chance; PARTICIPANT = each participant one chance)', ['ENTRY', 'PARTICIPANT'], v.selectionMode),
        select('poolScope', 'Pool (WINDOW = entries of the window; CAMPAIGN = all entries so far, e.g. grand prize)', ['WINDOW', 'CAMPAIGN'], v.poolScope),
        field('prizes', 'Prizes JSON: [{"tier":"grand","label":"$200 coupon","winners":1,"couponId":"...","validityDays":30}]', { type: 'textarea', value: r ? JSON.stringify(v.prizes) : '', required: true }),
        field('alternatesPerDraw', 'Alternates per draw', { value: String(v.alternatesPerDraw !== undefined ? v.alternatesPerDraw : 3) }),
        field('maxWinsPerParticipant', 'Maximum wins per participant in this campaign', { value: String(v.maxWinsPerParticipant || 1) }),
        field('excludedCampaignIds', 'Winners of these campaigns cannot win', { value: list(v.excludedCampaignIds) }),
        bool('requireWinnerVerification', 'Verify winners before awarding', r ? v.requireWinnerVerification : true),
        bool('freeEntryEnabled', 'Free method of entry (required for SWEEPSTAKES)', r ? v.freeEntryEnabled : true),
        field('freeEntriesPerDay', 'Free entries per customer per day', { value: String(v.freeEntriesPerDay || 1) }),
        field('freeEntryWeight', 'Entries per free entry (same as one order entry is usual)', { value: String(v.freeEntryWeight || 1) }),
        field('minimumAge', 'Minimum age', { value: String(v.minimumAge || 18) }),
        field('termsContentAssetId', 'Official rules content asset ID', { value: v.termsContentAssetId || '' }),
        field('termsVersion', 'Official rules version', { value: v.termsVersion || '' }),
        field('legalApprovalRef', 'Legal approval reference (required to schedule)', { value: v.legalApprovalRef || '' }),
        bool('notifyEntries', 'Notify entrants', r ? v.notifyEntries : true),
        bool('notifyWinners', 'Notify winners', r ? v.notifyWinners : true),
        bool('publishWinners', 'Publish masked winner names', v.publishWinners),
        select('fundingSource', 'Reward funding', ['MARKETPLACE', 'SELLER', 'SHARED'], v.fundingSource),
        field('fundingReference', 'Funding reference (e.g. seller ID, budget code)', { value: v.fundingReference || '' }),
        select('randomSource', 'Random source', ['PLATFORM', 'EXTERNAL'], v.randomSource)
    ]);
}

/**
 * @returns {Object} posted campaign input
 */
function campaignInput() {
    var input = {};
    campaignFields(null).forEach(function (f) {
        var name = f.name;
        var value = param(name);
        if (value !== '') input[name] = value;
    });
    return input;
}

exports.Home = function () {
    if (!allowed()) return;
    var byStatus = function (type, status) { return count(type, 'custom.status = {0}', [status]); };
    var problems = REQUIRED_PREFERENCES.filter(function (id) {
        var value = luckyDrawHelpers.getPreference(id);
        return !value || value.length === 0;
    });
    if (luckyDrawHelpers.isProduction() && !luckyDrawHelpers.isLiveAllowed()) problems.push('luckyDrawLegalApproved (production without legal approval)');
    var mode = 'Non-production instance: campaigns run as labelled demonstrations.';
    if (luckyDrawHelpers.isProduction()) mode = luckyDrawHelpers.isLiveAllowed() ? 'Production: legal approval recorded in luckyDrawLegalApproved.' : 'Production without legal approval: campaigns cannot be scheduled.';
    render({
        title: 'Lucky Draw',
        sections: [
            { type: 'notice', text: mode },
            { type: 'kv', title: 'Campaigns', rows: [['Active', byStatus('LuckyDrawCampaign', 'ACTIVE')], ['Scheduled', byStatus('LuckyDrawCampaign', 'SCHEDULED')], ['Paused', byStatus('LuckyDrawCampaign', 'PAUSED')], ['Drafts', byStatus('LuckyDrawCampaign', 'DRAFT')]] },
            { type: 'kv', title: 'Attention', rows: [
                ['Open cases', count('LuckyDrawCase', 'custom.status = {0} OR custom.status = {1}', ['OPEN', 'IN_PROGRESS'])],
                ['Failed draws', byStatus('LuckyDrawExecution', 'FAILED')],
                ['Winners to verify', byStatus('LuckyDrawWinner', 'PENDING_VERIFICATION')],
                ['Rewards failed', byStatus('LuckyDrawReward', 'FAILED')],
                ['Flagged entries', count('LuckyDrawEntry', 'custom.flagged = {0} AND (custom.status = {1} OR custom.status = {2})', [true, 'PENDING', 'ACTIVE'])]
            ] },
            { type: 'kv', title: 'Configuration', rows: [
                ['Enabled (USD)', luckyDrawHelpers.isLuckyDrawEnabled() ? 'yes' : 'no'],
                ['Legal approval (production)', luckyDrawHelpers.getPreference('luckyDrawLegalApproved') === true ? 'recorded' : 'not recorded'],
                ['Countries', luckyDrawHelpers.getAllowedCountries().join(', ')],
                ['Publish winners', luckyDrawHelpers.getPreference('luckyDrawPublishWinners') === true ? 'yes' : 'no'],
                ['Preference problems', problems.length ? problems.join(', ') : 'none']
            ] }
        ]
    });
};
exports.Home.public = true;

exports.Campaigns = function () {
    if (!allowed()) return;
    var statuses = Object.keys(campaignHelpers.CAMPAIGN_FLOW);
    var status = statuses.indexOf(param('status')) >= 0 ? param('status') : null;
    var result = luckyDrawHelpers.queryPage('LuckyDrawCampaign', status ? 'custom.status = {0}' : 'custom.status != {0}', 'custom.startAt desc', [status || 'NONE'], 0, PAGE);
    render({
        title: 'Lucky draw campaigns',
        sections: [
            { type: 'filter', links: statuses.map(function (s) { return { label: s, url: URLUtils.url('LuckyDrawAdmin-Campaigns', 'status', s).toString(), active: status === s }; }) },
            { type: 'table', columns: ['Campaign', 'Name', 'Mode', 'Status', 'Start', 'End'], rows: result.items.map(function (r) {
                var c = r.custom;
                return { link: URLUtils.url('LuckyDrawAdmin-Campaign', 'id', c.campaignId).toString(), cells: [c.campaignId, c.name, c.mode, c.status, when(c.startAt), when(c.endAt)] };
            }) },
            { type: 'form', title: 'New campaign (draft)', action: URLUtils.url('LuckyDrawAdmin-CampaignAction', 'kind', 'create').toString(), fields: campaignFields(null), submit: 'Create draft' }
        ]
    });
};
exports.Campaigns.public = true;

exports.Campaign = function () {
    if (!allowed()) return;
    var id = param('id');
    var record = campaignHelpers.getCampaign(id);
    if (!record) {
        render({ title: 'Campaign not found', sections: [] });
        return;
    }
    var r = campaignHelpers.getCampaignRules(record);
    var actionUrl = URLUtils.url('LuckyDrawAdmin-CampaignAction', 'id', id).toString();
    var problems = r.status === 'DRAFT' ? campaignHelpers.getReadinessProblems(r) : [];
    var sections = [
        { type: 'kv', rows: [
            ['Status', r.status], ['Mode', r.mode], ['Period', campaignHelpers.formatLocalTime(r.startAt.getTime(), r.timeZone) + ' - ' + campaignHelpers.formatLocalTime(r.endAt.getTime(), r.timeZone) + ' (' + r.timeZone + ')'],
            ['Draws', r.drawFrequency + (r.drawTime ? ' at ' + r.drawTime : '') + ', ' + campaignHelpers.getDrawWindows(r).length + ' window(s)'],
            ['Legal approval reference', r.legalApprovalRef || 'missing'], ['Official rules', (r.termsContentAssetId || 'missing') + ' v' + (r.termsVersion || '?')],
            ['Funding', r.fundingSource + (r.fundingReference ? ' (' + r.fundingReference + ')' : '')],
            ['Scheduled by', record.custom.scheduledBy ? record.custom.scheduledBy + ' at ' + when(record.custom.scheduledAt) : '']
        ] },
        { type: 'links', links: [
            { label: 'Draws of this campaign', url: URLUtils.url('LuckyDrawAdmin-Draws', 'campaignId', id).toString() },
            { label: 'Entries of this campaign', url: URLUtils.url('LuckyDrawAdmin-Entries', 'campaignId', id).toString() },
            { label: 'Audit trail of this campaign', url: URLUtils.url('LuckyDrawAdmin-Audit', 'campaignId', id).toString() }
        ] }
    ];
    if (r.status === 'DRAFT') sections.push({ type: 'notice', title: 'Readiness', text: problems.length ? 'Cannot be scheduled yet: ' + problems.join(', ') : 'Ready to schedule. Scheduling freezes the rules.' });
    sections.push({ type: 'form', title: 'Status', action: actionUrl, fields: [
        field('kind', '', { type: 'hidden', value: 'status' }),
        field('action', 'Action', { type: 'select', options: [option('schedule', 'Schedule (freezes rules)'), option('unschedule', 'Back to draft (before start)'), option('pause', 'Pause entries and draws'), option('resume', 'Resume'), option('cancel', 'Cancel campaign')] }),
        field('reason', 'Reason (required to pause or cancel)', { type: 'textarea' })
    ], submit: 'Apply' });
    if (r.status === 'ACTIVE' && r.freeEntryEnabled) {
        sections.push({ type: 'form', title: 'Record a mail-in entry', action: actionUrl, fields: [
            field('kind', '', { type: 'hidden', value: 'mailin' }),
            field('customerNo', 'Customer number', { required: true }),
            field('reference', 'Mail-in reference (unique, e.g. envelope ID)', { required: true }),
            field('region', 'State of residence', { required: true })
        ], submit: 'Record entry' });
    }
    if (r.status === 'DRAFT') {
        sections.push({ type: 'form', title: 'Edit draft', action: actionUrl, fields: [field('kind', '', { type: 'hidden', value: 'save' }), field('revision', '', { type: 'hidden', value: String(r.revision) })].concat(campaignFields(r)), submit: 'Save draft' });
    }
    render({ title: 'Campaign ' + id + ' - ' + r.name, back: URLUtils.url('LuckyDrawAdmin-Campaigns').toString(), sections: sections });
};
exports.Campaign.public = true;

exports.CampaignAction = function () {
    if (!allowed()) return;
    var id = param('id');
    var kind = param('kind');
    post(function () {
        if (kind === 'create') return campaignHelpers.saveCampaign(null, campaignInput(), null, actor());
        if (kind === 'save') return campaignHelpers.saveCampaign(id, campaignInput(), param('revision') ? Number(param('revision')) : null, actor());
        if (kind === 'status') return campaignHelpers.changeCampaignStatus(id, param('action'), param('reason'), actor());
        if (kind === 'mailin') return require('*/cartridge/scripts/helpers/luckyDrawEntryHelpers').recordMailInEntry(id, { customerNo: param('customerNo'), reference: param('reference'), region: param('region') }, actor());
        return luckyDrawHelpers.errorResult('invalid', { kind: 'invalid' });
    }, function (result) {
        var campaignId = id || result.campaignId;
        return campaignId ? URLUtils.url('LuckyDrawAdmin-Campaign', 'id', campaignId) : URLUtils.url('LuckyDrawAdmin-Campaigns');
    });
};
exports.CampaignAction.public = true;

exports.Draws = function () {
    if (!allowed()) return;
    var campaignId = param('campaignId');
    var statuses = Object.keys(require('*/cartridge/scripts/helpers/luckyDrawDrawHelpers').EXECUTION_FLOW);
    var status = statuses.indexOf(param('status')) >= 0 ? param('status') : null;
    var query = [];
    var args = [];
    if (campaignId) {
        query.push('custom.campaignId = {' + args.length + '}');
        args.push(campaignId);
    }
    if (status) {
        query.push('custom.status = {' + args.length + '}');
        args.push(status);
    }
    var result = luckyDrawHelpers.queryPage('LuckyDrawExecution', query.length ? query.join(' AND ') : 'custom.status != {0}', 'custom.drawAt desc', query.length ? args : ['NONE'], 0, PAGE);
    render({
        title: 'Draws',
        sections: [
            { type: 'filter', links: statuses.map(function (s) { return { label: s, url: URLUtils.url('LuckyDrawAdmin-Draws', 'status', s, 'campaignId', campaignId).toString(), active: status === s }; }) },
            { type: 'table', columns: ['Execution', 'Campaign', 'Status', 'Draw at', 'Entries', 'Verification'], rows: result.items.map(function (x) {
                var c = x.custom;
                return { link: URLUtils.url('LuckyDrawAdmin-Draw', 'id', c.executionId).toString(), cells: [c.executionId, c.campaignId, c.status, when(c.drawAt), String(c.entryCount || 0), c.verification || ''] };
            }) }
        ]
    });
};
exports.Draws.public = true;

exports.Draw = function () {
    if (!allowed()) return;
    var drawHelpers = require('*/cartridge/scripts/helpers/luckyDrawDrawHelpers');
    var id = param('id');
    var record = CustomObjectMgr.getCustomObject('LuckyDrawExecution', id);
    if (!record) {
        render({ title: 'Draw not found', sections: [] });
        return;
    }
    var v = drawHelpers.getDrawView(record, true);
    var check = ['SELECTED', 'FINALIZED'].indexOf(v.status) >= 0 ? drawHelpers.verifyDraw(id) : null;
    var recomputed = 'not drawn yet';
    if (check) recomputed = check.ok ? 'matches' : 'MISMATCH: ' + check.problems.join(', ');
    var winners = luckyDrawHelpers.queryPage('LuckyDrawWinner', 'custom.executionId = {0}', 'custom.rank asc', [id], 0, 500).items;
    var rewards = luckyDrawHelpers.queryPage('LuckyDrawReward', 'custom.executionId = {0}', null, [id], 0, 500).items;
    var actionUrl = function (kind, target) { return URLUtils.url('LuckyDrawAdmin-DrawAction', 'id', id, 'kind', kind, 'target', target).toString(); };
    render({
        title: 'Draw ' + id,
        back: URLUtils.url('LuckyDrawAdmin-Draws', 'campaignId', v.campaignId).toString(),
        sections: [
            { type: 'kv', rows: [
                ['Status', v.status + (record.custom.failureReason ? ' (' + record.custom.failureReason + ')' : '')], ['Window', v.windowStart + ' - ' + v.windowEnd + ' (' + v.timeZone + ')'], ['Draw at', v.drawAtFormatted],
                ['Algorithm', v.algorithm], ['Random source', v.randomSource], ['Seed commitment', v.seedHash || ''], ['Committed at', when(v.committedAt)],
                ['Seed', v.seed || 'sealed until the draw is finished'], ['Snapshot hash', v.snapshotHash || ''], ['Entries / chances', v.entryCount + ' / ' + v.totalWeight],
                ['Result seal', record.custom.resultHash || ''], ['Recomputed now', recomputed]
            ] },
            { type: 'table', title: 'Winners and alternates', columns: ['Winner', 'Rank', 'Entry', 'Status', 'Prize', 'Customer'], rows: winners.map(function (w) {
                var c = w.custom;
                var actions = [];
                if (c.status === 'PENDING_VERIFICATION') actions.push(option('confirm', 'Confirm eligibility'));
                if (c.status === 'PENDING_VERIFICATION' || c.status === 'CONFIRMED') actions.push(option('disqualify', 'Disqualify (alternate takes over)'));
                return { cells: [c.winnerId, String(c.rank), c.entryId, c.status, c.prizeLabel || '', c.customerNo], form: actions.length ? { action: actionUrl('winner', c.winnerId), options: actions } : null };
            }) },
            { type: 'table', title: 'Rewards', columns: ['Reward', 'Status', 'Coupon', 'Issued', 'Expires', 'Attempts'], rows: rewards.map(function (rw) {
                var c = rw.custom;
                var actions = [];
                if (c.status === 'FAILED') actions.push(option('retry', 'Retry issuance'));
                if (['PENDING', 'FAILED', 'ISSUED'].indexOf(c.status) >= 0) actions.push(option('revoke', 'Withdraw'));
                return { cells: [c.rewardId, c.status, c.couponId, when(c.issuedAt), when(c.expiresAt), String(c.attempts || 0)], form: actions.length ? { action: actionUrl('reward', c.rewardId), options: actions } : null };
            }) }
        ]
    });
};
exports.Draw.public = true;

exports.DrawAction = function () {
    if (!allowed()) return;
    var id = param('id');
    post(function () {
        var target = param('target');
        var action = param('action');
        if (param('kind') !== 'winner') return require('*/cartridge/scripts/helpers/luckyDrawRewardHelpers').updateReward(target, action, param('reason'), actor());
        var drawHelpers = require('*/cartridge/scripts/helpers/luckyDrawDrawHelpers');
        if (action === 'confirm') return drawHelpers.confirmWinner(target, actor());
        if (action === 'disqualify') return drawHelpers.disqualifyWinner(target, param('reason'), actor());
        return luckyDrawHelpers.errorResult('invalid', { action: 'invalid' });
    }, function () { return URLUtils.url('LuckyDrawAdmin-Draw', 'id', id); });
};
exports.DrawAction.public = true;

exports.Entries = function () {
    if (!allowed()) return;
    var campaignId = param('campaignId');
    var orderNo = param('orderNo');
    var customerNo = param('customerNo');
    var flagged = param('flagged') === 'true';
    var query = [];
    var args = [];
    var add = function (clause, value) {
        query.push(clause.replace('?', '{' + args.length + '}'));
        args.push(value);
    };
    if (campaignId) add('custom.campaignId = ?', campaignId);
    // free entries use "yyyyMMdd:n" references, so an order number alone matches only order entries
    // and the search stays within the 4 custom attribute expressions a query may use
    if (orderNo) add('custom.sourceRef = ?', orderNo);
    if (customerNo) add('custom.customerNo = ?', customerNo);
    if (flagged) add('custom.flagged = ?', true);
    if (!query.length) add('custom.status != ?', 'NONE');
    var offset = Math.max(0, Math.floor(Number(param('offset')) || 0));
    var result = luckyDrawHelpers.queryPage('LuckyDrawEntry', query.join(' AND '), 'custom.createdAt desc', args, offset, PAGE);
    render({
        title: 'Entries',
        sections: [
            { type: 'form', title: 'Find', method: 'get', action: URLUtils.url('LuckyDrawAdmin-Entries').toString(), fields: [
                field('campaignId', 'Campaign', { value: campaignId }), field('orderNo', 'Order number', { value: orderNo }), field('customerNo', 'Customer number', { value: customerNo }),
                field('flagged', 'Only flagged', { type: 'select', options: [option('false', 'no'), option('true', 'yes')], value: flagged ? 'true' : 'false' })
            ], submit: 'Search' },
            { type: 'table', columns: ['Entry', 'Campaign', 'Source', 'Customer', 'Entries', 'Status', 'Flag', 'Created'], rows: result.items.map(function (e) {
                var c = e.custom;
                var actions = [];
                if (c.status === 'PENDING' || c.status === 'ACTIVE') actions.push(option('cancel', 'Cancel entry'));
                actions.push(c.flagged ? option('unflag', 'Clear fraud flag') : option('flag', 'Flag (left out of draws)'));
                return { cells: [c.entryId, c.campaignId, c.sourceType + ' ' + c.sourceRef, c.customerNo, String(c.entryCount), c.status + (c.reason ? ' (' + c.reason + ')' : ''), c.flagged ? 'flagged' : '', when(c.createdAt)], form: { action: URLUtils.url('LuckyDrawAdmin-EntryAction', 'id', c.entryId).toString(), options: actions } };
            }) },
            { type: 'pager', total: String(result.total), previous: offset > 0 ? URLUtils.url('LuckyDrawAdmin-Entries', 'offset', String(Math.max(0, offset - PAGE)), 'campaignId', campaignId).toString() : null, next: offset + PAGE < result.total ? URLUtils.url('LuckyDrawAdmin-Entries', 'offset', String(offset + PAGE), 'campaignId', campaignId).toString() : null }
        ]
    });
};
exports.Entries.public = true;

exports.EntryAction = function () {
    if (!allowed()) return;
    var id = param('id');
    var entry = CustomObjectMgr.getCustomObject('LuckyDrawEntry', id);
    post(function () {
        var entryHelpers = require('*/cartridge/scripts/helpers/luckyDrawEntryHelpers');
        var action = param('action');
        if (action === 'cancel') return entryHelpers.cancelEntry(id, param('reason'), actor());
        if (action === 'flag' || action === 'unflag') return entryHelpers.setEntryFlag(id, action === 'flag', param('reason'), actor());
        return luckyDrawHelpers.errorResult('invalid', { action: 'invalid' });
    }, function () { return URLUtils.url('LuckyDrawAdmin-Entries', 'campaignId', entry ? entry.custom.campaignId : ''); });
};
exports.EntryAction.public = true;

exports.Cases = function () {
    if (!allowed()) return;
    var status = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'].indexOf(param('status')) >= 0 ? param('status') : null;
    var result = status
        ? luckyDrawHelpers.queryPage('LuckyDrawCase', 'custom.status = {0}', 'custom.createdAt desc', [status], 0, PAGE)
        : luckyDrawHelpers.queryPage('LuckyDrawCase', 'custom.status = {0} OR custom.status = {1}', 'custom.createdAt asc', ['OPEN', 'IN_PROGRESS'], 0, PAGE);
    render({
        title: 'Lucky draw cases',
        sections: [
            { type: 'filter', links: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'].map(function (s) { return { label: s, url: URLUtils.url('LuckyDrawAdmin-Cases', 'status', s).toString(), active: status === s }; }) },
            { type: 'table', columns: ['Case', 'Type', 'Severity', 'Status', 'Campaign', 'Created'], rows: result.items.map(function (r) {
                var c = r.custom;
                return { link: URLUtils.url('LuckyDrawAdmin-Case', 'id', c.caseId).toString(), cells: [c.caseId, c.caseType, c.severity, c.status, c.campaignId || '', when(c.createdAt)] };
            }) }
        ]
    });
};
exports.Cases.public = true;

exports.Case = function () {
    if (!allowed()) return;
    var id = param('id');
    var record = CustomObjectMgr.getCustomObject('LuckyDrawCase', id);
    if (!record) {
        render({ title: 'Case not found', sections: [] });
        return;
    }
    var c = record.custom;
    render({
        title: 'Case ' + id + ' - ' + c.caseType,
        back: URLUtils.url('LuckyDrawAdmin-Cases').toString(),
        sections: [
            { type: 'kv', rows: [['Status', c.status], ['Severity', c.severity], ['Campaign', c.campaignId || ''], ['Entity', c.entityId || ''], ['Detail', c.detail || '']] },
            { type: 'table', title: 'Notes', columns: ['When', 'By', 'Note'], rows: luckyDrawHelpers.parseJson(c.notes, []).map(function (n) { return { cells: [n.at.slice(0, 16), n.by, n.text] }; }) },
            { type: 'form', title: 'Update', action: URLUtils.url('LuckyDrawAdmin-CaseAction', 'id', id).toString(), fields: [
                field('action', 'Action', { type: 'select', options: [option('note', 'Add note'), option('progress', 'In progress'), option('resolve', 'Resolve'), option('dismiss', 'Dismiss'), option('reopen', 'Reopen')] }),
                field('message', 'Note', { type: 'textarea' }),
                field('revision', '', { type: 'hidden', value: String(c.revision || 0) })
            ], submit: 'Apply' }
        ]
    });
};
exports.Case.public = true;

exports.CaseAction = function () {
    if (!allowed()) return;
    var id = param('id');
    post(function () {
        return luckyDrawHelpers.updateCase(id, param('action'), param('message'), param('revision') ? Number(param('revision')) : null, actor());
    }, function () { return URLUtils.url('LuckyDrawAdmin-Case', 'id', id); });
};
exports.CaseAction.public = true;

exports.Audit = function () {
    if (!allowed()) return;
    var campaignId = param('campaignId');
    var offset = Math.max(0, Math.floor(Number(param('offset')) || 0));
    var result = campaignId
        ? luckyDrawHelpers.queryPage('LuckyDrawAuditEvent', 'custom.campaignId = {0}', 'custom.occurredAt desc', [campaignId], offset, PAGE)
        : luckyDrawHelpers.queryPage('LuckyDrawAuditEvent', 'custom.occurredAt != NULL', 'custom.occurredAt desc', [], offset, PAGE);
    render({
        title: 'Lucky draw audit trail',
        sections: [
            { type: 'form', title: 'Filter', method: 'get', action: URLUtils.url('LuckyDrawAdmin-Audit').toString(), fields: [field('campaignId', 'Campaign', { value: campaignId })], submit: 'Filter' },
            { type: 'table', columns: ['When', 'Entity', 'Action', 'From', 'To', 'Actor', 'Reason'], rows: result.items.map(function (a) {
                var c = a.custom;
                return { cells: [when(c.occurredAt), c.entityType + ' ' + c.entityId, c.action, c.fromStatus || '', c.toStatus || '', c.actorType + ' ' + c.actorRef, c.reason || ''] };
            }) },
            { type: 'pager', total: String(result.total), previous: offset > 0 ? URLUtils.url('LuckyDrawAdmin-Audit', 'offset', String(Math.max(0, offset - PAGE)), 'campaignId', campaignId).toString() : null, next: offset + PAGE < result.total ? URLUtils.url('LuckyDrawAdmin-Audit', 'offset', String(offset + PAGE), 'campaignId', campaignId).toString() : null }
        ]
    });
};
exports.Audit.public = true;
