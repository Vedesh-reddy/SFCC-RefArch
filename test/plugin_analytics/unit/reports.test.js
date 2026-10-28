'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var harness = require('./harness');
var fixtures = require('./fixtures');

/**
 * @param {Object} h - harness
 * @param {string} day - yyyyMMdd
 * @param {string} productId - product
 * @param {Object} fields - counters
 */
function productDay(h, day, productId, fields) {
    h.mock('dw/system/Transaction').wrap(function () {
        var record = h.mock('dw/object/CustomObjectMgr').createCustomObject('AnalyticsProductDaily', day + '_' + productId);
        Object.assign(record.custom, { day: day, productId: productId, categoryId: fields.categoryId || 'rings' });
        Object.keys(fields).forEach(function (f) { if (f !== 'categoryId') record.custom[f] = fields[f]; });
    });
}

/**
 * @param {Object} h - harness
 * @param {string} day - yyyyMMdd
 * @param {Object} fields - counters
 */
function siteDay(h, day, fields) {
    h.mock('dw/system/Transaction').wrap(function () {
        var record = h.mock('dw/object/CustomObjectMgr').createCustomObject('AnalyticsSiteDaily', day);
        record.custom.day = day;
        Object.keys(fields).forEach(function (f) { record.custom[f] = fields[f]; });
    });
}

describe('plugin_analytics reports', function () {
    var clock;

    // Retention, settled checkout attempts and "yesterday" are computed from the clock.
    beforeEach(function () {
        clock = sinon.useFakeTimers({ now: new Date('2026-10-27T15:00:00Z'), toFake: ['Date'] });
    });

    afterEach(function () {
        clock.restore();
    });

    it('resolves the standard reporting ranges in site days', function () {
        var r = harness().require('scripts/helpers/analyticsReportHelpers');
        var range = function (name, from, to) { return r.resolveRange(name, from, to, '20261027'); };
        assert.include(range('today'), { from: '20261027', to: '20261027', days: 1 });
        assert.include(range('yesterday'), { from: '20261026', to: '20261026' });
        assert.include(range('last-7'), { from: '20261021', to: '20261027', days: 7 });
        assert.include(range('last-30'), { from: '20260928', to: '20261027', days: 30 });
        assert.include(range('month'), { from: '20261001', to: '20261027' });
        assert.include(range('previous-month'), { from: '20260901', to: '20260930', days: 30 });
        assert.include(r.resolveRange('previous-month', null, null, '20260315'), { from: '20260201', to: '20260228' });
        assert.include(range('custom', '2026-02-27', '2026-03-02'), { from: '20260227', to: '20260302', days: 4 });
        assert.include(range('nonsense'), { name: 'last-7' });
        assert.include(range('custom', '2026-02-30', '2026-03-02'), { name: 'last-7', error: 'invalid-date' });
        assert.include(range('custom', '2026-03-02', '2026-03-01'), { error: 'invalid-order' });
        assert.include(range('custom', '2025-01-01', '2026-03-01'), { error: 'range-too-long' });
        assert.include(range('custom', "2026-01-01' OR 1=1", '2026-03-01'), { error: 'invalid-date' });
        assert.include(r.previousRange(range('last-7')), { from: '20261014', to: '20261020', days: 7 });
    });

    it('defines the metrics with safe zero denominators', function () {
        var r = harness().require('scripts/helpers/analyticsReportHelpers');
        assert.isNull(r.rate(5, 0));
        assert.equal(r.rate(1, 3), 33.3);
        var empty = r.getMetrics({ orders: 0, totalCents: 0, selections: 0, impressions: 0, completedFlows: 0, checkoutFlows: 0, settledFlows: 0, settledCompleted: 0, cartSessions: 0, sessions: 0 });
        assert.deepEqual(empty, { averageOrderCents: null, selectionRate: null, checkoutConversionRate: null, checkoutAbandonmentRate: null, cartAbandonmentRate: null, sessionConversionRate: null });
        var m = r.getMetrics({ orders: 4, totalCents: 10001, selections: 25, impressions: 200, completedFlows: 4, checkoutFlows: 10, settledFlows: 8, settledCompleted: 4, cartSessions: 16, sessions: 100 });
        assert.equal(m.averageOrderCents, 2500);
        assert.equal(m.selectionRate, 12.5);
        assert.equal(m.checkoutConversionRate, 40);
        assert.equal(m.checkoutAbandonmentRate, 50, 'only settled attempts can be abandoned');
        assert.equal(m.cartAbandonmentRate, 75);
        assert.equal(m.sessionConversionRate, 4);
        assert.isNull(r.change(5, 0));
        assert.equal(r.change(150, 100), 50);
    });

    it('builds the site report from daily records, filling days without data and counting only settled checkout attempts', function () {
        var h = harness();
        h.setNow('2026-10-27T15:00:00Z');
        siteDay(h, '20261025', { views: 10, orders: 2, totalCents: 5000, checkoutFlows: 4, completedFlows: 2, sampleRate: 50 });
        siteDay(h, '20261027', { views: 5, checkoutFlows: 3 });
        var r = h.require('scripts/helpers/analyticsReportHelpers');
        var report = r.getSiteReport(r.resolveRange('last-7', null, null, '20261027'));
        assert.lengthOf(report.series, 7);
        assert.equal(report.series[0].views, 0);
        assert.equal(report.totals.views, 15);
        assert.equal(report.sampleRate, 50);
        assert.equal(report.totals.checkoutFlows, 7);
        assert.equal(report.totals.settledFlows, 4, "today's attempts are not settled yet");
        var empty = r.getSiteReport(r.resolveRange('custom', '2020-01-01', '2020-01-03'));
        assert.equal(empty.totals.orders, 0);
        assert.lengthOf(empty.series, 3);
    });

    it('computes the funnel in session and event modes without dividing by zero', function () {
        var r = harness().require('scripts/helpers/analyticsReportHelpers');
        var t = { impressionSessions: 100, selectionSessions: 40, viewSessions: 50, cartSessions: 10, checkoutFlows: 8, shippingFlows: 6, paymentFlows: 5, completedFlows: 4, impressions: 0, selections: 0, views: 0, cartAdds: 0, checkoutStarts: 0, shippingSubmits: 0, paymentSubmits: 0, orders: 0 };
        var sessions = r.getFunnel(t, 'sessions');
        assert.deepEqual(sessions.map(function (s) { return s.key; }), ['impressions', 'selections', 'views', 'cart', 'checkout', 'shipping', 'payment', 'purchase']);
        assert.equal(sessions[1].stepRate, 40);
        assert.equal(sessions[1].dropRate, 60);
        assert.equal(sessions[7].stepRate, 80);
        assert.equal(sessions[7].overallRate, 4);
        assert.isNull(sessions[0].stepRate);
        var events = r.getFunnel(t, 'events');
        assert.isNull(events[3].stepRate);
        assert.isNull(events[3].overallRate);
    });

    it('ranks top and bottom 10 with thresholds, deterministic ties and zero-sale catalog products', function () {
        var h = harness({ preferences: { analyticsMinRankingViews: 5, analyticsMinRankingImpressions: 50 } });
        productDay(h, '20261027', 'B', { views: 10, uniqueViews: 8, unitsSold: 2, orders: 2, netCents: 2000, impressions: 60, selections: 0 });
        productDay(h, '20261027', 'A', { views: 10, uniqueViews: 8, unitsSold: 2, orders: 2, netCents: 2000, impressions: 10, selections: 3 });
        productDay(h, '20261026', 'A', { views: 1, uniqueViews: 1 });
        productDay(h, '20261027', 'C', { views: 40, uniqueViews: 30, unitsSold: 0, cartAdds: 9, uniqueCartAdds: 6, impressions: 100, selections: 5 });
        productDay(h, '20261027', 'D', { views: 3, uniqueViews: 2, unitsSold: 1, orders: 1, netCents: 900 });
        var r = h.require('scripts/helpers/analyticsReportHelpers');
        var items = r.summarizeProducts('20261026', '20261027', 1000).items;
        var a = items.filter(function (p) { return p.productId === 'A'; })[0];
        assert.equal(a.views, 11, 'days are summed');
        assert.equal(a.conversionRate, 22.2);
        var lists = r.getRankings(items, ['A', 'B', 'C', 'D', 'Z-NEVER-SEEN']);
        assert.deepEqual(lists.mostViewed.map(function (p) { return p.productId; }), ['C', 'A', 'B', 'D']);
        assert.deepEqual(lists.bestSelling.map(function (p) { return p.productId; }), ['A', 'B', 'D'], 'ties broken by product ID');
        assert.deepEqual(lists.highestConverting.map(function (p) { return p.productId; }), ['B', 'A'], 'D is below the minimum sessions');
        assert.deepEqual(lists.lowestSelling.slice(0, 2).map(function (p) { return p.productId; }), ['C', 'Z-NEVER-SEEN'], 'zero sales: the more viewed first, then catalog products without activity');
        assert.equal(lists.leastViewed[0].productId, 'Z-NEVER-SEEN');
        assert.deepEqual(lists.viewedNoSales.map(function (p) { return p.productId; }), ['C']);
        assert.deepEqual(lists.addedPoorConversion.map(function (p) { return p.productId; }), ['C']);
        assert.deepEqual(lists.impressionsNoSelections.map(function (p) { return p.productId; }), ['B']);
        assert.deepEqual(r.getRankings([], []).mostViewed, [], 'empty data');
        assert.deepEqual(r.sortProducts(items, 'netCents; DROP', false)[0].productId, 'C', 'unknown sort fields fall back to views');
    });

    it('precomputes rankings with the eligible catalog and serves them for the same period only', function () {
        var h = harness();
        h.setNow('2026-10-27T15:00:00Z');
        fixtures.product(h, 'M1', { category: 'rings' });
        fixtures.product(h, 'V1', { master: 'M1' });
        fixtures.product(h, 'OFF', { online: false });
        fixtures.product(h, 'QUIET', { category: 'rings' });
        productDay(h, '20261027', 'M1', { views: 3, unitsSold: 1, netCents: 100 });
        var status = fixtures.jobs(h).generateRankings({});
        assert.equal(status.code, 'OK');
        var r = h.require('scripts/helpers/analyticsReportHelpers');
        var stored = r.getStoredRankings(r.resolveRange('last-7'));
        assert.equal(stored.lists.lowestSelling[0].productId, 'QUIET', 'variants and offline products are not eligible');
        assert.notInclude(JSON.stringify(stored.lists.lowestSelling), 'OFF');
        assert.notInclude(JSON.stringify(stored.lists.lowestSelling), 'V1');
        assert.isNull(r.getStoredRankings(r.resolveRange('custom', '2026-10-21', '2026-10-27')));
        assert.lengthOf(h.rows('AnalyticsRanking'), 4);
    });

    it('summarizes categories without double counting and searches by volume', function () {
        var h = harness();
        h.mock('dw/system/Transaction').wrap(function () {
            var c = h.mock('dw/object/CustomObjectMgr').createCustomObject('AnalyticsCategoryDaily', '20261027_rings');
            Object.assign(c.custom, { day: '20261027', categoryId: 'rings', views: 10, orders: 2, netCents: 500 });
            var s1 = h.mock('dw/object/CustomObjectMgr').createCustomObject('AnalyticsSearchDaily', '20261027_ring');
            Object.assign(s1.custom, { day: '20261027', term: 'ring', searches: 5, noResults: 0, selections: 2 });
            var s2 = h.mock('dw/object/CustomObjectMgr').createCustomObject('AnalyticsSearchDaily', '20261027_zzz');
            Object.assign(s2.custom, { day: '20261027', term: 'zzz', searches: 9, noResults: 9, selections: 0 });
        });
        productDay(h, '20261027', 'M1', { netCents: 300 });
        productDay(h, '20261027', 'M2', { netCents: 200 });
        var r = h.require('scripts/helpers/analyticsReportHelpers');
        var categories = r.summarizeCategories('20261027', '20261027', 100).items;
        assert.equal(categories[0].conversionRate, 20);
        assert.equal(categories[0].bestProduct.productId, 'M1');
        var searches = r.summarizeSearches('20261027', '20261027', 100).items;
        assert.deepEqual(searches.map(function (s) { return s.term; }), ['zzz', 'ring']);
        assert.equal(searches[1].selectionRate, 40);
    });

    it('protects CSV exports against formula injection and quotes delimiters', function () {
        var r = harness().require('scripts/helpers/analyticsReportHelpers');
        assert.equal(r.csvCell('=HYPERLINK("http://x")'), '"\'=HYPERLINK(""http://x"")"');
        assert.equal(r.csvCell('+cmd'), "'+cmd");
        assert.equal(r.csvCell('@SUM(A1)'), "'@SUM(A1)");
        assert.equal(r.csvCell('-2+3'), "'-2+3");
        assert.equal(r.csvCell(-25), '-25', 'negative numbers stay numbers');
        assert.equal(r.csvCell('a,b'), '"a,b"');
        assert.equal(r.csvCell(null), '');
        assert.equal(r.toCsv(['x', 'y'], [[1, 'two']]), 'x,y\r\n1,two\r\n');
    });
});
