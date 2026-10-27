'use strict';

/**
 * Wallet accounts and their double-entry ledger.
 *
 * A customer has at most one wallet, keyed by customer number, and the wallet is always
 * resolved from the signed-in customer.
 *
 * Every money movement is one WalletJournal (key = idempotency key) with balanced postings,
 * plus one WalletEntry per affected wallet. An entry's key is "<walletId>:<next sequence>",
 * so two concurrent writers to the same wallet try to create the same key: the unique key
 * lets only one commit and the other transaction rolls back. The balance snapshot is updated
 * in that same transaction, so a balance is never spent twice and never becomes negative.
 * Journals and entries are never edited or deleted; corrections are new journals.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');
var walletHelpers = require('*/cartridge/scripts/helpers/walletHelpers');

var log = Logger.getLogger('plugin-wallet', 'wallet-transaction');
var DAY = 86400000;
var MAX_HOLDS_SCANNED = 2000;
var MAX_CENTS = 100000000000;

var WALLET_FLOW = {
    ACTIVE: ['LOCKED', 'FROZEN', 'CLOSED'],
    LOCKED: ['ACTIVE', 'FROZEN', 'CLOSED'],
    FROZEN: ['ACTIVE', 'CLOSED'],
    CLOSED: []
};

var SYSTEM_ACCOUNTS = {
    TOPUP_CLEARING: 'SYSTEM:TOPUP_CLEARING',
    SALES: 'SYSTEM:SALES',
    REFUNDS: 'SYSTEM:REFUNDS',
    CHARGEBACKS: 'SYSTEM:CHARGEBACKS',
    ADJUSTMENTS: 'SYSTEM:ADJUSTMENTS',
    EXPIRY: 'SYSTEM:EXPIRY'
};

// Balance effect per wallet (sign of the amount) and the system account on the other side.
var TRANSACTION_TYPES = {
    TOPUP: { available: 1, held: 0, counter: SYSTEM_ACCOUNTS.TOPUP_CLEARING },
    PURCHASE_HOLD: { available: -1, held: 1, counter: null },
    PURCHASE_CAPTURE: { available: 0, held: -1, counter: SYSTEM_ACCOUNTS.SALES },
    HOLD_RELEASE: { available: 1, held: -1, counter: null },
    REFUND: { available: 1, held: 0, counter: SYSTEM_ACCOUNTS.REFUNDS },
    REVERSAL: { available: -1, held: 0, counter: SYSTEM_ACCOUNTS.CHARGEBACKS },
    ADJUSTMENT: { available: 1, held: 0, counter: SYSTEM_ACCOUNTS.ADJUSTMENTS, signed: true },
    EXPIRY: { available: -1, held: 0, counter: SYSTEM_ACCOUNTS.EXPIRY },
    TRANSFER: { available: -1, held: 0, counter: null }
};

/**
 * @param {number} cents - candidate amount
 * @returns {boolean} true for a safe integer amount
 */
function isCents(cents) {
    return typeof cents === 'number' && Math.floor(cents) === cents && Math.abs(cents) <= MAX_CENTS;
}

/**
 * @param {dw.customer.Customer} customer - current customer
 * @returns {?string} customer number of a signed-in registered customer
 */
function getCustomerNo(customer) {
    return customer && customer.authenticated && customer.registered && customer.profile ? customer.profile.customerNo : null;
}

/**
 * Finds (and with `create`, opens on first use) the signed-in customer's own wallet.
 * @param {dw.customer.Customer} customer - current customer
 * @param {boolean} create - create the wallet when missing (only where the request may commit)
 * @returns {Object} {error: false, walletId, wallet, customerNo, actor}, or an error result
 */
function getWalletContext(customer, create) {
    if (!walletHelpers.isWalletEnabled()) return walletHelpers.errorResult('disabled');
    var customerNo = getCustomerNo(customer);
    if (!customerNo) return walletHelpers.errorResult('unauthenticated');
    var wallet = CustomObjectMgr.getCustomObject('WalletAccount', customerNo);
    if (!wallet && create) {
        Transaction.wrap(function () {
            wallet = CustomObjectMgr.getCustomObject('WalletAccount', customerNo) || CustomObjectMgr.createCustomObject('WalletAccount', customerNo);
            var c = wallet.custom;
            if (c.status) return;
            c.status = 'ACTIVE';
            c.availableCents = 0;
            c.heldCents = 0;
            c.sequence = 0;
            c.currency = 'USD';
            c.lockedCodeCount = 0;
            c.recentSessions = [];
            c.createdAt = new Date();
            c.revision = 0;
        });
    }
    if (!wallet) return walletHelpers.errorResult('not-found');
    return { error: false, walletId: customerNo, wallet: wallet, customerNo: customerNo, actor: walletHelpers.actor('OWNER', customerNo) };
}

/**
 * @param {dw.object.CustomObject} wallet - wallet
 * @returns {Object} owner view
 */
function getWalletView(wallet) {
    var c = wallet.custom;
    return {
        walletId: c.walletId,
        status: c.status,
        lockedReason: c.lockedReason || null,
        availableCents: c.availableCents || 0,
        heldCents: c.heldCents || 0,
        currency: 'USD',
        sandbox: walletHelpers.isSandbox(),
        maximumBalanceCents: walletHelpers.getPreference('walletMaximumBalanceCents'),
        revision: c.revision || 0
    };
}

/**
 * @param {dw.object.CustomObject} wallet - wallet
 * @returns {Object} result: locked unless the wallet is ACTIVE
 */
function checkWalletActive(wallet) {
    return wallet.custom.status === 'ACTIVE' ? { error: false } : walletHelpers.errorResult('locked', { status: wallet.custom.status });
}

/**
 * Sum of holds (active, in review or captured) created since a time, optionally per member.
 * @param {string} walletId - wallet
 * @param {Date} since - window start
 * @param {?string} memberCustomerNo - restrict to one member's payments
 * @returns {number} cents
 */
function getSpentSince(walletId, since, memberCustomerNo) {
    var query = 'custom.walletId = {0} AND custom.createdAt >= {1} AND custom.status != {2}';
    var args = [walletId, since, 'RELEASED'];
    if (memberCustomerNo) {
        query += ' AND custom.memberCustomerNo = {3}';
        args.push(memberCustomerNo);
    }
    return walletHelpers.queryPage('WalletHold', query, null, args, 0, MAX_HOLDS_SCANNED).items.reduce(function (total, h) {
        return total + h.custom.amountCents - (h.custom.refundedCents || 0);
    }, 0);
}

/**
 * @param {number} now - current time in ms
 * @returns {{day: Date, month: Date}} window starts (UTC)
 */
function getWindows(now) {
    var d = new Date(now);
    return {
        day: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())),
        month: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    };
}

/**
 * Wallet-level limits for a new payment. Family limits are checked separately.
 * @param {dw.object.CustomObject} wallet - wallet
 * @param {number} amountCents - payment
 * @returns {Object} result; limit-reached with fields.limit
 */
function checkSpendLimits(wallet, amountCents) {
    var w = getWindows(Date.now());
    var limit = null;
    if (amountCents > walletHelpers.getPreference('walletMaxTransactionCents')) limit = 'transaction';
    else if (getSpentSince(wallet.custom.walletId, w.day, null) + amountCents > walletHelpers.getPreference('walletDailySpendLimitCents')) limit = 'daily';
    else if (getSpentSince(wallet.custom.walletId, w.month, null) + amountCents > walletHelpers.getPreference('walletMonthlySpendLimitCents')) limit = 'monthly';
    return limit ? walletHelpers.errorResult('limit-reached', { limit: limit }) : { error: false };
}

/**
 * @param {dw.object.CustomObject} wallet - wallet
 * @param {string} to - LOCKED | FROZEN | ACTIVE | CLOSED
 * @param {string} reason - reason
 * @param {Object} by - who changed it
 * @returns {Object} result
 */
function setWalletStatus(wallet, to, reason, by) {
    var c = wallet.custom;
    var from = c.status;
    if (from === to) return { error: false };
    if (!walletHelpers.canMove(WALLET_FLOW, from, to)) return walletHelpers.errorResult('not-allowed-now');
    // A wallet frozen by an admin can only be unfrozen by an admin.
    if (from === 'FROZEN' && by.type !== 'ADMIN') return walletHelpers.errorResult('forbidden');
    Transaction.wrap(function () {
        c.status = to;
        c.lockedReason = to === 'ACTIVE' ? null : String(reason || '').slice(0, 200);
        c.lockedAt = to === 'ACTIVE' ? null : new Date();
        if (to === 'ACTIVE') c.lockedCodeCount = 0;
        c.revision = (c.revision || 0) + 1;
        walletHelpers.logAudit({ entityType: 'WALLET', entityId: c.walletId, walletId: c.walletId, action: 'STATUS', actor: by, from: from, to: to, reason: reason });
        walletHelpers.notify(c.walletId, to === 'ACTIVE' ? 'WALLET_UNLOCKED' : 'WALLET_LOCKED', {});
    });
    Logger.getLogger('plugin-wallet', 'wallet-security').info('Wallet {0} moved {1} -> {2}', c.walletId, from, to);
    return { error: false };
}

/**
 * Counts locked verification codes; after walletLockAfterLockedCodes the wallet locks itself.
 * @param {dw.object.CustomObject} wallet - wallet
 */
function recordLockedCode(wallet) {
    var count = (wallet.custom.lockedCodeCount || 0) + 1;
    Transaction.wrap(function () { wallet.custom.lockedCodeCount = count; });
    if (count >= walletHelpers.getPreference('walletLockAfterLockedCodes') && wallet.custom.status === 'ACTIVE') {
        setWalletStatus(wallet, 'LOCKED', 'too-many-failed-codes', walletHelpers.actor('SYSTEM', 'risk'));
        Transaction.wrap(function () {
            walletHelpers.openCase({ caseType: 'FAILED_CODES', walletId: wallet.custom.walletId, severity: 'HIGH', dedupeKey: 'codes:' + wallet.custom.walletId });
        });
    }
}

/**
 * @param {dw.object.CustomObject} wallet - wallet
 * @param {string} sessionRef - current session ID
 * @returns {boolean} true when this session completed a payment before
 */
function isKnownSession(wallet, sessionRef) {
    var hash = walletHelpers.sha256(sessionRef).slice(0, 32);
    return Array.prototype.slice.call(wallet.custom.recentSessions || []).indexOf(hash) >= 0;
}

/**
 * Remembers the session of a successful payment. Call inside a transaction.
 * @param {dw.object.CustomObject} wallet - wallet
 * @param {string} sessionRef - current session ID
 */
function rememberSession(wallet, sessionRef) {
    var hash = walletHelpers.sha256(sessionRef).slice(0, 32);
    var list = Array.prototype.slice.call(wallet.custom.recentSessions || []);
    if (list.indexOf(hash) >= 0) return;
    list.unshift(hash);
    wallet.custom.recentSessions = list.slice(0, walletHelpers.getPreference('walletRecentSessionsTracked')); // eslint-disable-line no-param-reassign
}

/**
 * @param {number} sequence - wallet sequence number
 * @returns {string} zero-padded sequence (sorts as text)
 */
function pad(sequence) {
    var text = String(sequence);
    while (text.length < 12) text = '0' + text;
    return text;
}

/**
 * Applies balance deltas to one wallet and writes its sequenced entry. Inside a transaction.
 * @param {dw.object.CustomObject} wallet - wallet account
 * @param {number} availableDelta - change of the available balance
 * @param {number} heldDelta - change of the held balance
 * @param {Object} meta - {journalId, txType, orderNo, memberCustomerNo, reference, actor}
 */
function applyToWallet(wallet, availableDelta, heldDelta, meta) {
    var c = wallet.custom;
    var available = (c.availableCents || 0) + availableDelta;
    var held = (c.heldCents || 0) + heldDelta;
    if (available < 0 || held < 0) throw walletHelpers.abort('insufficient-funds');
    var sequence = (c.sequence || 0) + 1;
    var entry;
    try {
        entry = CustomObjectMgr.createCustomObject('WalletEntry', c.walletId + ':' + pad(sequence));
    } catch (e) {
        // Another transaction took this sequence number first: the wallet changed under us.
        log.warn('Concurrent write on wallet {0} at sequence {1}', c.walletId, sequence);
        throw walletHelpers.abort('conflict');
    }
    var x = entry.custom;
    x.walletId = c.walletId;
    x.sequence = sequence;
    x.journalId = meta.journalId;
    x.txType = meta.txType;
    x.availableDeltaCents = availableDelta;
    x.heldDeltaCents = heldDelta;
    x.availableAfterCents = available;
    x.heldAfterCents = held;
    x.orderNo = meta.orderNo || null;
    x.memberCustomerNo = meta.memberCustomerNo || null;
    x.reference = meta.reference || null;
    x.actorType = meta.actor.type;
    x.actorRef = meta.actor.ref;
    x.createdAt = new Date();
    c.availableCents = available;
    c.heldCents = held;
    c.sequence = sequence;
    c.lastActivityAt = new Date();
}

/**
 * Posts one ledger transaction. Call inside the caller's Transaction.wrap: a refusal
 * throws (walletHelpers.abort) so the whole transaction rolls back.
 * @param {Object} tx - {key, txType, walletId, amountCents, orderNo, holdId, topUpId, memberCustomerNo,
 *   reference, actor, targetWalletId (TRANSFER), reason}
 * @returns {{journal: dw.object.CustomObject, replayed: boolean}} journal
 */
function postTransaction(tx) {
    var rule = TRANSACTION_TYPES[tx.txType];
    if (!rule) throw new Error('Unknown wallet transaction type ' + tx.txType);
    if (!isCents(tx.amountCents) || tx.amountCents === 0 || (!rule.signed && tx.amountCents < 0)) throw walletHelpers.abort('invalid');
    var existing = CustomObjectMgr.getCustomObject('WalletJournal', tx.key);
    if (existing) {
        if (existing.custom.amountCents !== tx.amountCents || existing.custom.walletId !== tx.walletId || existing.custom.txType !== tx.txType) {
            log.error('Wallet journal {0} replayed with different data', tx.key);
            throw walletHelpers.abort('conflict');
        }
        return { journal: existing, replayed: true };
    }
    var wallet = CustomObjectMgr.getCustomObject('WalletAccount', tx.walletId);
    if (!wallet) throw walletHelpers.abort('not-found');
    var abs = Math.abs(tx.amountCents);
    var direction = rule.signed && tx.amountCents < 0 ? -1 : 1;
    var meta = { journalId: tx.key, txType: tx.txType, orderNo: tx.orderNo, memberCustomerNo: tx.memberCustomerNo, reference: tx.reference, actor: tx.actor };
    var postings = [];
    var addPosting = function (account, delta) {
        if (delta > 0) postings.push({ account: account, debitCents: 0, creditCents: delta });
        if (delta < 0) postings.push({ account: account, debitCents: -delta, creditCents: 0 });
    };
    var availableDelta = rule.available * abs * direction;
    var heldDelta = rule.held * abs * direction;
    applyToWallet(wallet, availableDelta, heldDelta, meta);
    addPosting('WALLET:' + tx.walletId + ':AVAILABLE', availableDelta);
    addPosting('WALLET:' + tx.walletId + ':HELD', heldDelta);
    var walletNet = availableDelta + heldDelta;
    if (tx.txType === 'TRANSFER') {
        var target = CustomObjectMgr.getCustomObject('WalletAccount', String(tx.targetWalletId || ''));
        if (!target || tx.targetWalletId === tx.walletId) throw walletHelpers.abort('invalid');
        applyToWallet(target, abs, 0, meta);
        addPosting('WALLET:' + tx.targetWalletId + ':AVAILABLE', abs);
        walletNet += abs;
    }
    if (rule.counter) addPosting(rule.counter, -walletNet);
    var debits = postings.reduce(function (sum, p) { return sum + p.debitCents; }, 0);
    var credits = postings.reduce(function (sum, p) { return sum + p.creditCents; }, 0);
    if (debits !== credits) throw new Error('Unbalanced wallet journal ' + tx.key);
    var journal = CustomObjectMgr.createCustomObject('WalletJournal', tx.key);
    var j = journal.custom;
    j.walletId = tx.walletId;
    j.targetWalletId = tx.targetWalletId || null;
    j.txType = tx.txType;
    j.amountCents = tx.amountCents;
    j.currency = 'USD';
    j.postings = JSON.stringify(postings);
    j.orderNo = tx.orderNo || null;
    j.holdId = tx.holdId || null;
    j.topUpId = tx.topUpId || null;
    j.memberCustomerNo = tx.memberCustomerNo || null;
    j.reference = tx.reference || null;
    j.reason = tx.reason ? String(tx.reason).slice(0, 500) : null;
    j.actorType = tx.actor.type;
    j.actorRef = tx.actor.ref;
    j.createdAt = new Date();
    return { journal: journal, replayed: false };
}

/**
 * @param {dw.object.CustomObject} entry - wallet entry
 * @returns {Object} view for history pages and the API
 */
function getEntryView(entry) {
    var c = entry.custom;
    return {
        sequence: c.sequence,
        txType: c.txType,
        availableDeltaCents: c.availableDeltaCents,
        heldDeltaCents: c.heldDeltaCents,
        availableAfterCents: c.availableAfterCents,
        heldAfterCents: c.heldAfterCents,
        orderNo: c.orderNo || null,
        createdAt: c.createdAt,
        byMember: !!c.memberCustomerNo
    };
}

/**
 * @param {string} walletId - wallet
 * @param {?string} txType - filter
 * @param {number} offset - rows to skip
 * @param {number} limit - page size
 * @returns {{items: Object[], total: number}} history page, newest first
 */
function getHistory(walletId, txType, offset, limit) {
    var query = 'custom.walletId = {0}';
    var args = [walletId];
    if (txType && TRANSACTION_TYPES[txType]) {
        query += ' AND custom.txType = {1}';
        args.push(txType);
    }
    var page = walletHelpers.queryPage('WalletEntry', query, 'custom.sequence desc', args, offset, limit);
    return { items: page.items.map(getEntryView), total: page.total };
}

/**
 * Replays a wallet's entries and compares them with its balance snapshot.
 * @param {dw.object.CustomObject} wallet - wallet
 * @param {number} maxEntries - safety bound
 * @returns {{ok: boolean, available: number, held: number, gaps: number, truncated: boolean}} result
 */
function replayWallet(wallet, maxEntries) {
    var result = { ok: true, available: 0, held: 0, gaps: 0, truncated: false };
    var expected = 1;
    var page = walletHelpers.queryPage('WalletEntry', 'custom.walletId = {0}', 'custom.sequence asc', [wallet.custom.walletId], 0, maxEntries);
    page.items.forEach(function (e) {
        if (e.custom.sequence !== expected) result.gaps += 1;
        expected = e.custom.sequence + 1;
        result.available += e.custom.availableDeltaCents;
        result.held += e.custom.heldDeltaCents;
        if (e.custom.availableAfterCents !== result.available || e.custom.heldAfterCents !== result.held) result.ok = false;
    });
    result.truncated = page.total > maxEntries;
    if (!result.truncated) {
        result.ok = result.ok && result.gaps === 0
            && result.available === (wallet.custom.availableCents || 0)
            && result.held === (wallet.custom.heldCents || 0)
            && page.items.length === (wallet.custom.sequence || 0);
    }
    return result;
}

/**
 * @param {dw.object.CustomObject} journal - journal
 * @returns {boolean} true when debits equal credits
 */
function isBalanced(journal) {
    var postings = walletHelpers.parseJson(journal.custom.postings, []);
    var debits = postings.reduce(function (sum, p) { return sum + p.debitCents; }, 0);
    var credits = postings.reduce(function (sum, p) { return sum + p.creditCents; }, 0);
    return postings.length >= 2 && debits === credits;
}

/**
 * @param {string} reason - entered reason
 * @returns {?string} cleaned reason, or null when shorter than 10 characters
 */
function getAdminReason(reason) {
    var text = walletHelpers.cleanText(reason);
    return text.length >= 10 ? text.slice(0, 500) : null;
}

/**
 * Business Manager correction: a new, reasoned ledger transaction.
 * @param {string} walletId - wallet
 * @param {number} amountCents - signed amount (credit > 0, debit < 0)
 * @param {string} reason - reason (at least 10 characters)
 * @param {Object} by - admin actor
 * @returns {Object} result with journalId
 */
function adjustBalance(walletId, amountCents, reason, by) {
    if (!CustomObjectMgr.getCustomObject('WalletAccount', String(walletId))) return walletHelpers.errorResult('not-found');
    if (!isCents(amountCents) || amountCents === 0 || Math.abs(amountCents) > walletHelpers.getPreference('walletAdjustmentMaxCents')) return walletHelpers.errorResult('invalid', { amount: 'out-of-range' });
    var text = getAdminReason(reason);
    if (!text) return walletHelpers.errorResult('invalid', { reason: 'required' });
    var key = 'ADJ:' + walletHelpers.randomHex(12);
    try {
        Transaction.wrap(function () {
            postTransaction({ key: key, txType: 'ADJUSTMENT', walletId: walletId, amountCents: amountCents, reason: text, actor: by });
            walletHelpers.logAudit({ entityType: 'WALLET', entityId: walletId, walletId: walletId, action: 'ADJUST', actor: by, reason: text, detail: { amountCents: amountCents } });
            walletHelpers.notify(walletId, 'WALLET_ADJUSTED', { amount: walletHelpers.formatCents(amountCents) });
        });
    } catch (e) {
        return walletHelpers.toErrorResult(e);
    }
    return { error: false, journalId: key };
}

/**
 * Moves available balance between two wallets (for example when accounts are merged).
 * @param {string} fromWalletId - source wallet
 * @param {string} toWalletId - target wallet
 * @param {number} amountCents - amount
 * @param {string} reason - reason (at least 10 characters)
 * @param {Object} by - admin actor
 * @returns {Object} result with journalId
 */
function transferBalance(fromWalletId, toWalletId, amountCents, reason, by) {
    if (!isCents(amountCents) || amountCents <= 0 || amountCents > walletHelpers.getPreference('walletAdjustmentMaxCents')) return walletHelpers.errorResult('invalid', { amount: 'out-of-range' });
    var text = getAdminReason(reason);
    if (!text) return walletHelpers.errorResult('invalid', { reason: 'required' });
    var key = 'XFER:' + walletHelpers.randomHex(12);
    try {
        Transaction.wrap(function () {
            postTransaction({ key: key, txType: 'TRANSFER', walletId: fromWalletId, targetWalletId: toWalletId, amountCents: amountCents, reason: text, actor: by });
            walletHelpers.logAudit({ entityType: 'WALLET', entityId: fromWalletId, walletId: fromWalletId, action: 'TRANSFER', actor: by, reason: text, detail: { to: toWalletId, amountCents: amountCents } });
        });
    } catch (e) {
        return walletHelpers.toErrorResult(e);
    }
    return { error: false, journalId: key };
}

/**
 * @returns {{wallets: number, availableCents: number, heldCents: number}} total stored-value liability
 */
function getLiability() {
    // the platform rejects NULL comparisons on the key attribute, so read every wallet
    var iterator = CustomObjectMgr.getAllCustomObjects('WalletAccount');
    var result = { wallets: 0, availableCents: 0, heldCents: 0 };
    try {
        while (iterator.hasNext()) {
            var w = iterator.next();
            result.wallets += 1;
            result.availableCents += w.custom.availableCents || 0;
            result.heldCents += w.custom.heldCents || 0;
        }
    } finally {
        iterator.close();
    }
    return result;
}

/**
 * Monthly spending insights for the owner, computed from the wallet's own entries.
 * @param {string} walletId - wallet
 * @param {number} months - months back, including the current one
 * @returns {Object[]} {month: "YYYY-MM", topUpCents, spentCents, refundCents, familySpentCents}, newest first
 */
function getMonthlyInsights(walletId, months) {
    var now = new Date();
    var buckets = {};
    var order = [];
    for (var i = 0; i < months; i++) {
        var key = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7);
        buckets[key] = { month: key, topUpCents: 0, spentCents: 0, refundCents: 0, familySpentCents: 0 };
        order.push(key);
    }
    var since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1));
    walletHelpers.queryPage('WalletEntry', 'custom.walletId = {0} AND custom.createdAt >= {1}', null, [walletId, since], 0, 3000).items.forEach(function (e) {
        var bucket = buckets[e.custom.createdAt.toISOString().slice(0, 7)];
        if (!bucket) return;
        if (e.custom.txType === 'TOPUP') bucket.topUpCents += e.custom.availableDeltaCents;
        if (e.custom.txType === 'PURCHASE_CAPTURE') {
            bucket.spentCents -= e.custom.heldDeltaCents;
            if (e.custom.memberCustomerNo) bucket.familySpentCents -= e.custom.heldDeltaCents;
        }
        if (e.custom.txType === 'REFUND') bucket.refundCents += e.custom.availableDeltaCents;
    });
    return order.map(function (k) { return buckets[k]; });
}

module.exports = {
    DAY: DAY,
    WALLET_FLOW: WALLET_FLOW,
    TRANSACTION_TYPES: TRANSACTION_TYPES,
    isCents: isCents,
    getCustomerNo: getCustomerNo,
    getWalletContext: getWalletContext,
    getWalletView: getWalletView,
    checkWalletActive: checkWalletActive,
    getSpentSince: getSpentSince,
    getWindows: getWindows,
    checkSpendLimits: checkSpendLimits,
    setWalletStatus: setWalletStatus,
    recordLockedCode: recordLockedCode,
    isKnownSession: isKnownSession,
    rememberSession: rememberSession,
    postTransaction: postTransaction,
    getEntryView: getEntryView,
    getHistory: getHistory,
    replayWallet: replayWallet,
    isBalanced: isBalanced,
    adjustBalance: adjustBalance,
    transferBalance: transferBalance,
    getLiability: getLiability,
    getMonthlyInsights: getMonthlyInsights
};
