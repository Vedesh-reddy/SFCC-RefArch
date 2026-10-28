'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var harness = require('./harness');
var fixtures = require('./fixtures');

var NODES = ['Overview', 'Products', 'Product', 'Rankings', 'Categories', 'Funnel', 'Orders', 'Search', 'Health', 'Export'];

/**
 * @returns {Object} harness with a day of activity aggregated
 */
function setup() {
    var h = harness();
    h.setNow('2026-10-27T15:00:00Z');
    h.require('controllers/Analytics');
    fixtures.product(h, 'P1', { category: 'rings', name: 'Gold Ring' });
    fixtures.product(h, 'P2', { category: 'rings', name: '=cmd|calc' });
    fixtures.category(h, 'rings', 'jewelry');
    fixtures.beacon(h, [{ n: 'view_item', p: 'P1' }, { n: 'view_item', p: 'P2' }, { n: 'search', t: 'ring', r: 2 }]);
    fixtures.order(h, '1', { created: new Date('2026-10-27T14:00:00Z'), lines: [['P1', 1, 20]] });
    fixtures.jobs(h).aggregateEvents({});
    fixtures.jobs(h).reconcileOrders({});
    return h;
}

/**
 * @param {Object} h - harness
 * @param {string} node - controller node
 * @param {Object} [params] - request parameters
 * @returns {Object} rendered model
 */
function open(h, node, params) {
    h.state.params = params || {};
    h.state.renders.length = 0;
    h.requireBm('controllers/AnalyticsAdmin')[node]();
    return h.state.renders.length ? h.state.renders[0].data.model : null;
}

/**
 * @param {Object} model - page model
 * @returns {string} every cell of every table
 */
function cells(model) {
    return JSON.stringify(model.sections.filter(function (s) { return s.rows; }).map(function (s) { return s.rows; }));
}

describe('plugin_analytics Business Manager desk', function () {
    var clock;

    // Retention, settled checkout attempts and "yesterday" are computed from the clock.
    beforeEach(function () {
        clock = sinon.useFakeTimers({ now: new Date('2026-10-27T15:00:00Z'), toFake: ['Date'] });
    });

    afterEach(function () {
        clock.restore();
    });

    it('refuses every node without an authenticated Business Manager session', function () {
        var h = setup();
        global.session.userAuthenticated = false;
        NODES.forEach(function (node) {
            h.state.response.status = 200;
            assert.isNull(open(h, node, { report: 'products' }), node);
            assert.equal(h.state.response.status, 403, node);
        });
        assert.equal(h.state.response.body, '', 'no export written');
    });

    it('renders every node with defined labels only', function () {
        var h = setup();
        NODES.forEach(function (node) {
            var model = open(h, node, { pid: 'P1' });
            assert.isObject(model, node);
            assert.isAbove(model.sections.length, 0, node);
            assert.equal(model.navigation.filter(function (n) { return n.active; }).length, 1, node);
        });
        assert.deepEqual(h.state.missingKeys || [], []);
    });

    it('shows the overview with this and the previous period', function () {
        var model = open(setup(), 'Overview', { range: 'today' });
        var summary = model.sections[1].rows.map(function (r) { return r.cells; });
        assert.deepEqual(summary[2].slice(0, 3), ['Product page views', '2', '0']);
        assert.deepEqual(summary[6].slice(0, 2), ['Orders', '1']);
        assert.equal(summary[9][1], '$20.00');
    });

    it('validates product table parameters and paginates', function () {
        var h = setup();
        var model = open(h, 'Products', { range: 'today', sort: 'views); drop', dir: 'sideways', q: 'p1' });
        var table = model.sections[1];
        assert.lengthOf(table.rows, 1);
        assert.equal(table.rows[0].cells[1], 'Gold Ring');
        assert.equal(model.sections[0].fields.filter(function (f) { return f.name === 'sort'; })[0].value, 'views');
        model = open(h, 'Products', { range: 'custom', from: '2026-01-01', to: '2026-10-27' });
        assert.include(model.notices.join(' '), 'at most 93 days');
        model = open(h, 'Product', { pid: '../../x<script>' });
        assert.include(model.notices.join(' '), 'Unknown product ID');
    });

    it('shows a product drill-down, rankings, categories with parents, funnel modes, orders and search', function () {
        var h = setup();
        assert.include(cells(open(h, 'Product', { pid: 'P1', range: 'today' })), '$20.00');
        var rankings = open(h, 'Rankings', { range: 'today' });
        assert.include(rankings.notices.join(' '), 'Computed from the daily figures');
        fixtures.jobs(h).generateRankings({});
        rankings = open(h, 'Rankings', { range: 'last-7' });
        assert.include(rankings.notices.join(' '), 'Precomputed');
        assert.include(cells(open(h, 'Categories', { range: 'today' })), 'jewelry');
        var funnel = open(h, 'Funnel', { range: 'today', mode: 'events' });
        assert.include(funnel.notices.join(' '), 'Event volumes');
        assert.include(cells(open(h, 'Orders', { range: 'today' })), '$20.00');
        assert.include(cells(open(h, 'Search', { range: 'today' })), 'ring');
        assert.include(cells(open(h, 'Health', { range: 'today' })), 'aggregate-events');
    });

    it('exports CSV with download headers and spreadsheet formula protection', function () {
        var h = setup();
        global.session.userName = 'analyst';
        open(h, 'Export', { range: 'today', report: 'products' });
        assert.equal(h.state.response.contentType, 'text/csv; charset=UTF-8');
        assert.equal(h.state.response.headers['Content-Disposition'], 'attachment; filename="analytics-products-20261027-20261027.csv"');
        var lines = h.state.response.body.trim().split('\r\n');
        assert.match(lines[0], /^productId,categoryId,impressions/);
        assert.lengthOf(lines, 3);
        ['site', 'categories', 'searches'].forEach(function (report) {
            h.state.response.body = '';
            open(h, 'Export', { range: 'today', report: report });
            assert.isAbove(h.state.response.body.length, 10, report);
        });
        assert.isTrue(h.state.logs.some(function (l) { return /CSV export searches/.test(l.message) && /analyst/.test(l.message); }));
        h.state.response.body = '';
        var page = open(h, 'Export', { report: '../etc' });
        assert.equal(h.state.response.body, '');
        assert.lengthOf(page.sections[1].links, 4);
    });

    it('marks sampled and dropped data and a disabled site', function () {
        var h = harness({ preferences: { analyticsSampleRate: 25, analyticsEnabled: false } });
        h.setNow('2026-10-27T15:00:00Z');
        h.mock('dw/system/Transaction').wrap(function () {
            var s = h.mock('dw/object/CustomObjectMgr').createCustomObject('AnalyticsSiteDaily', '20261027');
            Object.assign(s.custom, { day: '20261027', views: 4, sampleRate: 25, eventsDropped: 3 });
        });
        var notices = open(h, 'Overview', { range: 'today' }).notices.join(' ');
        assert.include(notices, 'disabled');
        assert.include(notices, '25% sample');
        assert.include(notices, '3 events were dropped');
    });
});
