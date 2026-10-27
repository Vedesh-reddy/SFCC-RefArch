'use strict';

var assert = require('chai').assert;
var harness = require('./harness');
var fixtures = require('./fixtures');

var HOUR = fixtures.HOUR;

describe('plugin_luckydraw draws', function () {
    var h;
    var entries;
    var draws;
    var campaignHelpers;
    var r;
    var created;
    var window;

    /**
     * @param {Object} [overrides] - campaign overrides
     */
    function setup(overrides) {
        h = harness();
        entries = h.require('scripts/helpers/luckyDrawEntryHelpers');
        draws = h.require('scripts/helpers/luckyDrawDrawHelpers');
        campaignHelpers = h.require('scripts/helpers/luckyDrawCampaignHelpers');
        r = fixtures.campaign(h, 'daily-draw', overrides);
        created = Date.now() - 30 * HOUR;
        window = campaignHelpers.getWindowAt(r, created);
    }

    /**
     * @param {number} n - number of customers with one order each in the drawn window
     */
    function enter(n) {
        for (var i = 1; i <= n; i++) entries.createEntryFromOrder(r, fixtures.order(h, { orderNo: 'O' + i, customerNo: 'C' + i, createdMs: created }), Date.now());
    }

    /**
     * @returns {dw.object.CustomObject} execution of the drawn window
     */
    function execution() {
        return h.get('LuckyDrawExecution', 'daily-draw_' + window.key);
    }

    /**
     * @returns {Object[]} winners of the drawn window by rank
     */
    function winners() {
        return h.rows('LuckyDrawWinner').filter(function (w) { return w.custom.executionId === execution().custom.executionId; })
            .sort(function (a, b) { return a.custom.rank - b.custom.rank; });
    }

    describe('a normal draw', function () {
        beforeEach(function () {
            setup();
            enter(6);
            draws.runDraws(1000);
        });

        it('commits the seed before the draw and publishes it only afterwards', function () {
            var current = h.get('LuckyDrawExecution', 'daily-draw_' + campaignHelpers.getWindowAt(r, Date.now()).key);
            assert.equal(current.custom.status, 'SCHEDULED');
            assert.equal(current.custom.seedHash, h.require('scripts/helpers/luckyDrawHelpers').sha256(current.custom.seed));
            assert.isNull(draws.getDrawView(current, true).seed, 'sealed before the draw');
            assert.equal(draws.getDrawView(execution(), true).seed, execution().custom.seed, 'published after the draw');
        });

        it('freezes the snapshot, selects one winner and two alternates, and closes the window', function () {
            var x = execution().custom;
            assert.equal(x.status, 'FINALIZED');
            assert.equal(x.entryCount, 6);
            var text = draws.readSnapshotText(draws.getSnapshotFile(x));
            assert.equal(h.require('scripts/helpers/luckyDrawHelpers').sha256(text), x.snapshotHash);
            assert.notMatch(text, /,C\d+,/, 'the snapshot holds pseudonymous tokens, not customer numbers');
            assert.deepEqual(winners().map(function (w) { return w.custom.status; }), ['CONFIRMED', 'ALTERNATE', 'ALTERNATE']);
            var statuses = h.rows('LuckyDrawEntry').map(function (e) { return e.custom.status; }).sort();
            assert.deepEqual(statuses, ['NOT_SELECTED', 'NOT_SELECTED', 'NOT_SELECTED', 'SELECTED', 'SELECTED', 'WINNER']);
            assert.lengthOf(h.rows('LuckyDrawReward'), 1);
            assert.equal(winners()[0].custom.displayName, 'A. (NY)');
        });

        it('can be recomputed by anyone from the published seed and snapshot', function () {
            var x = execution().custom;
            var picks = draws.pickWinners(x.seed, x.snapshotHash, draws.parseSnapshot(draws.readSnapshotText(draws.getSnapshotFile(x))), 3);
            assert.deepEqual(picks.map(function (p) { return p.entryId; }), winners().map(function (w) { return w.custom.entryId; }));
            assert.deepEqual(draws.verifyDraw(x.executionId), { error: false, ok: true, problems: [] });
        });

        it('never draws a window twice, and a held lock stops a parallel run', function () {
            var before = h.rows('LuckyDrawWinner').length;
            draws.runDraws(1000);
            assert.lengthOf(h.rows('LuckyDrawWinner'), before);
            var x = h.get('LuckyDrawExecution', 'daily-draw_' + campaignHelpers.getWindowAt(r, Date.now()).key);
            assert.isTrue(draws.acquireLock('draw:' + x.custom.executionId, 'other-run'));
            assert.equal(draws.processDraw(x, r, 100), 'LOCKED');
        });

        it('detects a changed snapshot file', function () {
            var x = execution().custom;
            h.state.files[draws.getSnapshotFile(x).fullPath] = Buffer.from('LDE-FAKE,p,1');
            assert.include(draws.verifyDraw(x.executionId).problems, 'snapshot-hash');
        });

        it('hands a disqualified prize to the best-ranked alternate and withdraws the reward', function () {
            var first = winners()[0];
            assert.equal(draws.disqualifyWinner(first.custom.winnerId, 'no', fixtures.ADMIN).fields.reason, 'required');
            assert.isFalse(draws.disqualifyWinner(first.custom.winnerId, 'Winner failed the residency check', fixtures.ADMIN).error);
            assert.equal(draws.disqualifyWinner(first.custom.winnerId, 'Winner failed the residency check', fixtures.ADMIN).errorCode, 'not-allowed-now');
            var list = winners();
            assert.equal(list[0].custom.status, 'DISQUALIFIED');
            assert.equal(list[1].custom.status, 'CONFIRMED');
            assert.equal(list[1].custom.replaces, first.custom.winnerId);
            assert.equal(h.get('LuckyDrawReward', first.custom.winnerId).custom.status, 'REVOKED');
            assert.equal(h.get('LuckyDrawReward', list[1].custom.winnerId).custom.status, 'PENDING');
            assert.isTrue(h.rows('LuckyDrawAuditEvent').some(function (a) { return a.custom.action === 'DISQUALIFY' && a.custom.actorRef === 'ops'; }));
            assert.isTrue(draws.verifyDraw(execution().custom.executionId).ok, 'the draw itself is unchanged');
        });

        it('disqualifies a winner whose order is refunded', function () {
            var orderNo = h.get('LuckyDrawEntry', winners()[0].custom.entryId).custom.sourceRef;
            assert.deepEqual(entries.applyOrderEvent(orderNo, 'REFUNDED', { type: 'INTEGRATION', ref: 'oms' }), { cancelled: 0, disqualified: 1 });
            assert.equal(winners()[1].custom.status, 'CONFIRMED');
        });

        it('revalidates winners before the reward is issued and verifies finished draws', function () {
            var orderNo = h.get('LuckyDrawEntry', winners()[0].custom.entryId).custom.sourceRef;
            h.state.orders[orderNo].status.value = 6;
            var counts = draws.verifyWinners(100);
            assert.equal(counts.disqualified, 1);
            assert.isAtLeast(counts.verified, 1);
            assert.equal(execution().custom.verification, 'OK');
        });
    });

    it('resumes after a failure with the same snapshot and winners', function () {
        setup({ randomSource: 'EXTERNAL' });
        enter(4);
        var calls = 0;
        var crypto = require('crypto');
        var seed = crypto.randomBytes(32).toString('hex');
        h.state.hooks['app.plugin.luckydraw.randomness'] = {
            seed: function () {
                calls += 1;
                if (calls === 1) throw new Error('provider timeout');
                return { seed: seed, proof: 'beacon-round-42' };
            }
        };
        draws.runDraws(1000);
        var x = execution().custom;
        assert.equal(x.status, 'FAILED');
        var hash = x.snapshotHash;
        assert.isTrue(h.rows('LuckyDrawCase').some(function (c) { return c.custom.caseType === 'DRAW_FAILED'; }));
        fixtures.due(h, 'daily-draw');
        draws.runDraws(1000);
        assert.equal(execution().custom.status, 'FINALIZED');
        assert.equal(execution().custom.snapshotHash, hash);
        assert.equal(execution().custom.randomProof, 'beacon-round-42');
        assert.isTrue(draws.verifyDraw(x.executionId).ok);
    });

    it('leaves out flagged entries and participants at their win limit, and caps entries per customer', function () {
        setup({ maxEntriesPerCustomer: '3', entryMethod: 'PER_INCREMENT', increment: '10', maxEntriesPerOrder: '5' });
        enter(3);
        var e1 = h.rows('LuckyDrawEntry').filter(function (e) { return e.custom.customerNo === 'C1'; })[0];
        e1.custom.flagged = true;
        entries.getParticipant('daily-draw', 'C2').custom.wins = 1;
        draws.runDraws(1000);
        var text = draws.readSnapshotText(draws.getSnapshotFile(execution().custom));
        var lines = text.split('\n');
        assert.lengthOf(lines, 1);
        assert.match(lines[0], /,3$/, 'three increments, capped at the per-customer maximum');
    });

    it('gives each participant one chance in participant mode', function () {
        setup({ selectionMode: 'PARTICIPANT' });
        entries.createEntryFromOrder(r, fixtures.order(h, { orderNo: 'A', customerNo: 'C1', createdMs: created }), Date.now());
        entries.createEntryFromOrder(r, fixtures.order(h, { orderNo: 'B', customerNo: 'C1', createdMs: created + 1000 }), Date.now());
        entries.createEntryFromOrder(r, fixtures.order(h, { orderNo: 'C', customerNo: 'C2', createdMs: created }), Date.now());
        draws.runDraws(1000);
        var lines = draws.readSnapshotText(draws.getSnapshotFile(execution().custom)).split('\n');
        assert.lengthOf(lines, 2);
        lines.forEach(function (l) { assert.match(l, /,1$/); });
    });

    it('awards potential winners only after an administrator confirms them', function () {
        setup({ requireWinnerVerification: 'true' });
        enter(3);
        draws.runDraws(1000);
        var first = winners()[0];
        assert.equal(first.custom.status, 'PENDING_VERIFICATION');
        assert.lengthOf(h.rows('LuckyDrawReward'), 0);
        assert.isTrue(h.rows('LuckyDrawNotification').some(function (n) { return n.custom.type === 'POTENTIAL_WINNER'; }));
        assert.isFalse(draws.confirmWinner(first.custom.winnerId, fixtures.ADMIN).error);
        assert.equal(h.get('LuckyDrawReward', first.custom.winnerId).custom.status, 'PENDING');
        assert.equal(h.get('LuckyDrawEntry', first.custom.entryId).custom.status, 'WINNER');
        assert.equal(draws.confirmWinner(first.custom.winnerId, fixtures.ADMIN).errorCode, 'not-allowed-now');
    });

    it('rewards every eligible entry once in guaranteed mode', function () {
        setup({ mode: 'GUARANTEED' });
        enter(4);
        draws.runDraws(1000);
        assert.lengthOf(h.rows('LuckyDrawReward'), 4);
        draws.runDraws(1000);
        assert.lengthOf(h.rows('LuckyDrawReward'), 4);
    });

    it('voids a window without eligible entries', function () {
        setup();
        draws.runDraws(1000);
        assert.equal(execution().custom.status, 'VOID');
        assert.lengthOf(h.rows('LuckyDrawWinner'), 0);
    });

    it('holds draws of a paused campaign and cancels those of a cancelled one', function () {
        setup();
        enter(2);
        campaignHelpers.changeCampaignStatus('daily-draw', 'pause', 'Investigating a complaint', fixtures.ADMIN);
        r = campaignHelpers.getCampaignRules(h.get('LuckyDrawCampaign', 'daily-draw'));
        draws.runDraws(1000);
        assert.equal(execution().custom.status, 'SCHEDULED');
        campaignHelpers.changeCampaignStatus('daily-draw', 'cancel', 'Campaign withdrawn by legal', fixtures.ADMIN);
        draws.runDraws(1000);
        assert.equal(execution().custom.status, 'CANCELLED');
        assert.lengthOf(h.rows('LuckyDrawWinner'), 0);
    });
});
