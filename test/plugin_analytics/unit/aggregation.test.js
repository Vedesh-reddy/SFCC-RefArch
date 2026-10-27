'use strict';

var assert = require('chai').assert;
var harness = require('./harness');
var fixtures = require('./fixtures');

/**
 * @param {Object} [options] - harness options
 * @returns {Object} harness with products M1 (rings), V1 (variant of M1), P2 (necklaces), N1 (no category)
 */
function setup(options) {
    var h = harness(options);
    h.require('controllers/Analytics');
    fixtures.product(h, 'M1', { category: 'rings' });
    fixtures.product(h, 'V1', { master: 'M1' });
    fixtures.product(h, 'P2', { category: 'necklaces' });
    fixtures.product(h, 'N1');
    return h;
}

/**
 * @param {Object} h - harness
 * @param {string} type - aggregate type
 * @param {string} key - record key
 * @returns {Object} attributes
 */
function record(h, type, key) {
    var found = h.get(type, key);
    return found ? found.custom : {};
}

describe('plugin_analytics event aggregation job', function () {
    it('builds product, category and site daily totals, rolling variants up to the master', function () {
        var h = setup();
        h.setNow('2026-10-27T15:00:00Z');
        fixtures.beacon(h, [
            { n: 'view_item_list', p: 'M1', l: 'cat:rings', o: 1 },
            { n: 'view_item_list', p: 'P2', l: 'cat:rings', o: 2 },
            { n: 'select_item', p: 'M1', l: 'cat:rings', o: 1 },
            { n: 'view_item', p: 'V1' },
            { n: 'view_item', p: 'N1' }
        ]);
        var status = fixtures.jobs(h).aggregateEvents({});
        assert.equal(status.code, 'OK');
        var m1 = record(h, 'AnalyticsProductDaily', '20261027_M1');
        assert.equal(m1.impressions, 1);
        assert.equal(m1.selections, 1);
        assert.equal(m1.views, 1, 'the variant view counts for the master');
        assert.equal(m1.categoryId, 'rings');
        assert.isNull(h.get('AnalyticsProductDaily', '20261027_V1'));
        var rings = record(h, 'AnalyticsCategoryDaily', '20261027_rings');
        assert.equal(rings.impressions, 1);
        assert.equal(rings.views, 1);
        assert.equal(record(h, 'AnalyticsCategoryDaily', '20261027_necklaces').impressions, 1, 'P2 counts in its own primary category, not the list it was shown in');
        assert.equal(record(h, 'AnalyticsProductDaily', '20261027_N1').views, 1, 'products without a category still count for the product and site');
        var s = record(h, 'AnalyticsSiteDaily', '20261027');
        assert.equal(s.impressions, 2);
        assert.equal(s.views, 2);
        assert.equal(s.eventsAccepted, 5);
        assert.equal(s.batches, 1);
        assert.equal(s.sampleRate, 100);
    });

    it('rejects events for unknown products and keeps site and product totals equal', function () {
        var h = setup();
        fixtures.beacon(h, [{ n: 'view_item', p: 'GONE' }, { n: 'view_item', p: 'M1' }]);
        fixtures.jobs(h).aggregateEvents({});
        var s = h.rows('AnalyticsSiteDaily')[0].custom;
        assert.equal(s.views, 1);
        assert.equal(s.eventsRejected, 1);
        assert.lengthOf(h.rows('AnalyticsProductDaily'), 1);
    });

    it('counts each batch exactly once: batches are removed in the same transaction', function () {
        var h = setup();
        fixtures.beacon(h, [{ n: 'view_item', p: 'M1' }]);
        var jobs = fixtures.jobs(h);
        jobs.aggregateEvents({});
        jobs.aggregateEvents({});
        assert.equal(h.rows('AnalyticsProductDaily')[0].custom.views, 1);
    });

    it('rolls back a failed chunk completely and counts it once on the next run', function () {
        var h = setup();
        fixtures.beacon(h, [{ n: 'view_item', p: 'M1' }]);
        fixtures.beacon(h, [{ n: 'view_item', p: 'P2' }]);
        h.state.failCommitIn = 2; // the lock is the first commit, the chunk the second
        var status = fixtures.jobs(h).aggregateEvents({});
        assert.equal(status.code, 'ERROR');
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 2, 'nothing removed');
        assert.lengthOf(h.rows('AnalyticsProductDaily'), 0, 'nothing counted');
        assert.isNull(h.get('AnalyticsJobCheckpoint', 'writer-lock'), 'the lock is released after a failure');
        fixtures.jobs(h).aggregateEvents({});
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 0);
        assert.equal(h.rows('AnalyticsSiteDaily')[0].custom.views, 2);
    });

    it('processes at most MaxBatches per run, oldest first, and resumes', function () {
        var h = setup();
        for (var i = 0; i < 5; i++) fixtures.beacon(h, [{ n: 'view_item', p: 'M1' }]);
        h.rows('AnalyticsEventBatch').forEach(function (b, index) { b.custom.receivedAt = new Date(Date.now() - (10 - index) * 60000); });
        var newest = h.rows('AnalyticsEventBatch')[4].custom.batchKey;
        fixtures.jobs(h).aggregateEvents({ MaxBatches: 3 });
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 2);
        assert.isNotNull(h.get('AnalyticsEventBatch', newest));
        fixtures.jobs(h).aggregateEvents({ MaxBatches: 3 });
        assert.equal(h.rows('AnalyticsProductDaily')[0].custom.views, 5);
    });

    it('lets only one job write at a time and takes over a lock left by a dead run', function () {
        var h = setup();
        fixtures.beacon(h, [{ n: 'view_item', p: 'M1' }]);
        var aggregation = h.require('scripts/helpers/analyticsAggregationHelpers');
        assert.isTrue(aggregation.acquireLock('reconcile-orders'));
        var status = fixtures.jobs(h).aggregateEvents({});
        assert.equal(status.code, 'LOCKED');
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 1);
        assert.isFalse(aggregation.acquireLock('cleanup'));
        h.get('AnalyticsJobCheckpoint', 'writer-lock').custom.lastRunAt = new Date(Date.now() - 61 * 60000);
        status = fixtures.jobs(h).aggregateEvents({});
        assert.equal(status.code, 'OK');
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 0);
    });

    it('buckets events by the site-time-zone day they were received', function () {
        var h = setup({ offsetHours: -5 });
        h.setNow('2026-10-28T04:30:00Z'); // 23:30 on the 27th in the site time zone
        fixtures.beacon(h, [{ n: 'view_item', p: 'M1' }]);
        h.setNow('2026-10-28T05:30:00Z'); // 00:30 on the 28th
        fixtures.beacon(h, [{ n: 'view_item', p: 'M1' }]);
        fixtures.jobs(h).aggregateEvents({});
        assert.equal(record(h, 'AnalyticsSiteDaily', '20261027').views, 1);
        assert.equal(record(h, 'AnalyticsSiteDaily', '20261028').views, 1);
    });

    it('aggregates search terms, searches without results and selections from search', function () {
        var h = setup();
        h.setNow('2026-10-27T15:00:00Z');
        fixtures.beacon(h, [{ n: 'search', t: 'gold ring', r: 4 }, { n: 'select_item', p: 'M1', l: 'search', o: 2, t: 'gold ring' }, { n: 'search', t: 'unicorn', r: 0 }]);
        fixtures.jobs(h).aggregateEvents({});
        var term = record(h, 'AnalyticsSearchDaily', '20261027_gold_ring');
        assert.equal(term.term, 'gold ring');
        assert.equal(term.searches, 1);
        assert.equal(term.selections, 1);
        assert.equal(record(h, 'AnalyticsSearchDaily', '20261027_unicorn').noResults, 1);
        var s = record(h, 'AnalyticsSiteDaily', '20261027');
        assert.equal(s.searches, 2);
        assert.equal(s.noResultSearches, 1);
        assert.equal(s.searchSelections, 1);
    });

    it('records the lowest sample rate of the day', function () {
        var h = setup({ preferences: { analyticsSampleRate: 50 }, randomInt: 1 });
        fixtures.beacon(h, [{ n: 'view_item', p: 'M1' }]);
        fixtures.jobs(h).aggregateEvents({});
        assert.equal(h.rows('AnalyticsSiteDaily')[0].custom.sampleRate, 50);
    });

    it('pauses collection above analyticsMaxBacklog and resumes below it', function () {
        var h = setup({ preferences: { analyticsMaxBacklog: 1000 } });
        var Transaction = h.mock('dw/system/Transaction');
        var CustomObjectMgr = h.mock('dw/object/CustomObjectMgr');
        Transaction.wrap(function () {
            for (var i = 0; i < 1003; i++) {
                var batch = CustomObjectMgr.createCustomObject('AnalyticsEventBatch', '20261027_' + i);
                batch.custom.day = '20261027';
                batch.custom.receivedAt = new Date();
                batch.custom.events = JSON.stringify([{ n: 'view_item', p: 'M1' }]);
            }
        });
        fixtures.jobs(h).aggregateEvents({ MaxBatches: 2 });
        var checkpoint = h.get('AnalyticsJobCheckpoint', 'aggregate-events').custom;
        assert.equal(checkpoint.backlog, 1001);
        assert.isTrue(checkpoint.collectionPaused);
        fixtures.beacon(h, [{ n: 'view_item', p: 'M1' }]);
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 1001, 'the storefront stops writing');
        fixtures.jobs(h).aggregateEvents({ MaxBatches: 5 });
        assert.isFalse(h.get('AnalyticsJobCheckpoint', 'aggregate-events').custom.collectionPaused);
        assert.equal(h.rows('AnalyticsSiteDaily')[0].custom.views, 7);
    });

    it('does nothing while analytics is disabled, and records every run on its checkpoint', function () {
        var h = setup();
        fixtures.beacon(h, [{ n: 'view_item', p: 'M1' }]);
        h.preferences.analyticsEnabled = false;
        assert.equal(fixtures.jobs(h).aggregateEvents({}).code, 'DISABLED');
        assert.lengthOf(h.rows('AnalyticsEventBatch'), 1);
        h.preferences.analyticsEnabled = true;
        fixtures.jobs(h).aggregateEvents({});
        var checkpoint = h.get('AnalyticsJobCheckpoint', 'aggregate-events').custom;
        assert.equal(checkpoint.status, 'OK');
        assert.instanceOf(checkpoint.lastSuccessAt, Date);
        assert.equal(JSON.parse(checkpoint.counts).events, 1);
    });
});
