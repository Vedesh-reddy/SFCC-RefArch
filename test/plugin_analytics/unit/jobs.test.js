'use strict';

var assert = require('chai').assert;
var harness = require('./harness');
var fixtures = require('./fixtures');

/**
 * @param {Object} h - harness
 * @param {string} type - custom object type
 * @param {string} key - key
 * @param {Object} fields - attributes
 */
function create(h, type, key, fields) {
    h.mock('dw/system/Transaction').wrap(function () {
        var record = h.mock('dw/object/CustomObjectMgr').createCustomObject(type, key);
        Object.keys(fields).forEach(function (f) { record.custom[f] = fields[f]; });
    });
}

describe('plugin_analytics cleanup and integrity jobs', function () {
    it('removes aggregates older than the retention period and stale batches, in bounded runs', function () {
        var h = harness({ preferences: { analyticsRetentionDays: 31 } });
        h.setNow('2026-10-27T15:00:00Z');
        create(h, 'AnalyticsSiteDaily', '20260901', { day: '20260901', views: 1 });
        create(h, 'AnalyticsSiteDaily', '20261020', { day: '20261020', views: 1 });
        create(h, 'AnalyticsProductDaily', '20260901_P1', { day: '20260901', productId: 'P1' });
        create(h, 'AnalyticsProductDaily', '20260902_P1', { day: '20260902', productId: 'P1' });
        create(h, 'AnalyticsCategoryDaily', '20260901_rings', { day: '20260901', categoryId: 'rings' });
        create(h, 'AnalyticsSearchDaily', '20260901_ring', { day: '20260901', term: 'ring' });
        create(h, 'AnalyticsEventBatch', 'old', { day: '20261001', receivedAt: new Date(Date.now() - 8 * 86400000), events: '[]' });
        create(h, 'AnalyticsEventBatch', 'new', { day: '20261027', receivedAt: new Date(), events: '[]' });
        var status = fixtures.jobs(h).cleanup({ MaxItems: 3 });
        assert.equal(status.code, 'OK');
        assert.deepEqual(JSON.parse(status.message), { removed: 2, staleBatches: 1 });
        fixtures.jobs(h).cleanup({});
        assert.deepEqual(h.rows('AnalyticsSiteDaily').map(function (r) { return r.custom.day; }), ['20261020']);
        assert.lengthOf(h.rows('AnalyticsProductDaily'), 0);
        assert.lengthOf(h.rows('AnalyticsCategoryDaily'), 0);
        assert.lengthOf(h.rows('AnalyticsSearchDaily'), 0);
        assert.deepEqual(h.rows('AnalyticsEventBatch').map(function (r) { return r.custom.batchKey; }), ['new']);
        assert.isTrue(h.state.logs.some(function (l) { return l.level === 'warn' && /never aggregated/.test(l.message); }));
    });

    it('finds no problems after collection, aggregation and reconciliation of the same activity', function () {
        var h = harness();
        h.require('controllers/Analytics');
        h.require('controllers/Cart');
        fixtures.product(h, 'P1', { category: 'rings' });
        h.setNow('2026-10-26T15:00:00Z');
        fixtures.beacon(h, [{ n: 'view_item_list', p: 'P1', l: 'cat:rings', o: 1 }, { n: 'view_item', p: 'P1' }]);
        fixtures.basket(h, [['P1', 2, 10]]);
        h.run('AddProduct', { form: { pid: 'P1', quantity: '2' }, viewData: { error: false, pliUUID: 'pli-0' } });
        fixtures.order(h, '1', { created: new Date('2026-10-26T16:00:00Z'), lines: [['P1', 2, 20]] });
        var jobs = fixtures.jobs(h);
        jobs.aggregateEvents({});
        jobs.reconcileOrders({});
        h.setNow('2026-10-27T15:00:00Z');
        var status = jobs.integrityCheck({ Days: 2 });
        assert.equal(status.code, 'OK', status.message);
        var result = JSON.parse(h.get('AnalyticsJobCheckpoint', 'integrity-check').custom.counts);
        assert.equal(result.days, 2);
        assert.equal(result.daysWithoutData, 1);
        assert.deepEqual(result.problems, []);
    });

    it('reports mismatches, unreconciled orders, misplaced records and stale aggregation', function () {
        var h = harness();
        h.setNow('2026-10-27T15:00:00Z');
        create(h, 'AnalyticsSiteDaily', '20261026', { day: '20261026', views: 5, orders: 0 });
        create(h, 'AnalyticsProductDaily', '20261026_P1', { day: '20261026', productId: 'P1', views: 4 });
        create(h, 'AnalyticsProductDaily', '20261026_P9', { day: '20261026', productId: 'P2', views: 1 });
        fixtures.order(h, '1', { created: new Date('2026-10-26T16:00:00Z'), lines: [['P1', 1, 20]] });
        var status = fixtures.jobs(h).integrityCheck({ Days: 1 });
        assert.equal(status.code, 'ATTENTION');
        var problems = JSON.parse(h.get('AnalyticsJobCheckpoint', 'integrity-check').custom.counts).problems.join('\n');
        assert.include(problems, 'does not match its product');
        assert.include(problems, '1 qualifying orders, reports show 0');
        assert.include(problems, 'event aggregation has not succeeded');
    });

    it('wires every job to a status: DISABLED when analytics is off, ERROR when the step throws', function () {
        var h = harness({ preferences: { analyticsEnabled: false } });
        var jobs = fixtures.jobs(h);
        ['aggregateEvents', 'reconcileOrders', 'generateRankings', 'cleanup', 'integrityCheck'].forEach(function (step) {
            assert.equal(jobs[step]({}).code, 'DISABLED', step);
        });
        h = harness({ mocks: { 'dw/catalog/ProductMgr': { queryAllSiteProducts: function () { throw new Error('catalog unavailable'); } } } });
        var status = fixtures.jobs(h).generateRankings({});
        assert.equal(status.code, 'ERROR');
        assert.equal(h.get('AnalyticsJobCheckpoint', 'generate-rankings').custom.status, 'ERROR');
    });
});
