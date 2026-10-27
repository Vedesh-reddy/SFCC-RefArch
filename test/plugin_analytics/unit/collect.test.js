'use strict';

var assert = require('chai').assert;
var harness = require('./harness');
var fixtures = require('./fixtures');

/**
 * @param {Object} [options] - harness options
 * @returns {Object} harness with the collect route loaded
 */
function setup(options) {
    var h = harness(options);
    h.require('controllers/Analytics');
    fixtures.product(h, 'P1', { category: 'rings' });
    fixtures.product(h, 'P2', { category: 'rings' });
    return h;
}

/**
 * @param {Object} h - harness
 * @returns {Array} events stored in all batches
 */
function stored(h) {
    return h.rows('AnalyticsEventBatch').reduce(function (all, b) { return all.concat(JSON.parse(b.custom.events)); }, []);
}

describe('plugin_analytics collection (Analytics-Collect)', function () {
    it('stores every allowed browser event in one batch with server-decided first-in-session markers', function () {
        var h = setup();
        fixtures.beacon(h, [
            { n: 'view_item_list', p: 'P1', l: 'cat:rings', o: 1 },
            { n: 'view_item_list', p: 'P2', l: 'cat:rings', o: 2 },
            { n: 'select_item', p: 'P1', l: 'cat:rings', o: 1 },
            { n: 'view_item', p: 'P1' },
            { n: 'search', t: 'Gold  Ring', r: 12 }
        ]);
        var batches = h.rows('AnalyticsEventBatch');
        assert.lengthOf(batches, 1);
        assert.equal(batches[0].custom.source, 'CLIENT');
        assert.match(batches[0].custom.sessionToken, /^[a-f0-9]{24}$/);
        var events = stored(h);
        assert.deepEqual(events.map(function (e) { return e.n; }), ['view_item_list', 'view_item_list', 'select_item', 'view_item', 'search']);
        assert.equal(events[0].s, 1, 'first event of the session-day');
        assert.equal(events[0].f, 1);
        assert.equal(events[0].k, 1);
        assert.isUndefined(events[1].k, 'site-level first only once');
        assert.equal(events[4].t, 'gold ring');
    });

    it('rejects forged purchase, cart and checkout events and unknown event names', function () {
        var h = setup();
        fixtures.beacon(h, [
            { n: 'purchase', p: 'P1', value: 99999 },
            { n: 'add_to_cart', p: 'P1', q: 50 },
            { n: 'begin_checkout' },
            { n: 'add_payment_info', m: 'CREDIT_CARD' },
            { n: 'refund' },
            { n: 'view_item', p: 'P1' }
        ]);
        var batch = h.rows('AnalyticsEventBatch')[0];
        assert.equal(batch.custom.rejected, 5);
        assert.deepEqual(stored(h).map(function (e) { return e.n; }), ['view_item']);
        fixtures.jobs(h).aggregateEvents({});
        var site = h.rows('AnalyticsSiteDaily')[0].custom;
        assert.equal(site.orders || 0, 0);
        assert.equal(site.cartAdds || 0, 0);
        assert.equal(site.eventsRejected, 5);
    });

    it('rejects malformed payloads: oversized, invalid JSON, bad batch IDs, injection in IDs, bad positions', function () {
        var h = setup();
        fixtures.beacon(h, [], { body: 'x'.repeat(16385) });
        fixtures.beacon(h, [], { body: '{not json' });
        fixtures.beacon(h, [{ n: 'view_item', p: 'P1' }], { batchId: 'SHORT' });
        fixtures.beacon(h, [{ n: 'view_item', p: 'P1' }], { batchId: '../../etc/passwd0000' });
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 0);
        fixtures.beacon(h, [
            { n: 'view_item', p: '<script>alert(1)</script>' },
            { n: 'view_item', p: 'P1" OR 1=1' },
            { n: 'view_item', p: 'x'.repeat(101) },
            { n: 'view_item_list', p: 'P1', l: 'cat:rings', o: 0 },
            { n: 'view_item_list', p: 'P1', l: 'cat:rings', o: 1.5 },
            { n: 'view_item_list', p: 'P1', l: 'bad list<', o: 1 },
            { n: 'search', t: 'ring', r: -1 },
            null,
            'view_item'
        ]);
        assert.equal(h.rows('AnalyticsEventBatch')[0].custom.rejected, 9);
        assert.lengthOf(stored(h), 0);
    });

    it('caps the events accepted per batch at analyticsBatchSize and counts the rest as rejected', function () {
        var h = setup({ preferences: { analyticsBatchSize: 3 } });
        var events = [];
        for (var i = 1; i <= 10; i++) events.push({ n: 'view_item_list', p: 'P1', l: 'cat:rings', o: i });
        fixtures.beacon(h, events);
        assert.lengthOf(stored(h), 3);
        assert.equal(h.rows('AnalyticsEventBatch')[0].custom.rejected, 7);
    });

    it('ignores a replayed or retried batch (same batch ID)', function () {
        var h = setup();
        fixtures.beacon(h, [{ n: 'select_item', p: 'P1', l: 'cat:rings', o: 1 }], { batchId: 'a'.repeat(24) });
        fixtures.beacon(h, [{ n: 'select_item', p: 'P1', l: 'cat:rings', o: 1 }], { batchId: 'a'.repeat(24) });
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 1);
        fixtures.jobs(h).aggregateEvents({});
        assert.equal(h.rows('AnalyticsProductDaily')[0].custom.selections, 1);
    });

    it('counts repeated selections and views as events but only once per session as unique', function () {
        var h = setup();
        fixtures.beacon(h, [{ n: 'select_item', p: 'P1', l: 'cat:rings', o: 1 }, { n: 'view_item', p: 'P1' }]);
        fixtures.beacon(h, [{ n: 'select_item', p: 'P1', l: 'cat:rings', o: 1 }, { n: 'view_item', p: 'P1' }]);
        fixtures.jobs(h).aggregateEvents({});
        var p = h.rows('AnalyticsProductDaily')[0].custom;
        assert.equal(p.selections, 2);
        assert.equal(p.uniqueSelections, 1);
        assert.equal(p.views, 2, 'a refresh is another page view');
        assert.equal(p.uniqueViews, 1, 'but not another unique-session view');
        var site = h.rows('AnalyticsSiteDaily')[0].custom;
        assert.equal(site.sessions, 1);
        assert.equal(site.viewSessions, 1);
    });

    it('keeps the session state under the 2000-character session string limit', function () {
        var h = setup({ preferences: { analyticsBatchSize: 50, analyticsMaxBatchesPerMinute: 120 } });
        for (var b = 0; b < 8; b++) {
            var events = [];
            for (var i = 0; i < 50; i++) {
                fixtures.product(h, 'Q' + b + '-' + i);
                events.push({ n: 'view_item_list', p: 'Q' + b + '-' + i, l: 'cat:rings', o: i + 1 });
            }
            fixtures.beacon(h, events);
        }
        assert.isBelow(global.session.privacy.analyticsState.length, 2000);
        assert.lengthOf(stored(h), 400, 'events beyond the marker list are still counted');
        assert.lengthOf(stored(h).filter(function (e) { return e.f; }), h.require('scripts/helpers/analyticsHelpers').MAX_SEEN);
    });

    it('starts new first-in-session markers on a new reporting day', function () {
        var h = setup();
        h.setNow('2026-10-27T12:00:00Z');
        fixtures.beacon(h, [{ n: 'view_item', p: 'P1' }]);
        h.setNow('2026-10-28T12:00:00Z');
        fixtures.beacon(h, [{ n: 'view_item', p: 'P1' }]);
        var events = stored(h);
        assert.equal(events[0].f, 1);
        assert.equal(events[1].f, 1);
        assert.sameMembers(h.rows('AnalyticsEventBatch').map(function (b) { return b.custom.day; }), ['20261027', '20261028']);
    });

    it('rate-limits a session and reports the dropped events with its next accepted batch', function () {
        var h = setup({ preferences: { analyticsMaxBatchesPerMinute: 2 } });
        fixtures.beacon(h, [{ n: 'view_item', p: 'P1' }]);
        fixtures.beacon(h, [{ n: 'view_item', p: 'P1' }]);
        fixtures.beacon(h, [{ n: 'view_item', p: 'P1' }, { n: 'view_item', p: 'P2' }]);
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 2);
        var saved = JSON.parse(global.session.privacy.analyticsState);
        assert.equal(saved.x, 2);
        saved.r = [0, 0];
        global.session.privacy.analyticsState = JSON.stringify(saved);
        fixtures.beacon(h, [{ n: 'view_item', p: 'P1' }]);
        fixtures.jobs(h).aggregateEvents({});
        assert.equal(h.rows('AnalyticsSiteDaily')[0].custom.eventsDropped, 2);
    });

    it('accepts only same-origin requests', function () {
        var h = setup();
        fixtures.beacon(h, [{ n: 'view_item', p: 'P1' }], { headers: { origin: 'https://evil.example' } });
        fixtures.beacon(h, [{ n: 'view_item', p: 'P1' }], { headers: { referer: 'https://shop.example.com.evil.example/x' } });
        fixtures.beacon(h, [{ n: 'view_item', p: 'P1' }], { headers: {} });
        fixtures.beacon(h, [{ n: 'view_item', p: 'P1' }], { headers: { origin: 'http://shop.example.com' } });
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 0);
        var res = fixtures.beacon(h, [{ n: 'view_item', p: 'P1' }], { headers: { referer: 'https://shop.example.com/s/site/product.html' } });
        assert.equal(res.status, 204);
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 1);
    });

    it('stores nothing when disabled, without consent, on a non-USD site, or for an unsampled session', function () {
        var h = setup({ preferences: { analyticsEnabled: false } });
        fixtures.beacon(h, [{ n: 'view_item', p: 'P1' }]);
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 0);

        h = setup();
        global.session.trackingAllowed = false;
        fixtures.beacon(h, [{ n: 'view_item', p: 'P1' }]);
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 0);

        h = setup({ preferences: { analyticsRequireConsent: false } });
        global.session.trackingAllowed = false;
        fixtures.beacon(h, [{ n: 'view_item', p: 'P1' }]);
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 1);

        h = setup();
        h.state.siteCurrency = 'EUR';
        fixtures.beacon(h, [{ n: 'view_item', p: 'P1' }]);
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 0);

        h = setup({ preferences: { analyticsSampleRate: 10 }, randomInt: 50 });
        fixtures.beacon(h, [{ n: 'view_item', p: 'P1' }]);
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 0);
        assert.isFalse(JSON.parse(global.session.privacy.analyticsState).s, 'the decision sticks to the session');

        h = setup({ preferences: { analyticsSampleRate: 10 }, randomInt: 3 });
        fixtures.beacon(h, [{ n: 'view_item', p: 'P1' }]);
        assert.equal(h.rows('AnalyticsEventBatch')[0].custom.sampleRate, 10);
    });

    it('pauses collection while the job reports a backlog, counting the events as dropped', function () {
        var h = setup();
        var aggregation = h.require('scripts/helpers/analyticsAggregationHelpers');
        aggregation.saveCheckpoint('aggregate-events', { collectionPaused: true });
        fixtures.beacon(h, [{ n: 'view_item', p: 'P1' }, { n: 'view_item', p: 'P2' }]);
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 0);
        assert.equal(JSON.parse(global.session.privacy.analyticsState).x, 2);
    });

    it('never stores search terms that look like personal data, and only with search tracking on', function () {
        var helpers = setup().require('scripts/helpers/analyticsHelpers');
        assert.equal(helpers.cleanSearchTerm('  Red   Dress '), 'red dress');
        assert.isNull(helpers.cleanSearchTerm('jane.doe@example.com'));
        assert.isNull(helpers.cleanSearchTerm('555-123-4567'));
        assert.isNull(helpers.cleanSearchTerm('order 1234567'));
        assert.isNull(helpers.cleanSearchTerm('<img src=x>'));
        assert.isNull(helpers.cleanSearchTerm('x'.repeat(51)));
        assert.equal(helpers.cleanSearchTerm("men's 501"), "men's 501");

        var h = setup({ preferences: { analyticsSearchTrackingEnabled: false } });
        fixtures.beacon(h, [{ n: 'search', t: 'ring', r: 3 }, { n: 'select_item', p: 'P1', l: 'search', o: 1, t: 'ring' }]);
        var events = stored(h);
        assert.lengthOf(events, 1);
        assert.isUndefined(events[0].t, 'no term on the selection either');
    });

    it('answers 204 and stores nothing when the helper fails', function () {
        var h = setup({ mocks: { 'dw/system/Transaction': { wrap: function () { throw new Error('db down'); } } } });
        var res = fixtures.beacon(h, [{ n: 'view_item', p: 'P1' }]);
        assert.equal(res.status, 204);
        assert.equal(res.printed, '');
        assert.isTrue(h.state.logs.some(function (l) { return l.level === 'error' && /db down/.test(l.message); }));
    });
});
