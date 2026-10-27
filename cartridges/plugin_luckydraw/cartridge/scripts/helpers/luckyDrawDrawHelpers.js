'use strict';

/**
 * Draw executions, one per campaign window (key "<campaignId>_<windowKey>", unique, so a
 * window can never be drawn twice).
 *
 *   SCHEDULED  created when the window opens: the seed is generated and its SHA-256 is
 *              published (commitment), before any entry of the window is known
 *   FROZEN     after the draw time: entries re-validated, snapshot written to a WebDAV file
 *              and its hash stored
 *   SELECTED   winners and alternates computed from seed + snapshot and stored
 *   FINALIZED  rewards created, other window entries marked NOT_SELECTED, result sealed
 *   VOID       no eligible entry; FAILED resumes from the last finished phase
 *
 * Each phase runs under an exclusive lock record and is idempotent, so concurrent or repeated
 * job runs cannot select extra winners.
 *
 * Selection, algorithm "ld-hmac-sha256-v1", is deterministic given the seed and the frozen
 * snapshot, so anyone holding both can recompute the result, and a job that crashed half way
 * recomputes the same winners instead of drawing new ones.
 *   Snapshot: one line per item, "entryId,participant,weight", sorted by entryId (random IDs,
 *     so the order is unrelated to database order). snapshotHash = SHA-256 of the text.
 *   Draw k: x = first 52 bits of HMAC-SHA256(key = seed, data = snapshotHash + ":" + counter),
 *     retried with the next counter while x >= floor(2^52 / W) * W (no modulo bias), then
 *     ticket = x mod W, where W is the remaining total weight. The item whose cumulative weight
 *     range holds the ticket wins, and every item of that participant leaves the pool, so a
 *     participant wins at most once per draw.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');
var luckyDrawHelpers = require('*/cartridge/scripts/helpers/luckyDrawHelpers');
var campaignHelpers = require('*/cartridge/scripts/helpers/luckyDrawCampaignHelpers');
var entryHelpers = require('*/cartridge/scripts/helpers/luckyDrawEntryHelpers');

var log = Logger.getLogger('plugin-luckydraw', 'luckydraw-execution');
var SYSTEM = luckyDrawHelpers.actor('SYSTEM', 'draw-job');
var ALGORITHM = 'ld-hmac-sha256-v1';
var RANGE = 4503599627370496; // 2^52, the largest power of two below Number.MAX_SAFE_INTEGER
var EXECUTION_FLOW = {
    SCHEDULED: ['FROZEN', 'VOID', 'FAILED', 'CANCELLED'],
    FROZEN: ['SELECTED', 'FAILED', 'CANCELLED'],
    SELECTED: ['FINALIZED', 'FAILED'],
    FAILED: ['FROZEN', 'SELECTED', 'FINALIZED', 'VOID', 'CANCELLED'],
    FINALIZED: [],
    VOID: [],
    CANCELLED: []
};
var WINNER_FLOW = {
    ALTERNATE: ['PENDING_VERIFICATION', 'CONFIRMED', 'UNUSED'],
    PENDING_VERIFICATION: ['CONFIRMED', 'DISQUALIFIED'],
    CONFIRMED: ['DISQUALIFIED'],
    DISQUALIFIED: [],
    UNUSED: []
};

/**
 * @param {Array<{entryId: string, participant: string, weight: number}>} items - snapshot items
 * @returns {string} canonical snapshot text
 */
function getCanonicalSnapshot(items) {
    return items.slice().sort(function (a, b) {
        if (a.entryId === b.entryId) return 0;
        return a.entryId < b.entryId ? -1 : 1;
    }).map(function (i) { return i.entryId + ',' + i.participant + ',' + i.weight; }).join('\n');
}

/**
 * @param {string} text - canonical snapshot text
 * @returns {Array<Object>} items
 */
function parseSnapshot(text) {
    if (!text) return [];
    return String(text).split('\n').filter(Boolean).map(function (line) {
        var parts = line.split(',');
        return { entryId: parts[0], participant: parts[1], weight: Number(parts[2]) };
    });
}

/**
 * @param {string} seed - hex seed (at least 64 hex characters)
 * @param {string} snapshotHash - hash of the canonical snapshot
 * @param {Array<Object>} items - snapshot items (canonical order)
 * @param {number} count - picks wanted (winners and alternates)
 * @returns {Array<{entryId: string, participant: string, counter: number}>} picks in draw order
 */
function pickWinners(seed, snapshotHash, items, count) {
    if (!/^[a-f0-9]{64,}$/.test(String(seed))) throw new Error('invalid-seed');
    var pool = items.filter(function (i) { return i.weight > 0; });
    var picks = [];
    var counter = 0;
    while (picks.length < count && pool.length) {
        var total = pool.reduce(function (sum, i) { return sum + i.weight; }, 0);
        var limit = Math.floor(RANGE / total) * total;
        if (counter > 1000 * (count + 1)) throw new Error('selection-exhausted');
        var x = parseInt(luckyDrawHelpers.hmacWithKey(seed, snapshotHash + ':' + counter).slice(0, 13), 16);
        counter += 1;
        if (x < limit) {
            var ticket = x % total;
            var index = 0;
            while (ticket >= pool[index].weight) {
                ticket -= pool[index].weight;
                index += 1;
            }
            var won = pool[index];
            picks.push({ entryId: won.entryId, participant: won.participant, counter: counter - 1 });
            pool = pool.filter(function (i) { return i.participant !== won.participant; }); // eslint-disable-line no-loop-func
        }
    }
    return picks;
}

/**
 * @param {Object} result - {algorithm, seedHash, seed, snapshotHash, picks}
 * @returns {string} hash sealing a finished draw; any later change to it is detectable
 */
function sealResult(result) {
    return luckyDrawHelpers.sha256([result.algorithm, result.seedHash, result.seed, result.snapshotHash, result.picks.map(function (p) { return p.entryId; }).join(',')].join('|'));
}

/**
 * @param {number} rank - pick position
 * @returns {string} zero-padded rank
 */
function pad(rank) {
    var text = String(rank);
    while (text.length < 6) text = '0' + text;
    return text;
}

/**
 * @param {string} name - lock name
 * @param {string} holder - holder reference
 * @returns {boolean} true when the lock was taken; a lock older than luckyDrawLockMinutes is taken over
 */
function acquireLock(name, holder) {
    try {
        return Transaction.wrap(function () {
            var lock = CustomObjectMgr.getCustomObject('LuckyDrawLock', name);
            if (lock && lock.custom.expiresAt.getTime() > Date.now()) return false;
            if (lock) CustomObjectMgr.remove(lock);
            lock = CustomObjectMgr.createCustomObject('LuckyDrawLock', name);
            lock.custom.holder = holder;
            lock.custom.expiresAt = new Date(Date.now() + luckyDrawHelpers.getPreference('luckyDrawLockMinutes') * 60000);
            lock.custom.createdAt = new Date();
            return true;
        });
    } catch (e) {
        // Another run created the lock at the same moment; the unique key decided.
        return false;
    }
}

/**
 * @param {string} name - lock name
 * @param {string} holder - holder reference
 */
function releaseLock(name, holder) {
    Transaction.wrap(function () {
        var lock = CustomObjectMgr.getCustomObject('LuckyDrawLock', name);
        if (lock && lock.custom.holder === holder) CustomObjectMgr.remove(lock);
    });
}

/**
 * @param {Object} r - campaign rules
 * @param {number} rank - winner rank
 * @returns {?Object} prize tier of that rank
 */
function getPrizeTier(r, rank) {
    if (r.mode === 'GUARANTEED') return r.prizes[0];
    var seen = 0;
    for (var i = 0; i < r.prizes.length; i++) {
        seen += r.prizes[i].winners;
        if (rank < seen) return r.prizes[i];
    }
    return null;
}

/**
 * Creates the execution (and the seed commitment) of every window that has opened.
 * @param {Object} r - campaign rules
 * @param {number} nowMs - current time
 * @returns {number} executions created
 */
function scheduleDraws(r, nowMs) {
    var created = 0;
    var winnersWanted = r.prizes.reduce(function (sum, p) { return sum + p.winners; }, 0);
    campaignHelpers.getDrawWindows(r).forEach(function (w) {
        var id = r.campaignId + '_' + w.key;
        if (w.start > nowMs || CustomObjectMgr.getCustomObject('LuckyDrawExecution', id)) return;
        var seed = r.randomSource === 'PLATFORM' ? luckyDrawHelpers.randomHex(32) : null;
        var late = nowMs >= w.end;
        Transaction.wrap(function () {
            var record = CustomObjectMgr.createCustomObject('LuckyDrawExecution', id);
            var e = record.custom;
            e.campaignId = r.campaignId;
            e.windowKey = w.key;
            e.windowStart = new Date(w.start);
            e.windowEnd = new Date(w.end);
            e.drawAt = new Date(w.drawAt);
            e.status = 'SCHEDULED';
            e.mode = r.mode;
            e.poolScope = r.poolScope;
            e.randomSource = r.randomSource;
            e.algorithm = ALGORITHM;
            e.seed = seed;
            e.seedHash = seed ? luckyDrawHelpers.sha256(seed) : null;
            e.committedAt = new Date(nowMs);
            e.winnersWanted = r.mode === 'GUARANTEED' ? 0 : winnersWanted;
            e.alternatesWanted = r.mode === 'GUARANTEED' ? 0 : r.alternatesPerDraw;
            e.attempts = 0;
            e.createdAt = new Date(nowMs);
            luckyDrawHelpers.logAudit({ entityType: 'EXECUTION', entityId: id, campaignId: r.campaignId, action: 'COMMIT', actor: SYSTEM, to: 'SCHEDULED', detail: { seedHash: e.seedHash, late: late } });
            if (late) luckyDrawHelpers.openCase({ caseType: 'LATE_COMMITMENT', campaignId: r.campaignId, entityId: id, severity: 'MEDIUM', dedupeKey: 'late:' + id });
        });
        created += 1;
    });
    return created;
}

/**
 * @param {Object} r - campaign rules
 * @param {string} customerNo - participant
 * @param {Object} memo - per-run cache
 * @returns {boolean} true when the winner exclusion rules keep the participant out
 */
function isExcluded(r, customerNo, memo) {
    if (memo[customerNo] !== undefined) return memo[customerNo];
    var p = entryHelpers.getParticipant(r.campaignId, customerNo);
    var result = !!(p && p.custom.wins >= r.maxWinsPerParticipant);
    for (var i = 0; !result && i < r.excludedCampaignIds.length; i++) {
        result = luckyDrawHelpers.queryCount('LuckyDrawWinner', 'custom.customerNo = {0} AND custom.campaignId = {1} AND custom.status = {2}', [customerNo, r.excludedCampaignIds[i], 'CONFIRMED']) > 0;
    }
    memo[customerNo] = result;
    return result;
}

/**
 * @param {Object} execution - execution custom attributes
 * @returns {dw.io.File} snapshot file in IMPEX
 */
function getSnapshotFile(execution) {
    var File = require('dw/io/File');
    return new File(File.IMPEX + '/' + luckyDrawHelpers.getImpexFolder('luckyDrawSnapshotDirectory') + '/' + execution.executionId + '.csv');
}

/**
 * @param {dw.io.File} file - file
 * @returns {string} UTF-8 content
 */
function readSnapshotText(file) {
    var Reader = require('dw/io/RandomAccessFileReader');
    var reader = new Reader(file);
    var chunks = [];
    try {
        var bytes = reader.readBytes(Reader.MAX_READ_BYTES);
        while (bytes) {
            chunks.push(bytes);
            bytes = reader.readBytes(Reader.MAX_READ_BYTES);
        }
    } finally {
        reader.close();
    }
    return chunks.map(function (b) { return b.toString('UTF-8'); }).join('');
}

/**
 * Re-validates the window's entries and freezes the eligible ones into the snapshot.
 * @param {dw.object.CustomObject} record - execution
 * @param {Object} r - campaign rules
 */
function freezeEntries(record, r) {
    var e = record.custom;
    var max = luckyDrawHelpers.getPreference('luckyDrawMaxSnapshotEntries');
    var scope = e.poolScope === 'CAMPAIGN' ? 'custom.windowKey <= {1}' : 'custom.windowKey = {1}';
    var found = luckyDrawHelpers.queryPage('LuckyDrawEntry', 'custom.campaignId = {0} AND ' + scope + ' AND (custom.status = {2} OR custom.status = {3})', 'custom.entryId asc', [r.campaignId, e.windowKey, 'PENDING', 'ACTIVE'], 0, max + 1).items;
    if (found.length > max) {
        Transaction.wrap(function () {
            luckyDrawHelpers.openCase({ caseType: 'SNAPSHOT_TOO_LARGE', campaignId: r.campaignId, entityId: e.executionId, severity: 'HIGH', dedupeKey: 'size:' + e.executionId });
        });
        throw luckyDrawHelpers.abort('limit-reached', { limit: 'snapshot-entries' });
    }
    var all = campaignHelpers.getDrawWindows(r);
    var nextWindow = null;
    all.forEach(function (w, i) { if (w.key === e.windowKey && all[i + 1]) nextWindow = all[i + 1]; });
    var drawAt = e.drawAt.getTime();
    var memo = {};
    var items = [];
    found.forEach(function (entry) {
        var c = entry.custom;
        var reason = entryHelpers.getInvalidReason(entry, r);
        Transaction.wrap(function () {
            if (reason) {
                c.status = 'CANCELLED';
                c.reason = reason;
                c.updatedAt = new Date();
                return;
            }
            if (c.status === 'PENDING' && c.holdUntil.getTime() > drawAt) {
                // Still in its hold period: it moves to the next window instead of being dropped.
                if (nextWindow && e.poolScope === 'WINDOW') {
                    c.windowKey = nextWindow.key;
                } else if (!nextWindow) {
                    c.status = 'INELIGIBLE';
                    c.reason = 'hold-after-last-draw';
                }
                c.updatedAt = new Date();
                return;
            }
            if (c.status === 'PENDING') {
                c.status = 'ACTIVE';
                c.updatedAt = new Date();
            }
        });
        if (reason || c.status !== 'ACTIVE' || c.flagged || isExcluded(r, c.customerNo, memo)) return;
        items.push({ entryId: c.entryId, participant: c.participantToken, weight: c.entryCount, entryAt: c.entryAt.getTime() });
    });
    // Cap each participant at the campaign maximum (latest entries give way first).
    var perParticipant = {};
    items.slice().sort(function (a, b) { return a.entryAt - b.entryAt || (a.entryId < b.entryId ? -1 : 1); }).forEach(function (item) {
        var used = perParticipant[item.participant] || 0;
        item.weight = Math.max(0, Math.min(item.weight, r.maxEntriesPerCustomer - used)); // eslint-disable-line no-param-reassign
        perParticipant[item.participant] = used + item.weight;
    });
    items = items.filter(function (i) { return i.weight > 0; });
    if (r.selectionMode === 'PARTICIPANT' || r.mode === 'GUARANTEED') {
        var first = {};
        items.slice().sort(function (a, b) { return a.entryId < b.entryId ? -1 : 1; }).forEach(function (i) {
            if (!first[i.participant]) first[i.participant] = { entryId: i.entryId, participant: i.participant, weight: 1 };
        });
        items = Object.keys(first).map(function (k) { return first[k]; });
    }
    var text = getCanonicalSnapshot(items);
    var hash = luckyDrawHelpers.sha256(text);
    var File = require('dw/io/File');
    var file = getSnapshotFile(e);
    new File(file.fullPath.slice(0, file.fullPath.lastIndexOf('/'))).mkdirs();
    var FileWriter = require('dw/io/FileWriter');
    var writer = new FileWriter(file, 'UTF-8');
    try {
        writer.write(text);
    } finally {
        writer.close();
    }
    var total = items.reduce(function (sum, i) { return sum + i.weight; }, 0);
    var to = items.length ? 'FROZEN' : 'VOID';
    if (!luckyDrawHelpers.canMove(EXECUTION_FLOW, e.status, to)) throw luckyDrawHelpers.abort('not-allowed-now');
    Transaction.wrap(function () {
        e.status = to;
        e.snapshotFile = file.fullPath;
        e.snapshotHash = hash;
        e.entryCount = items.length;
        e.totalWeight = total;
        e.frozenAt = new Date();
        e.finalizedAt = to === 'VOID' ? new Date() : null;
        luckyDrawHelpers.logAudit({ entityType: 'EXECUTION', entityId: e.executionId, campaignId: r.campaignId, action: 'FREEZE', actor: SYSTEM, to: to, detail: { snapshotHash: hash, entries: items.length, totalWeight: total } });
    });
}

/**
 * @param {dw.object.CustomObject} record - execution
 * @param {string} snapshotHash - hash of the snapshot
 * @returns {string} seed; for an external source it is requested once and stored with its proof
 */
function getSeed(record, snapshotHash) {
    var e = record.custom;
    if (e.seed) return e.seed;
    var HookMgr = require('dw/system/HookMgr');
    if (!HookMgr.hasHook('app.plugin.luckydraw.randomness')) throw luckyDrawHelpers.abort('unavailable', { hook: 'app.plugin.luckydraw.randomness' });
    var answer = HookMgr.callHook('app.plugin.luckydraw.randomness', 'seed', { executionId: e.executionId, snapshotHash: snapshotHash });
    if (!answer || !/^[a-f0-9]{64,256}$/.test(String(answer.seed || ''))) throw luckyDrawHelpers.abort('unavailable', { seed: 'invalid' });
    Transaction.wrap(function () {
        e.seed = String(answer.seed);
        e.seedHash = luckyDrawHelpers.sha256(e.seed);
        e.randomProof = String(answer.proof || '').slice(0, 2000);
    });
    return e.seed;
}

/**
 * @param {string} customerNo - winner
 * @param {string} region - state of the winning entry
 * @returns {string} public name, e.g. "A. (TX)", never a full name
 */
function getDisplayName(customerNo, region) {
    var customer = require('dw/customer/CustomerMgr').getCustomerByCustomerNumber(customerNo);
    var first = customer && customer.profile && customer.profile.firstName ? String(customer.profile.firstName).charAt(0).toUpperCase() + '.' : '';
    return (first ? first + ' ' : '') + '(' + (region || 'US') + ')';
}

/**
 * Inside a transaction: makes a winner CONFIRMED, marks the entry and creates the reward.
 * @param {Object} r - campaign rules
 * @param {dw.object.CustomObject} winner - winner
 * @param {dw.object.CustomObject} entry - its entry
 */
function confirmInTransaction(r, winner, entry) {
    winner.custom.status = 'CONFIRMED'; // eslint-disable-line no-param-reassign
    entry.custom.status = 'WINNER'; // eslint-disable-line no-param-reassign
    entryHelpers.getParticipant(r.campaignId, winner.custom.customerNo).custom.wins += 1;
    require('*/cartridge/scripts/helpers/luckyDrawRewardHelpers').createReward(winner);
}

/**
 * Inside a transaction: promotes the best-ranked unused alternate to the freed prize.
 * @param {Object} r - campaign rules
 * @param {dw.object.CustomObject} freed - disqualified winner
 * @returns {?dw.object.CustomObject} promoted winner
 */
function promoteAlternate(r, freed) {
    var next = luckyDrawHelpers.queryPage('LuckyDrawWinner', 'custom.executionId = {0} AND custom.status = {1}', 'custom.rank asc', [freed.custom.executionId, 'ALTERNATE'], 0, 1).items[0];
    if (!next) {
        luckyDrawHelpers.openCase({ caseType: 'NO_ALTERNATE', campaignId: r.campaignId, entityId: freed.custom.winnerId, severity: 'HIGH', dedupeKey: 'alternate:' + freed.custom.winnerId });
        return null;
    }
    var n = next.custom;
    var status = r.requireWinnerVerification ? 'PENDING_VERIFICATION' : 'CONFIRMED';
    n.tier = freed.custom.tier;
    n.prizeLabel = freed.custom.prizeLabel;
    n.couponId = freed.custom.couponId;
    n.validityDays = freed.custom.validityDays;
    n.replaces = freed.custom.winnerId;
    n.updatedAt = new Date();
    if (status === 'CONFIRMED') {
        confirmInTransaction(r, next, CustomObjectMgr.getCustomObject('LuckyDrawEntry', n.entryId));
    } else {
        n.status = status;
        if (r.notifyWinners) luckyDrawHelpers.notify(n.customerNo, 'POTENTIAL_WINNER', { campaign: r.name, prize: n.prizeLabel });
    }
    luckyDrawHelpers.logAudit({ entityType: 'WINNER', entityId: n.winnerId, campaignId: r.campaignId, action: 'PROMOTE', actor: SYSTEM, to: status, detail: { replaces: freed.custom.winnerId } });
    return next;
}

/**
 * Computes the picks and stores winners and alternates (idempotent by rank).
 * @param {dw.object.CustomObject} record - execution
 * @param {Object} r - campaign rules
 */
function selectWinners(record, r) {
    var e = record.custom;
    var text = readSnapshotText(getSnapshotFile(e));
    if (luckyDrawHelpers.sha256(text) !== e.snapshotHash) {
        Transaction.wrap(function () {
            luckyDrawHelpers.openCase({ caseType: 'VERIFICATION_MISMATCH', campaignId: r.campaignId, entityId: e.executionId, severity: 'CRITICAL', dedupeKey: 'snapshot:' + e.executionId });
        });
        throw luckyDrawHelpers.abort('conflict', { snapshot: 'changed' });
    }
    var items = parseSnapshot(text);
    var seed = getSeed(record, e.snapshotHash);
    var picks = r.mode === 'GUARANTEED'
        ? items.map(function (i) { return { entryId: i.entryId, participant: i.participant, counter: null }; })
        : pickWinners(seed, e.snapshotHash, items, e.winnersWanted + e.alternatesWanted);
    var wanted = r.mode === 'GUARANTEED' ? picks.length : e.winnersWanted;
    var freed = [];
    picks.forEach(function (pick, rank) {
        var winnerId = e.executionId + ':' + pad(rank);
        if (CustomObjectMgr.getCustomObject('LuckyDrawWinner', winnerId)) return;
        var entry = CustomObjectMgr.getCustomObject('LuckyDrawEntry', pick.entryId);
        var c = entry.custom;
        var tier = rank < wanted ? getPrizeTier(r, rank) : null;
        // The entry was cancelled after the snapshot froze: the pick stands, its prize goes to an alternate.
        var valid = luckyDrawHelpers.canMove(entryHelpers.ENTRY_FLOW, c.status, 'SELECTED');
        var status = 'ALTERNATE';
        if (!valid) status = tier ? 'DISQUALIFIED' : 'UNUSED';
        var name = getDisplayName(c.customerNo, c.region);
        Transaction.wrap(function () {
            var winner = CustomObjectMgr.createCustomObject('LuckyDrawWinner', winnerId);
            var w = winner.custom;
            w.campaignId = r.campaignId;
            w.executionId = e.executionId;
            w.rank = rank;
            w.entryId = c.entryId;
            w.customerNo = c.customerNo;
            w.participantToken = c.participantToken;
            w.status = status;
            w.tier = tier ? tier.tier : null;
            w.prizeLabel = tier ? tier.label : null;
            w.couponId = tier ? tier.couponId : null;
            w.validityDays = tier ? tier.validityDays : null;
            w.displayName = name;
            w.reason = valid ? null : 'entry-' + String(c.status).toLowerCase();
            w.createdAt = new Date();
            w.updatedAt = new Date();
            if (!valid) {
                if (tier) freed.push(winnerId);
                return;
            }
            c.status = 'SELECTED';
            c.drawId = e.executionId;
            c.updatedAt = new Date();
            if (tier && !r.requireWinnerVerification) {
                confirmInTransaction(r, winner, entry);
            } else if (tier) {
                w.status = 'PENDING_VERIFICATION';
                if (r.notifyWinners) luckyDrawHelpers.notify(c.customerNo, 'POTENTIAL_WINNER', { campaign: r.name, prize: tier.label });
            }
            luckyDrawHelpers.logAudit({ entityType: 'WINNER', entityId: winnerId, campaignId: r.campaignId, action: 'SELECT', actor: SYSTEM, to: w.status, detail: { entryId: c.entryId, rank: rank } });
        });
    });
    if (freed.length) {
        Transaction.wrap(function () { freed.forEach(function (id) { promoteAlternate(r, CustomObjectMgr.getCustomObject('LuckyDrawWinner', id)); }); });
    }
    var resultHash = sealResult({ algorithm: e.algorithm, seedHash: e.seedHash, seed: seed, snapshotHash: e.snapshotHash, picks: picks });
    if (!luckyDrawHelpers.canMove(EXECUTION_FLOW, e.status, 'SELECTED')) throw luckyDrawHelpers.abort('not-allowed-now');
    Transaction.wrap(function () {
        e.status = 'SELECTED';
        e.selectedAt = new Date();
        e.picks = picks.map(function (p) { return p.entryId; }).slice(0, 200);
        e.pickCount = picks.length;
        e.resultHash = resultHash;
        luckyDrawHelpers.logAudit({ entityType: 'EXECUTION', entityId: e.executionId, campaignId: r.campaignId, action: 'SELECT', actor: SYSTEM, to: 'SELECTED', detail: { resultHash: resultHash, picks: picks.length } });
    });
}

/**
 * Creates rewards of confirmed winners and closes the window. Bounded; resumes next run.
 * @param {dw.object.CustomObject} record - execution
 * @param {Object} r - campaign rules
 * @param {number} limit - maximum entry updates in this run
 * @returns {boolean} true when the execution is finalized
 */
function finalizeDraw(record, r, limit) {
    var e = record.custom;
    var rewardHelpers = require('*/cartridge/scripts/helpers/luckyDrawRewardHelpers');
    luckyDrawHelpers.queryPage('LuckyDrawWinner', 'custom.executionId = {0} AND custom.status = {1}', null, [e.executionId, 'CONFIRMED'], 0, 100000).items.forEach(function (w) {
        if (!CustomObjectMgr.getCustomObject('LuckyDrawReward', w.custom.winnerId)) Transaction.wrap(function () { rewardHelpers.createReward(w); });
    });
    if (e.poolScope === 'WINDOW') {
        var rest = luckyDrawHelpers.queryPage('LuckyDrawEntry', 'custom.campaignId = {0} AND custom.windowKey = {1} AND custom.status = {2}', null, [r.campaignId, e.windowKey, 'ACTIVE'], 0, limit + 1).items;
        rest.slice(0, limit).forEach(function (entry) {
            Transaction.wrap(function () {
                entry.custom.status = 'NOT_SELECTED';
                entry.custom.drawId = e.executionId;
                entry.custom.updatedAt = new Date();
            });
        });
        if (rest.length > limit) return false;
    }
    if (!luckyDrawHelpers.canMove(EXECUTION_FLOW, e.status, 'FINALIZED')) throw luckyDrawHelpers.abort('not-allowed-now');
    Transaction.wrap(function () {
        e.status = 'FINALIZED';
        e.finalizedAt = new Date();
        e.failureReason = null;
        luckyDrawHelpers.logAudit({ entityType: 'EXECUTION', entityId: e.executionId, campaignId: r.campaignId, action: 'FINALIZE', actor: SYSTEM, to: 'FINALIZED', detail: { resultHash: e.resultHash } });
    });
    return true;
}

/**
 * Runs the next phases of one execution under its lock.
 * @param {dw.object.CustomObject} record - execution
 * @param {Object} r - campaign rules
 * @param {number} limit - batch size for entry updates
 * @returns {string} resulting status, or LOCKED when another run holds it
 */
function processDraw(record, r, limit) {
    var e = record.custom;
    var name = 'draw:' + e.executionId;
    var holder = luckyDrawHelpers.createId('RUN');
    if (!acquireLock(name, holder)) return 'LOCKED';
    try {
        if (e.status === 'SCHEDULED' || (e.status === 'FAILED' && !e.snapshotHash)) {
            if (e.status === 'FAILED') Transaction.wrap(function () { e.status = 'SCHEDULED'; });
            freezeEntries(record, r);
        }
        if (e.status === 'FROZEN' || (e.status === 'FAILED' && e.snapshotHash && !e.selectedAt)) {
            if (e.status === 'FAILED') Transaction.wrap(function () { e.status = 'FROZEN'; });
            selectWinners(record, r);
        }
        if (e.status === 'SELECTED' || (e.status === 'FAILED' && e.selectedAt)) {
            if (e.status === 'FAILED') Transaction.wrap(function () { e.status = 'SELECTED'; });
            finalizeDraw(record, r, limit);
        }
    } catch (err) {
        log.error('Draw {0} failed: {1}', e.executionId, err.errorCode || err.message);
        Transaction.wrap(function () {
            if (luckyDrawHelpers.canMove(EXECUTION_FLOW, e.status, 'FAILED')) e.status = 'FAILED';
            e.attempts = (e.attempts || 0) + 1;
            e.failureReason = String(err.errorCode || err.message).slice(0, 200);
            luckyDrawHelpers.openCase({ caseType: 'DRAW_FAILED', campaignId: r.campaignId, entityId: e.executionId, severity: 'HIGH', dedupeKey: 'draw:' + e.executionId, detail: { reason: e.failureReason } });
        });
    } finally {
        releaseLock(name, holder);
    }
    return e.status;
}

/**
 * Job helper: commits seeds of opened windows, then draws every due window. Paused campaigns
 * keep their windows: their draws wait until the campaign resumes. Cancelled campaigns cancel
 * their pending draws.
 * @param {number} limit - batch size
 * @returns {Object} counts
 */
function runDraws(limit) {
    var counts = { committed: 0, finalized: 0, voided: 0, failed: 0, locked: 0, cancelled: 0 };
    var now = Date.now();
    luckyDrawHelpers.queryPage('LuckyDrawCampaign', 'custom.status = {0} OR custom.status = {1} OR custom.status = {2}', null, ['ACTIVE', 'PAUSED', 'CANCELLED'], 0, 200).items.forEach(function (campaign) {
        var r = campaignHelpers.getCampaignRules(campaign);
        if (r.status === 'CANCELLED') {
            // Draws not yet selected are cancelled; selected ones still finish, their winners stand.
            // a custom object query may use at most 4 custom attribute expressions (quota api.query.customAttrExpr)
            var open = luckyDrawHelpers.queryPage('LuckyDrawExecution', 'custom.campaignId = {0} AND (custom.status = {1} OR custom.status = {2})', null, [r.campaignId, 'SCHEDULED', 'FROZEN'], 0, limit).items
                .concat(luckyDrawHelpers.queryPage('LuckyDrawExecution', 'custom.campaignId = {0} AND custom.status = {1} AND custom.selectedAt = NULL', null, [r.campaignId, 'FAILED'], 0, limit).items);
            open.forEach(function (x) {
                Transaction.wrap(function () {
                    x.custom.status = 'CANCELLED';
                    luckyDrawHelpers.logAudit({ entityType: 'EXECUTION', entityId: x.custom.executionId, campaignId: r.campaignId, action: 'CANCEL', actor: SYSTEM, to: 'CANCELLED' });
                });
                counts.cancelled += 1;
            });
        } else {
            counts.committed += scheduleDraws(r, now);
        }
        // one query per status keeps each within the 4 custom attribute expressions a query may use
        var due = [];
        ['SCHEDULED', 'FROZEN', 'SELECTED', 'FAILED'].forEach(function (status) {
            due = due.concat(luckyDrawHelpers.queryPage('LuckyDrawExecution', 'custom.campaignId = {0} AND custom.drawAt <= {1} AND custom.status = {2}', 'custom.drawAt asc', [r.campaignId, new Date(now), status], 0, 50).items);
        });
        due.sort(function (a, b) { return a.custom.drawAt.getTime() - b.custom.drawAt.getTime(); }).slice(0, 50).forEach(function (x) {
            if ((r.status === 'PAUSED' || r.status === 'CANCELLED') && x.custom.status === 'SCHEDULED') return;
            var status = processDraw(x, r, limit);
            if (status === 'FINALIZED') counts.finalized += 1;
            else if (status === 'VOID') counts.voided += 1;
            else if (status === 'LOCKED') counts.locked += 1;
            else if (status === 'FAILED') counts.failed += 1;
        });
    });
    return counts;
}

/**
 * Recomputes a draw from its published inputs. Read only.
 * @param {string} executionId - execution
 * @returns {Object} result with ok and problems
 */
function verifyDraw(executionId) {
    var record = CustomObjectMgr.getCustomObject('LuckyDrawExecution', String(executionId));
    if (!record) return luckyDrawHelpers.errorResult('not-found');
    var e = record.custom;
    if (['SELECTED', 'FINALIZED'].indexOf(e.status) < 0) return { error: false, ok: false, problems: ['not-drawn'] };
    var problems = [];
    var file = getSnapshotFile(e);
    var text = file.exists() ? readSnapshotText(file) : null;
    if (text === null || luckyDrawHelpers.sha256(text) !== e.snapshotHash) problems.push('snapshot-hash');
    if (!e.seed || luckyDrawHelpers.sha256(e.seed) !== e.seedHash) problems.push('seed-commitment');
    var stored = luckyDrawHelpers.queryPage('LuckyDrawWinner', 'custom.executionId = {0}', 'custom.rank asc', [executionId], 0, 100000).items.map(function (w) { return w.custom.entryId; });
    if (!problems.length && e.mode !== 'GUARANTEED') {
        var picks = pickWinners(e.seed, e.snapshotHash, parseSnapshot(text), e.winnersWanted + e.alternatesWanted);
        if (picks.map(function (p) { return p.entryId; }).join(',') !== stored.join(',')) problems.push('winners');
        if (sealResult({ algorithm: e.algorithm, seedHash: e.seedHash, seed: e.seed, snapshotHash: e.snapshotHash, picks: picks }) !== e.resultHash) problems.push('result-seal');
    }
    return { error: false, ok: problems.length === 0, problems: problems };
}

/**
 * Disqualifies a winner; the best alternate takes over the prize.
 * @param {string} winnerId - winner
 * @param {string} reason - why (at least 10 characters)
 * @param {Object} by - admin or system actor
 * @returns {Object} result
 */
function disqualifyWinner(winnerId, reason, by) {
    var winner = CustomObjectMgr.getCustomObject('LuckyDrawWinner', String(winnerId));
    if (!winner) return luckyDrawHelpers.errorResult('not-found');
    var text = luckyDrawHelpers.cleanText(reason);
    if (text.length < 10) return luckyDrawHelpers.errorResult('invalid', { reason: 'required' });
    var from = winner.custom.status;
    if (!luckyDrawHelpers.canMove(WINNER_FLOW, from, 'DISQUALIFIED')) return luckyDrawHelpers.errorResult('not-allowed-now');
    var r = campaignHelpers.getCampaignRules(CustomObjectMgr.getCustomObject('LuckyDrawCampaign', winner.custom.campaignId));
    Transaction.wrap(function () {
        var w = winner.custom;
        w.status = 'DISQUALIFIED';
        w.reason = text.slice(0, 1000);
        w.decidedBy = by.ref;
        w.updatedAt = new Date();
        var entry = CustomObjectMgr.getCustomObject('LuckyDrawEntry', w.entryId);
        if (luckyDrawHelpers.canMove(entryHelpers.ENTRY_FLOW, entry.custom.status, 'INELIGIBLE')) {
            entry.custom.status = 'INELIGIBLE';
            entry.custom.reason = 'disqualified';
        }
        if (from === 'CONFIRMED') {
            var p = entryHelpers.getParticipant(r.campaignId, w.customerNo);
            p.custom.wins = Math.max(0, p.custom.wins - 1);
            var reward = CustomObjectMgr.getCustomObject('LuckyDrawReward', w.winnerId);
            if (reward) require('*/cartridge/scripts/helpers/luckyDrawRewardHelpers').revokeReward(reward, 'winner-disqualified', by);
        }
        luckyDrawHelpers.logAudit({ entityType: 'WINNER', entityId: w.winnerId, campaignId: r.campaignId, action: 'DISQUALIFY', actor: by, from: from, to: 'DISQUALIFIED', reason: text });
        luckyDrawHelpers.openCase({ caseType: 'WINNER_DISQUALIFIED', campaignId: r.campaignId, entityId: w.winnerId, severity: 'MEDIUM', dedupeKey: 'disqualified:' + w.winnerId });
        promoteAlternate(r, winner);
    });
    return { error: false };
}

/**
 * Business Manager confirms a potential winner after the eligibility check (affidavit, age, residence).
 * @param {string} winnerId - winner
 * @param {Object} by - admin actor
 * @returns {Object} result
 */
function confirmWinner(winnerId, by) {
    var winner = CustomObjectMgr.getCustomObject('LuckyDrawWinner', String(winnerId));
    if (!winner) return luckyDrawHelpers.errorResult('not-found');
    var r = campaignHelpers.getCampaignRules(CustomObjectMgr.getCustomObject('LuckyDrawCampaign', winner.custom.campaignId));
    var entry = CustomObjectMgr.getCustomObject('LuckyDrawEntry', winner.custom.entryId);
    var reason = entryHelpers.getInvalidReason(entry, r);
    if (reason) return luckyDrawHelpers.errorResult('not-eligible', { reason: reason });
    if (!luckyDrawHelpers.canMove(WINNER_FLOW, winner.custom.status, 'CONFIRMED') || !luckyDrawHelpers.canMove(entryHelpers.ENTRY_FLOW, entry.custom.status, 'WINNER')) return luckyDrawHelpers.errorResult('not-allowed-now');
    Transaction.wrap(function () {
        winner.custom.decidedBy = by.ref;
        winner.custom.updatedAt = new Date();
        confirmInTransaction(r, winner, entry);
        luckyDrawHelpers.logAudit({ entityType: 'WINNER', entityId: winnerId, campaignId: r.campaignId, action: 'CONFIRM', actor: by, from: 'PENDING_VERIFICATION', to: 'CONFIRMED' });
    });
    return { error: false };
}

/**
 * Called when the source of a drawn entry is cancelled, refunded or charged back.
 * @param {dw.object.CustomObject} entry - SELECTED or WINNER entry
 * @param {string} reason - reason
 * @param {Object} by - who
 */
function disqualifyEntry(entry, reason, by) {
    var winner = luckyDrawHelpers.queryPage('LuckyDrawWinner', 'custom.entryId = {0} AND custom.status != {1} AND custom.status != {2}', null, [entry.custom.entryId, 'DISQUALIFIED', 'UNUSED'], 0, 1).items[0];
    if (winner && winner.custom.status !== 'ALTERNATE') {
        disqualifyWinner(winner.custom.winnerId, 'Source order event: ' + reason, by);
        return;
    }
    Transaction.wrap(function () {
        if (winner) {
            winner.custom.status = 'UNUSED';
            winner.custom.reason = reason;
            winner.custom.updatedAt = new Date();
        }
        if (luckyDrawHelpers.canMove(entryHelpers.ENTRY_FLOW, entry.custom.status, 'INELIGIBLE')) {
            entry.custom.status = 'INELIGIBLE'; // eslint-disable-line no-param-reassign
            entry.custom.reason = reason; // eslint-disable-line no-param-reassign
        }
        luckyDrawHelpers.logAudit({ entityType: 'ENTRY', entityId: entry.custom.entryId, campaignId: entry.custom.campaignId, action: 'INVALIDATE', actor: by, to: 'INELIGIBLE', reason: reason });
    });
}

/**
 * Job helper (winner verification): re-checks winners whose reward is not issued yet,
 * verifies finalized draws once, and releases alternates of settled draws.
 * @param {number} limit - maximum records
 * @returns {Object} counts
 */
function verifyWinners(limit) {
    var counts = { revalidated: 0, disqualified: 0, verified: 0, mismatches: 0, released: 0 };
    luckyDrawHelpers.queryPage('LuckyDrawWinner', 'custom.status = {0} OR custom.status = {1}', null, ['PENDING_VERIFICATION', 'CONFIRMED'], 0, limit).items.forEach(function (w) {
        var reward = CustomObjectMgr.getCustomObject('LuckyDrawReward', w.custom.winnerId);
        if (reward && ['ISSUED', 'REDEEMED', 'EXPIRED'].indexOf(reward.custom.status) >= 0) return;
        counts.revalidated += 1;
        var r = campaignHelpers.getCampaignRules(CustomObjectMgr.getCustomObject('LuckyDrawCampaign', w.custom.campaignId));
        var reason = entryHelpers.getInvalidReason(CustomObjectMgr.getCustomObject('LuckyDrawEntry', w.custom.entryId), r);
        if (reason && !disqualifyWinner(w.custom.winnerId, 'Revalidation failed: ' + reason, SYSTEM).error) counts.disqualified += 1;
    });
    luckyDrawHelpers.queryPage('LuckyDrawExecution', 'custom.status = {0} AND custom.verifiedAt = NULL', 'custom.finalizedAt asc', ['FINALIZED'], 0, limit).items.forEach(function (x) {
        var result = verifyDraw(x.custom.executionId);
        Transaction.wrap(function () {
            x.custom.verifiedAt = new Date();
            x.custom.verification = result.ok ? 'OK' : result.problems.join(',');
            if (!result.ok) luckyDrawHelpers.openCase({ caseType: 'VERIFICATION_MISMATCH', campaignId: x.custom.campaignId, entityId: x.custom.executionId, severity: 'CRITICAL', dedupeKey: 'verify:' + x.custom.executionId, detail: { problems: result.problems.join(',') } });
        });
        if (result.ok) counts.verified += 1;
        else counts.mismatches += 1;
    });
    // Alternates are kept until every prize of the draw is confirmed and issued.
    luckyDrawHelpers.queryPage('LuckyDrawExecution', 'custom.status = {0} AND custom.alternatesReleasedAt = NULL', null, ['FINALIZED'], 0, limit).items.forEach(function (x) {
        var unsettled = luckyDrawHelpers.queryCount('LuckyDrawWinner', 'custom.executionId = {0} AND custom.status = {1}', [x.custom.executionId, 'PENDING_VERIFICATION']);
        var pendingRewards = luckyDrawHelpers.queryCount('LuckyDrawReward', 'custom.executionId = {0} AND (custom.status = {1} OR custom.status = {2})', [x.custom.executionId, 'PENDING', 'FAILED']);
        if (unsettled || pendingRewards) return;
        var alternates = luckyDrawHelpers.queryPage('LuckyDrawWinner', 'custom.executionId = {0} AND custom.status = {1}', null, [x.custom.executionId, 'ALTERNATE'], 0, 100).items;
        Transaction.wrap(function () {
            alternates.forEach(function (w) {
                w.custom.status = 'UNUSED';
                CustomObjectMgr.getCustomObject('LuckyDrawEntry', w.custom.entryId).custom.status = x.custom.poolScope === 'CAMPAIGN' ? 'ACTIVE' : 'NOT_SELECTED';
                counts.released += 1;
            });
            x.custom.alternatesReleasedAt = new Date();
        });
    });
    return counts;
}

/**
 * @param {dw.object.CustomObject} record - execution
 * @param {boolean} sealed - true keeps the seed hidden until the draw is finished (every caller
 *   except tests: knowing the seed early would let someone predict the winners)
 * @returns {Object} transparency view
 */
function getDrawView(record, sealed) {
    var e = record.custom;
    var done = ['FINALIZED', 'VOID'].indexOf(e.status) >= 0;
    var tz = CustomObjectMgr.getCustomObject('LuckyDrawCampaign', e.campaignId).custom.timeZone;
    return {
        executionId: e.executionId,
        campaignId: e.campaignId,
        windowKey: e.windowKey,
        windowStart: campaignHelpers.formatLocalTime(e.windowStart.getTime(), tz),
        windowEnd: campaignHelpers.formatLocalTime(e.windowEnd.getTime(), tz),
        drawAt: e.drawAt,
        drawAtFormatted: campaignHelpers.formatLocalTime(e.drawAt.getTime(), tz),
        timeZone: tz,
        status: e.status,
        algorithm: e.algorithm,
        randomSource: e.randomSource,
        seedHash: e.seedHash || null,
        seed: done || !sealed ? e.seed || null : null,
        randomProof: done ? e.randomProof || null : null,
        committedAt: e.committedAt,
        snapshotHash: e.snapshotHash || null,
        entryCount: e.entryCount || 0,
        totalWeight: e.totalWeight || 0,
        picks: done ? Array.prototype.slice.call(e.picks || []) : [],
        winnersWanted: e.winnersWanted,
        resultHash: done ? e.resultHash || null : null,
        verification: e.verification || null
    };
}

module.exports = {
    ALGORITHM: ALGORITHM,
    EXECUTION_FLOW: EXECUTION_FLOW,
    WINNER_FLOW: WINNER_FLOW,
    getCanonicalSnapshot: getCanonicalSnapshot,
    parseSnapshot: parseSnapshot,
    pickWinners: pickWinners,
    sealResult: sealResult,
    acquireLock: acquireLock,
    releaseLock: releaseLock,
    scheduleDraws: scheduleDraws,
    processDraw: processDraw,
    runDraws: runDraws,
    verifyDraw: verifyDraw,
    disqualifyWinner: disqualifyWinner,
    confirmWinner: confirmWinner,
    disqualifyEntry: disqualifyEntry,
    verifyWinners: verifyWinners,
    readSnapshotText: readSnapshotText,
    getSnapshotFile: getSnapshotFile,
    getDrawView: getDrawView
};
