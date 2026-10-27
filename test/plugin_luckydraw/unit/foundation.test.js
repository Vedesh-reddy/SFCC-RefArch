'use strict';

var assert = require('chai').assert;
var harness = require('./harness');

describe('plugin_luckydraw foundation', function () {
    describe('site preferences', function () {
        it('fails closed and keeps the program US-only', function () {
            var h = harness({ preferences: { luckyDrawEnabled: 'yes', luckyDrawAllowedCountries: ['US', 'CA'] } });
            var helpers = h.require('scripts/helpers/luckyDrawHelpers');
            assert.isFalse(helpers.isLuckyDrawEnabled(), 'only boolean true switches it on');
            assert.deepEqual(helpers.getAllowedCountries(), ['US']);
            h.preferences.luckyDrawEnabled = true;
            assert.isTrue(helpers.isLuckyDrawEnabled());
            h.preferences.luckyDrawCurrency = 'EUR';
            assert.isFalse(helpers.isLuckyDrawEnabled());
        });

        it('blocks live campaigns on production without the legal approval', function () {
            var h = harness();
            var helpers = h.require('scripts/helpers/luckyDrawHelpers');
            assert.isTrue(helpers.isLiveAllowed(), 'non-production runs demonstrations');
            h.state.instanceType = 2;
            assert.isFalse(helpers.isLiveAllowed());
            h.preferences.luckyDrawLegalApproved = true;
            assert.isTrue(helpers.isLiveAllowed());
        });

        it('refuses folder preferences that leave the IMPEX folder', function () {
            var h = harness({ preferences: { luckyDrawSnapshotDirectory: '../../etc' } });
            var helpers = h.require('scripts/helpers/luckyDrawHelpers');
            assert.throws(function () { helpers.getImpexFolder('luckyDrawSnapshotDirectory'); }, /unavailable/);
            assert.equal(helpers.getImpexFolder('luckyDrawAuditExportDirectory'), 'src/plugin-luckydraw/audit', 'metadata default');
        });

        it('uses the US time zones when the preference is empty', function () {
            var h = harness();
            var campaignHelpers = h.require('scripts/helpers/luckyDrawCampaignHelpers');
            assert.include(campaignHelpers.getAllowedTimeZones(), 'America/New_York');
            h.preferences.luckyDrawAllowedTimeZones = ['America/Chicago'];
            assert.deepEqual(campaignHelpers.getAllowedTimeZones(), ['America/Chicago']);
        });

        it('builds base-style error results with a localized message', function () {
            var result = harness().require('scripts/helpers/luckyDrawHelpers').errorResult('not-eligible', { reason: 'region' });
            assert.isTrue(result.error);
            assert.equal(result.errorMessage, harness.messages['error.not-eligible']);
            assert.deepEqual(result.fields, { reason: 'region' });
        });
    });

    describe('draw windows', function () {
        var h;
        var windows;
        beforeEach(function () {
            h = harness();
            var campaignHelpers = h.require('scripts/helpers/luckyDrawCampaignHelpers');
            windows = {
                list: campaignHelpers.getDrawWindows,
                at: campaignHelpers.getWindowAt,
                parseLocal: campaignHelpers.parseLocalTime,
                format: campaignHelpers.formatLocalTime,
                dayKey: campaignHelpers.getLocalDayKey
            };
        });

        it('ends each daily window at the local draw time, also across a daylight-saving change', function () {
            var tz = 'America/New_York';
            var rules = { startAt: windows.parseLocal('2026-10-30 09:00', tz), endAt: windows.parseLocal('2026-11-03 09:00', tz), timeZone: tz, drawFrequency: 'DAILY', drawTime: '20:00', drawDelayMinutes: 30 };
            var list = windows.list(rules);
            assert.deepEqual(list.map(function (w) { return w.key; }), ['20261030T2000', '20261031T2000', '20261101T2000', '20261102T2000', '20261103T0900']);
            assert.equal(new Date(list[0].end).toISOString(), '2026-10-31T00:00:00.000Z', 'EDT is UTC-4');
            assert.equal(new Date(list[2].end).toISOString(), '2026-11-02T01:00:00.000Z', 'EST is UTC-5 after 1 November');
            assert.equal(list[0].drawAt - list[0].end, 30 * 60000);
            assert.equal(list[0].start, rules.startAt.getTime());
            list.slice(1).forEach(function (w, i) { assert.equal(w.start, list[i].end, 'windows are contiguous'); });
            assert.equal(windows.at(rules, list[1].start).key, '20261031T2000');
            assert.isNull(windows.at(rules, rules.endAt.getTime()));
        });

        it('supports weekly, monthly (clamped to short months) and whole-campaign windows', function () {
            var tz = 'America/Chicago';
            var weekly = windows.list({ startAt: windows.parseLocal('2026-01-01 00:00', tz), endAt: windows.parseLocal('2026-01-20 00:00', tz), timeZone: tz, drawFrequency: 'WEEKLY', drawTime: '12:00' });
            assert.deepEqual(weekly.map(function (w) { return w.key; }), ['20260101T1200', '20260108T1200', '20260115T1200', '20260120T0000']);
            var monthly = windows.list({ startAt: windows.parseLocal('2026-01-31 13:00', tz), endAt: windows.parseLocal('2026-04-15 00:00', tz), timeZone: tz, drawFrequency: 'MONTHLY', drawTime: '12:00' });
            assert.deepEqual(monthly.map(function (w) { return w.key; }), ['20260201T1200', '20260301T1200', '20260401T1200', '20260415T0000']);
            var once = windows.list({ startAt: windows.parseLocal('2026-01-01 00:00', tz), endAt: windows.parseLocal('2026-02-01 00:00', tz), timeZone: tz, drawFrequency: 'CAMPAIGN' });
            assert.lengthOf(once, 1);
        });

        it('parses only real local dates and gives the local calendar day', function () {
            assert.isNull(windows.parseLocal('2026-02-30 10:00', 'America/New_York'));
            assert.isNull(windows.parseLocal('tomorrow', 'America/New_York'));
            assert.equal(windows.dayKey(Date.UTC(2026, 0, 2, 3, 0), 'America/Los_Angeles'), '20260101');
            assert.equal(windows.format(Date.UTC(2026, 6, 4, 16, 0), 'America/Denver'), '2026-07-04 10:00');
        });
    });

    describe('selection algorithm', function () {
        var h;
        var selection;
        var seed = 'ab'.repeat(32);
        beforeEach(function () {
            h = harness();
            var drawHelpers = h.require('scripts/helpers/luckyDrawDrawHelpers');
            selection = {
                ALGORITHM: drawHelpers.ALGORITHM,
                canonical: drawHelpers.getCanonicalSnapshot,
                parse: drawHelpers.parseSnapshot,
                draw: drawHelpers.pickWinners,
                seal: drawHelpers.sealResult
            };
        });

        function items(n, weight) {
            var list = [];
            for (var i = 0; i < n; i++) list.push({ entryId: 'LDE-' + String(1000 + i), participant: 'p' + i, weight: weight || 1 });
            return list;
        }

        it('is deterministic and independent of the order entries were read in', function () {
            var list = items(50);
            var text = selection.canonical(list);
            assert.equal(selection.canonical(list.slice().reverse()), text);
            var parsed = selection.parse(text);
            var a = selection.draw(seed, 'hash', parsed, 3);
            var b = selection.draw(seed, 'hash', selection.parse(text), 3);
            assert.deepEqual(a, b);
            assert.notDeepEqual(selection.draw('cd'.repeat(32), 'hash', parsed, 3).map(function (p) { return p.entryId; }), a.map(function (p) { return p.entryId; }));
        });

        it('lets a participant win only once per draw and never picks weight 0', function () {
            var list = [{ entryId: 'A1', participant: 'p1', weight: 50 }, { entryId: 'A2', participant: 'p1', weight: 50 }, { entryId: 'B1', participant: 'p2', weight: 1 }, { entryId: 'C1', participant: 'p3', weight: 0 }];
            var picks = selection.draw(seed, 'h', list, 5);
            assert.lengthOf(picks, 2);
            assert.sameMembers(picks.map(function (p) { return p.participant; }), ['p1', 'p2']);
        });

        it('is close to uniform over many seeds and follows the weights', function () {
            var crypto = require('crypto');
            var counts = { p0: 0, p1: 0, p2: 0, p3: 0 };
            var weighted = { heavy: 0, light: 0 };
            for (var i = 0; i < 2000; i++) {
                var s = crypto.randomBytes(32).toString('hex');
                counts[selection.draw(s, 'h', items(4), 1)[0].participant] += 1;
                var w = selection.draw(s, 'h', [{ entryId: 'H', participant: 'heavy', weight: 3 }, { entryId: 'L', participant: 'light', weight: 1 }], 1)[0];
                weighted[w.participant] += 1;
            }
            Object.keys(counts).forEach(function (k) { assert.closeTo(counts[k], 500, 100, k); });
            assert.closeTo(weighted.heavy / 2000, 0.75, 0.05);
        });

        it('refuses a weak seed and seals the result', function () {
            assert.throws(function () { selection.draw('1234', 'h', items(3), 1); }, /invalid-seed/);
            var picks = selection.draw(seed, 'h', items(10), 2);
            var sealA = selection.seal({ algorithm: selection.ALGORITHM, seedHash: 'x', seed: seed, snapshotHash: 'h', picks: picks });
            var sealB = selection.seal({ algorithm: selection.ALGORITHM, seedHash: 'x', seed: seed, snapshotHash: 'h', picks: picks.slice().reverse() });
            assert.notEqual(sealA, sealB);
        });
    });
});
