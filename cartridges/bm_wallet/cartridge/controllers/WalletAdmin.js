'use strict';

/**
 * Business Manager desk of the wallet (Merchant Tools > Wallet). Nodes are grouped under
 * permission-scoped menu actions in bm_extensions.xml. Every change is a CSRF-protected POST,
 * recorded with the BM user name, and money only moves through new ledger transactions.
 */

var ISML = require('dw/template/ISML');
var URLUtils = require('dw/web/URLUtils');
var CSRFProtection = require('dw/web/CSRFProtection');
var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Logger = require('dw/system/Logger');
var walletHelpers = require('*/cartridge/scripts/helpers/walletHelpers');
var accountHelpers = require('*/cartridge/scripts/helpers/walletAccountHelpers');

var log = Logger.getLogger('plugin-wallet', 'wallet-admin');
var PAGE = 50;
var REQUIRED_PREFERENCES = ['walletCurrency', 'walletFromEmail', 'walletAdminNotificationEmails'];

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
    return walletHelpers.actor('ADMIN', session.userName);
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
 * @returns {string} date and time to the minute
 */
function when(date) {
    return date ? date.toISOString().slice(0, 16).replace('T', ' ') : '';
}

/**
 * @param {number} cents - amount
 * @returns {string} USD
 */
function usd(cents) {
    return typeof cents === 'number' ? walletHelpers.formatCents(cents) : '';
}

/**
 * @param {Object} model - {title, back, sections}
 */
function render(model) {
    model.message = param('message');
    model.error = param('error');
    model.csrf = { name: CSRFProtection.getTokenName(), token: CSRFProtection.generateToken() };
    model.enabled = walletHelpers.isWalletEnabled();
    ISML.renderTemplate('walletadmin/page', { model: model });
}

/**
 * Runs a POST action and redirects with the outcome.
 * @param {Function} fn - performs the action and returns a result object
 * @param {dw.web.URL} back - return URL
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
        log.error('Wallet desk action failed: {0}', e.message);
        result = walletHelpers.errorResult('general');
    }
    if (!result.error) {
        response.redirect(back.append('message', 'done'));
        return;
    }
    response.redirect(back.append('error', result.errorCode + (result.fields ? ' ' + JSON.stringify(result.fields).slice(0, 200) : '')));
}

/**
 * @param {string} type - custom object type
 * @param {string} query - query
 * @param {Array} args - arguments
 * @returns {string} number of matching records
 */
function count(type, query, args) {
    return String(walletHelpers.queryCount(type, query, args));
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

exports.Home = function () {
    if (!allowed()) return;
    var total = accountHelpers.getLiability();
    var problems = REQUIRED_PREFERENCES.filter(function (id) {
        var value = walletHelpers.getPreference(id);
        return !value || value.length === 0;
    });
    if (walletHelpers.getPreference('walletTopUpMinimumCents') > walletHelpers.getPreference('walletTopUpMaximumCents')) problems.push('walletTopUpMinimumCents (greater than the maximum)');
    if (!walletHelpers.isSandbox() && walletHelpers.getPreference('walletLiveMoneyApproved') !== true) problems.push('walletLiveMoneyApproved (EXTERNAL gateway without approval)');
    var expiryDays = walletHelpers.getPreference('walletFundsExpiryDays');
    if (expiryDays && expiryDays < 1825) problems.push('walletFundsExpiryDays (0 or at least 1825)');
    render({
        title: 'Wallet',
        sections: [
            { type: 'notice', text: walletHelpers.isSandbox() ? 'Sandbox mode - Not for Live Money. Balances have no cash value.' : 'External gateway mode. Live money requires the regulatory sign-off recorded in walletLiveMoneyApproved.' },
            { type: 'kv', title: 'Stored value', rows: [
                ['Wallets', String(total.wallets)],
                ['Available balances', usd(total.availableCents)],
                ['Held for orders', usd(total.heldCents)]
            ] },
            { type: 'kv', title: 'Attention', rows: [
                ['Open cases', count('WalletCase', 'custom.status = {0} OR custom.status = {1}', ['OPEN', 'IN_PROGRESS'])],
                ['Holds in review', count('WalletHold', 'custom.status = {0}', ['REVIEW'])],
                ['Top-ups waiting for payment', count('WalletTopUp', 'custom.status = {0}', ['AWAITING_PAYMENT'])],
                ['Locked or frozen wallets', count('WalletAccount', 'custom.status = {0} OR custom.status = {1}', ['LOCKED', 'FROZEN'])]
            ] },
            { type: 'kv', title: 'Configuration', rows: [
                ['Enabled (USD)', walletHelpers.isWalletEnabled() ? 'yes' : 'no'],
                ['Top-ups allowed', walletHelpers.canTopUp() ? 'yes' : 'no'],
                ['Gateway', walletHelpers.isSandbox() ? 'SANDBOX' : 'EXTERNAL'],
                ['Family wallet', walletHelpers.getPreference('walletFamilyEnabled') === true ? 'on' : 'off'],
                ['Preference problems', problems.length ? problems.join(', ') : 'none']
            ] }
        ]
    });
};
exports.Home.public = true;

exports.Wallets = function () {
    if (!allowed()) return;
    var customerNo = param('customerNo');
    var status = ['ACTIVE', 'LOCKED', 'FROZEN', 'CLOSED'].indexOf(param('status')) >= 0 ? param('status') : null;
    var offset = Math.max(0, Math.floor(Number(param('offset')) || 0));
    var result;
    if (customerNo) {
        var one = CustomObjectMgr.getCustomObject('WalletAccount', customerNo);
        result = { items: one ? [one] : [], total: one ? 1 : 0 };
    } else {
        result = walletHelpers.queryPage('WalletAccount', status ? 'custom.status = {0}' : 'custom.status != {0}', 'custom.lastActivityAt desc', [status || 'CLOSED'], offset, PAGE);
    }
    render({
        title: 'Wallets',
        sections: [
            { type: 'form', title: 'Find', method: 'get', action: URLUtils.url('WalletAdmin-Wallets').toString(), fields: [field('customerNo', 'Customer number', { value: customerNo })], submit: 'Search' },
            { type: 'filter', links: ['ACTIVE', 'LOCKED', 'FROZEN', 'CLOSED'].map(function (s) { return { label: s, url: URLUtils.url('WalletAdmin-Wallets', 'status', s).toString(), active: status === s }; }) },
            { type: 'table', columns: ['Customer', 'Status', 'Available', 'Held', 'Last activity'], rows: result.items.map(function (w) {
                var c = w.custom;
                return { link: URLUtils.url('WalletAdmin-Wallet', 'id', c.walletId).toString(), cells: [c.walletId, c.status, usd(c.availableCents), usd(c.heldCents), when(c.lastActivityAt)] };
            }) },
            { type: 'pager', total: String(result.total), previous: offset > 0 ? URLUtils.url('WalletAdmin-Wallets', 'offset', String(Math.max(0, offset - PAGE))).toString() : null, next: offset + PAGE < result.total ? URLUtils.url('WalletAdmin-Wallets', 'offset', String(offset + PAGE)).toString() : null }
        ]
    });
};
exports.Wallets.public = true;

exports.Wallet = function () {
    if (!allowed()) return;
    var id = param('id');
    var wallet = CustomObjectMgr.getCustomObject('WalletAccount', id);
    if (!wallet) {
        render({ title: 'Wallet not found', sections: [] });
        return;
    }
    var c = wallet.custom;
    var holds = walletHelpers.queryPage('WalletHold', 'custom.walletId = {0}', 'custom.createdAt desc', [id], 0, 20).items;
    var topUps = walletHelpers.queryPage('WalletTopUp', 'custom.walletId = {0}', 'custom.createdAt desc', [id], 0, 20).items;
    var members = require('*/cartridge/scripts/helpers/walletFamilyHelpers').getMembers(id);
    var replay = accountHelpers.replayWallet(wallet, 20000);
    var replayText = replay.ok ? 'matches the balance' : 'MISMATCH';
    if (replay.truncated) replayText = 'too many entries to replay here';
    var actionUrl = URLUtils.url('WalletAdmin-WalletAction', 'id', id).toString();
    render({
        title: 'Wallet ' + id,
        back: URLUtils.url('WalletAdmin-Wallets').toString(),
        sections: [
            { type: 'kv', rows: [['Status', c.status + (c.lockedReason ? ' (' + c.lockedReason + ')' : '')], ['Available', usd(c.availableCents)], ['Held', usd(c.heldCents)], ['Chargeback shortfall', usd(c.shortfallCents || 0)], ['Entries', String(c.sequence || 0)], ['Ledger replay', replayText], ['Created', when(c.createdAt)]] },
            { type: 'form', title: 'Status', action: actionUrl, fields: [
                field('kind', '', { type: 'hidden', value: 'status' }),
                field('status', 'New status', { type: 'select', options: [option('FROZEN', 'Freeze'), option('ACTIVE', 'Reactivate'), option('LOCKED', 'Lock'), option('CLOSED', 'Close')] }),
                field('reason', 'Reason', { type: 'textarea', required: true })
            ], submit: 'Apply' },
            { type: 'form', title: 'Adjustment (new ledger transaction)', action: actionUrl, fields: [
                field('kind', '', { type: 'hidden', value: 'adjust' }),
                field('amount', 'Amount in USD (negative to debit)', { required: true }),
                field('reason', 'Reason (at least 10 characters)', { type: 'textarea', required: true })
            ], submit: 'Book adjustment' },
            { type: 'form', title: 'Refund to wallet', action: actionUrl, fields: [
                field('kind', '', { type: 'hidden', value: 'refund' }),
                field('refundKind', 'Type', { type: 'select', options: [option('WALLET_PORTION', 'Refund of a wallet payment (hold)'), option('STORE_CREDIT', 'Card refund as wallet credit (if allowed)')] }),
                field('holdId', 'Hold ID (wallet payment)'),
                field('orderNo', 'Order number'),
                field('amount', 'Amount in USD', { required: true }),
                field('reason', 'Reason', { type: 'textarea' })
            ], submit: 'Refund' },
            { type: 'table', title: 'Recent activity', columns: ['#', 'When', 'Type', 'Available', 'Held', 'Order', 'By'], rows: accountHelpers.getHistory(id, null, 0, 30).items.map(function (e) {
                return { cells: [String(e.sequence), when(e.createdAt), e.txType, usd(e.availableDeltaCents), usd(e.heldDeltaCents), e.orderNo || '', e.byMember ? 'family member' : ''] };
            }) },
            { type: 'table', title: 'Holds', columns: ['Hold', 'Order', 'Amount', 'Captured', 'Refunded', 'Status', 'Created'], rows: holds.map(function (h) {
                var x = h.custom;
                return { cells: [x.holdId, x.orderNo, usd(x.amountCents), usd(x.capturedCents), usd(x.refundedCents), x.status, when(x.createdAt)] };
            }) },
            { type: 'table', title: 'Top-ups', columns: ['Top-up', 'Amount', 'Status', 'Reference', 'Created'], rows: topUps.map(function (t) {
                var x = t.custom;
                return { cells: [x.topUpId, usd(x.amountCents), x.status, x.providerReference || '', when(x.createdAt)] };
            }) },
            { type: 'form', title: 'Reverse a top-up (chargeback)', action: actionUrl, fields: [
                field('kind', '', { type: 'hidden', value: 'reverse' }),
                field('topUpId', 'Top-up ID', { required: true }),
                field('amount', 'Amount in USD', { required: true }),
                field('reference', 'Provider reference')
            ], submit: 'Reverse' },
            { type: 'table', title: 'Family members', columns: ['Customer', 'Name', 'Status', 'Per order', 'Daily', 'Monthly'], rows: members.map(function (m) {
                var x = m.custom;
                return { cells: [x.customerNo, x.nickname, x.status, usd(x.perOrderLimitCents), usd(x.dailyLimitCents), usd(x.monthlyLimitCents)] };
            }) },
            { type: 'links', links: [{ label: 'Audit trail', url: URLUtils.url('WalletAdmin-Audit', 'walletId', id).toString() }] }
        ]
    });
};
exports.Wallet.public = true;

exports.WalletAction = function () {
    if (!allowed()) return;
    var id = param('id');
    post(function () {
        var kind = param('kind');
        var amount = walletHelpers.toSignedCents(param('amount'));
        if (kind !== 'status' && amount === null) return walletHelpers.errorResult('invalid', { amount: 'invalid' });
        if (kind === 'status') {
            var wallet = CustomObjectMgr.getCustomObject('WalletAccount', id);
            if (!wallet) return walletHelpers.errorResult('not-found');
            if (param('reason').length < 5) return walletHelpers.errorResult('invalid', { reason: 'required' });
            return accountHelpers.setWalletStatus(wallet, param('status'), param('reason'), actor());
        }
        if (kind === 'adjust') return accountHelpers.adjustBalance(id, amount, param('reason'), actor());
        if (kind === 'refund') {
            return require('*/cartridge/scripts/helpers/walletPaymentHelpers').refundToWallet({
                refundId: 'BM-' + walletHelpers.randomHex(12),
                kind: param('refundKind'), holdId: param('holdId'), orderNo: param('orderNo'), walletId: id, amountCents: amount, reason: param('reason')
            }, actor());
        }
        if (kind === 'reverse') return require('*/cartridge/scripts/helpers/walletTopUpHelpers').reverseTopUp(param('topUpId'), amount, param('reference'), actor());
        return walletHelpers.errorResult('invalid', { kind: 'invalid' });
    }, URLUtils.url('WalletAdmin-Wallet', 'id', id));
};
exports.WalletAction.public = true;

exports.Cases = function () {
    if (!allowed()) return;
    var status = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'].indexOf(param('status')) >= 0 ? param('status') : null;
    var result = status
        ? walletHelpers.queryPage('WalletCase', 'custom.status = {0}', 'custom.createdAt desc', [status], 0, PAGE)
        : walletHelpers.queryPage('WalletCase', 'custom.status = {0} OR custom.status = {1}', 'custom.createdAt asc', ['OPEN', 'IN_PROGRESS'], 0, PAGE);
    render({
        title: 'Wallet cases',
        sections: [
            { type: 'filter', links: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'].map(function (s) { return { label: s, url: URLUtils.url('WalletAdmin-Cases', 'status', s).toString(), active: status === s }; }) },
            { type: 'table', columns: ['Case', 'Type', 'Severity', 'Status', 'Wallet', 'Created'], rows: result.items.map(function (r) {
                var c = r.custom;
                return { link: URLUtils.url('WalletAdmin-Case', 'id', c.caseId).toString(), cells: [c.caseId, c.caseType, c.severity, c.status, c.walletId || '', when(c.createdAt)] };
            }) }
        ]
    });
};
exports.Cases.public = true;

exports.Case = function () {
    if (!allowed()) return;
    var id = param('id');
    var record = CustomObjectMgr.getCustomObject('WalletCase', id);
    if (!record) {
        render({ title: 'Case not found', sections: [] });
        return;
    }
    var c = record.custom;
    render({
        title: 'Case ' + id + ' - ' + c.caseType,
        back: URLUtils.url('WalletAdmin-Cases').toString(),
        sections: [
            { type: 'kv', rows: [['Status', c.status], ['Severity', c.severity], ['Wallet', c.walletId || ''], ['Entity', c.entityId || ''], ['Detail', c.detail || '']] },
            { type: 'links', links: c.walletId ? [{ label: 'Open wallet', url: URLUtils.url('WalletAdmin-Wallet', 'id', c.walletId).toString() }] : [] },
            { type: 'table', title: 'Notes', columns: ['When', 'By', 'Note'], rows: walletHelpers.parseJson(c.notes, []).map(function (n) { return { cells: [n.at.slice(0, 16), n.by, n.text] }; }) },
            { type: 'form', title: 'Update', action: URLUtils.url('WalletAdmin-CaseAction', 'id', id).toString(), fields: [
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
        return walletHelpers.updateCase(id, param('action'), param('message'), param('revision') ? Number(param('revision')) : null, actor());
    }, URLUtils.url('WalletAdmin-Case', 'id', id));
};
exports.CaseAction.public = true;

exports.Audit = function () {
    if (!allowed()) return;
    var walletId = param('walletId');
    var offset = Math.max(0, Math.floor(Number(param('offset')) || 0));
    var result = walletId
        ? walletHelpers.queryPage('WalletAuditEvent', 'custom.walletId = {0}', 'custom.occurredAt desc', [walletId], offset, PAGE)
        : walletHelpers.queryPage('WalletAuditEvent', 'custom.occurredAt != NULL', 'custom.occurredAt desc', [], offset, PAGE);
    render({
        title: 'Wallet audit trail',
        sections: [
            { type: 'form', title: 'Filter', method: 'get', action: URLUtils.url('WalletAdmin-Audit').toString(), fields: [field('walletId', 'Wallet (customer number)', { value: walletId })], submit: 'Filter' },
            { type: 'table', columns: ['When', 'Entity', 'Action', 'From', 'To', 'Actor', 'Reason'], rows: result.items.map(function (a) {
                var c = a.custom;
                return { cells: [when(c.occurredAt), c.entityType + ' ' + c.entityId, c.action, c.fromStatus || '', c.toStatus || '', c.actorType + ' ' + c.actorRef, c.reason || ''] };
            }) },
            { type: 'pager', total: String(result.total), previous: offset > 0 ? URLUtils.url('WalletAdmin-Audit', 'offset', String(Math.max(0, offset - PAGE)), 'walletId', walletId).toString() : null, next: offset + PAGE < result.total ? URLUtils.url('WalletAdmin-Audit', 'offset', String(offset + PAGE), 'walletId', walletId).toString() : null }
        ]
    });
};
exports.Audit.public = true;
