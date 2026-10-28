'use strict';

/**
 * Business Manager reports of the storefront analytics (Merchant Tools > Storefront Analytics).
 * Every node is registered under a permission-scoped menu action in bm_extensions.xml, so the
 * platform checks the user's role before the node runs. Reports are read-only, take only
 * allowlisted or pattern-checked parameters, and read the selected site's own aggregates
 * (the analytics custom objects are site-scoped).
 */

var ISML = require('dw/template/ISML');
var URLUtils = require('dw/web/URLUtils');
var Resource = require('dw/web/Resource');
var Logger = require('dw/system/Logger');
var analyticsHelpers = require('*/cartridge/scripts/helpers/analyticsHelpers');
var reportHelpers = require('*/cartridge/scripts/helpers/analyticsReportHelpers');

var log = Logger.getLogger('plugin-analytics', 'analytics-admin');
var PAGE_SIZE = 50;
var MAX_RECORDS = 100000;
var JOBS = ['aggregate-events', 'reconcile-orders', 'generate-rankings', 'cleanup', 'integrity-check'];
var EXPORTS = ['site', 'products', 'categories', 'searches'];

/**
 * @param {string} key - resource key
 * @returns {string} label
 */
function msg(key) {
    return Resource.msg(key, 'analyticsadmin', key);
}

/**
 * @param {string} name - parameter
 * @returns {string} trimmed value of at most 100 characters
 */
function param(name) {
    var value = request.httpParameterMap.get(name);
    return value && value.submitted ? String(value.stringValue || '').trim().slice(0, 100) : '';
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
 * @param {number} value - count
 * @returns {string} count with thousands separators
 */
function num(value) {
    return String(Math.round(value || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * @param {?number} cents - amount
 * @returns {string} USD
 */
function usd(cents) {
    if (cents === null || cents === undefined) return '-';
    var Money = require('dw/value/Money');
    return require('dw/util/StringUtils').formatMoney(new Money(cents / 100, 'USD'));
}

/**
 * @param {?number} value - percentage
 * @returns {string} text
 */
function pct(value) {
    return value === null || value === undefined ? '-' : value.toFixed(1) + '%';
}

/**
 * @param {?number} value - change in percent
 * @returns {string} signed text
 */
function delta(value) {
    if (value === null) return '-';
    return (value > 0 ? '+' : '') + value.toFixed(1) + '%';
}

/**
 * @returns {Object} reporting range from the request
 */
function getRange() {
    return reportHelpers.resolveRange(param('range'), param('from'), param('to'));
}

/**
 * @param {string} node - controller node
 * @param {Object} range - reporting range
 * @param {Array} [extra] - more name/value pairs
 * @returns {string} URL that keeps the range
 */
function url(node, range, extra) {
    var args = ['AnalyticsAdmin-' + node, 'range', range.name];
    if (range.name === 'custom') args.push('from', reportHelpers.formatDay(range.from), 'to', reportHelpers.formatDay(range.to));
    return URLUtils.url.apply(URLUtils, args.concat(extra || [])).toString();
}

/**
 * @param {string} node - controller node
 * @param {Object} range - reporting range
 * @param {Object[]} [fields] - extra filter fields
 * @returns {Object} filter form section
 */
function filter(node, range, fields) {
    return {
        type: 'form',
        action: URLUtils.url('AnalyticsAdmin-' + node).toString(),
        fields: [
            {
                name: 'range',
                label: msg('filter.range'),
                type: 'select',
                value: range.name,
                options: reportHelpers.RANGES.map(function (name) { return { value: name, label: msg('range.' + name) }; })
            },
            { name: 'from', label: msg('filter.from'), type: 'date', value: reportHelpers.formatDay(range.from) },
            { name: 'to', label: msg('filter.to'), type: 'date', value: reportHelpers.formatDay(range.to) }
        ].concat(fields || []),
        submit: msg('filter.apply')
    };
}

/**
 * @param {Object} model - {title, node, range, sections, notices}
 */
function render(model) {
    var notices = model.notices || [];
    if (!analyticsHelpers.isEnabled(null)) notices.unshift(msg('notice.disabled'));
    if (model.range && model.range.error) notices.unshift(msg('error.' + model.range.error));
    model.notices = notices;
    model.rangeLabel = model.range ? msg('range.' + model.range.name) + ': ' + model.range.label : '';
    model.navigation = ['Overview', 'Products', 'Rankings', 'Categories', 'Funnel', 'Orders', 'Search', 'Health', 'Export'].map(function (node) {
        return { label: msg('nav.' + node.toLowerCase()), url: url(node, model.range || getRange()), active: node === model.node };
    });
    ISML.renderTemplate('analyticsadmin/page', { model: model });
}

/**
 * @param {Object[]} series - daily values
 * @param {string} field - value shown
 * @param {Function} format - value to text
 * @returns {Object} bar chart section (the numbers are in the table cells too)
 */
function bars(series, field, format) {
    var max = series.reduce(function (m, d) { return Math.max(m, d[field]); }, 0);
    return series.map(function (d) {
        return { label: reportHelpers.formatDay(d.day), width: String(max > 0 ? Math.round((d[field] / max) * 100) : 0), text: format(d[field]) };
    });
}

/**
 * @param {Object} report - site report
 * @returns {string[]} notices about sampling and dropped events
 */
function collectionNotices(report) {
    var notices = [];
    if (report.sampleRate < 100) notices.push(msg('notice.sampled').replace('{0}', String(report.sampleRate)));
    if (report.totals.eventsDropped > 0) notices.push(msg('notice.dropped').replace('{0}', num(report.totals.eventsDropped)));
    return notices;
}

/**
 * @param {string} productId - product
 * @returns {string} product name, empty when the product no longer exists
 */
function productName(productId) {
    var product = require('dw/catalog/ProductMgr').getProduct(productId);
    return product ? String(product.name || '') : '';
}

exports.Overview = function () {
    if (!allowed()) return;
    var range = getRange();
    var report = reportHelpers.getSiteReport(range);
    var previous = reportHelpers.getSiteReport(reportHelpers.previousRange(range));
    var t = report.totals;
    var p = previous.totals;
    var metrics = reportHelpers.getMetrics(t);
    var before = reportHelpers.getMetrics(p);
    var row = function (key, current, last, format) { return { cells: [msg(key), format(current), format(last), delta(reportHelpers.change(current, last))] }; };
    var rateRow = function (key, current, last) { return { cells: [msg(key), pct(current), pct(last), current === null || last === null ? '-' : (current - last > 0 ? '+' : '') + (current - last).toFixed(1) + ' pts'] }; };
    render({
        title: msg('nav.overview'),
        node: 'Overview',
        range: range,
        notices: collectionNotices(report),
        sections: [
            filter('Overview', range),
            {
                type: 'table',
                title: msg('section.summary'),
                columns: [msg('column.metric'), msg('column.current'), msg('column.previous'), msg('column.change')],
                rows: [
                    row('metric.impressions', t.impressions, p.impressions, num),
                    row('metric.selections', t.selections, p.selections, num),
                    row('metric.views', t.views, p.views, num),
                    row('metric.cartAdds', t.cartAdds, p.cartAdds, num),
                    row('metric.unitsAdded', t.unitsAdded, p.unitsAdded, num),
                    row('metric.checkoutStarts', t.checkoutStarts, p.checkoutStarts, num),
                    row('metric.orders', t.orders, p.orders, num),
                    row('metric.unitsSold', t.unitsSold, p.unitsSold, num),
                    row('metric.grossCents', t.grossCents, p.grossCents, usd),
                    row('metric.netCents', t.netCents, p.netCents, usd),
                    row('metric.averageOrder', metrics.averageOrderCents, before.averageOrderCents, usd),
                    rateRow('metric.checkoutConversion', metrics.checkoutConversionRate, before.checkoutConversionRate),
                    rateRow('metric.cartAbandonment', metrics.cartAbandonmentRate, before.cartAbandonmentRate),
                    rateRow('metric.checkoutAbandonment', metrics.checkoutAbandonmentRate, before.checkoutAbandonmentRate),
                    rateRow('metric.selectionRate', metrics.selectionRate, before.selectionRate)
                ]
            },
            { type: 'bars', title: msg('section.trend.views'), rows: bars(report.series, 'views', num) },
            { type: 'bars', title: msg('section.trend.net'), rows: bars(report.series, 'netCents', usd) },
            {
                type: 'table',
                title: msg('section.daily'),
                columns: [msg('column.day'), msg('metric.impressions'), msg('metric.views'), msg('metric.cartAdds'), msg('metric.checkoutStarts'), msg('metric.orders'), msg('metric.netCents')],
                rows: report.series.map(function (d) { return { cells: [reportHelpers.formatDay(d.day), num(d.impressions), num(d.views), num(d.cartAdds), num(d.checkoutStarts), num(d.orders), usd(d.netCents)] }; })
            }
        ]
    });
};
exports.Overview.public = true;

exports.Products = function () {
    if (!allowed()) return;
    var range = getRange();
    var query = param('q').toLowerCase();
    var category = param('category');
    var sort = reportHelpers.PRODUCT_SORTS.indexOf(param('sort')) >= 0 ? param('sort') : 'views';
    var ascending = param('dir') === 'asc';
    var offset = Math.max(0, Math.floor(Number(param('offset')) || 0));
    var model = { title: msg('nav.products'), node: 'Products', range: range, notices: [], sections: [] };
    var extra = [
        { name: 'q', label: msg('filter.product'), type: 'text', value: param('q') },
        { name: 'category', label: msg('filter.category'), type: 'text', value: category },
        { name: 'sort', label: msg('filter.sort'), type: 'select', value: sort, options: reportHelpers.PRODUCT_SORTS.map(function (s) { return { value: s, label: msg('sort.' + s) }; }) },
        { name: 'dir', label: msg('filter.direction'), type: 'select', value: ascending ? 'asc' : 'desc', options: [{ value: 'desc', label: msg('sort.desc') }, { value: 'asc', label: msg('sort.asc') }] }
    ];
    model.sections.push(filter('Products', range, extra));
    if (range.days > reportHelpers.MAX_PRODUCT_RANGE_DAYS) {
        model.notices.push(msg('error.product-range'));
        render(model);
        return;
    }
    var summary = reportHelpers.summarizeProducts(range.from, range.to, MAX_RECORDS);
    if (summary.truncated) model.notices.push(msg('notice.truncated'));
    var items = reportHelpers.sortProducts(summary.items.filter(function (p) {
        return (!query || p.productId.toLowerCase().indexOf(query) >= 0) && (!category || p.categoryId === category);
    }), sort, ascending);
    var pageItems = items.slice(offset, offset + PAGE_SIZE);
    var paging = ['q', param('q'), 'category', category, 'sort', sort, 'dir', ascending ? 'asc' : 'desc'];
    model.sections.push({
        type: 'table',
        columns: [msg('column.product'), msg('column.name'), msg('column.category'), msg('metric.impressions'), msg('metric.selections'), msg('metric.views'), msg('metric.cartAdds'),
            msg('metric.unitsAdded'), msg('metric.unitsSold'), msg('metric.grossCents'), msg('metric.netCents'), msg('metric.conversion')],
        rows: pageItems.map(function (p) {
            return {
                link: url('Product', range, ['pid', p.productId]),
                cells: [p.productId, productName(p.productId), p.categoryId, num(p.impressions), num(p.selections), num(p.views), num(p.cartAdds), num(p.unitsAdded),
                    num(p.unitsSold), usd(p.grossCents), usd(p.netCents), pct(p.conversionRate)]
            };
        })
    }, {
        type: 'pager',
        total: num(items.length),
        previous: offset > 0 ? url('Products', range, paging.concat(['offset', String(Math.max(0, offset - PAGE_SIZE))])) : null,
        next: offset + PAGE_SIZE < items.length ? url('Products', range, paging.concat(['offset', String(offset + PAGE_SIZE)])) : null
    });
    render(model);
};
exports.Products.public = true;

exports.Product = function () {
    if (!allowed()) return;
    var range = getRange();
    var productId = param('pid');
    var model = { title: msg('nav.product'), node: 'Products', range: range, back: url('Products', range), notices: [], sections: [] };
    if (!analyticsHelpers.PRODUCT_ID.test(productId)) {
        model.notices.push(msg('error.product'));
        render(model);
        return;
    }
    model.title = msg('nav.product') + ' ' + productId + ' ' + productName(productId);
    var days = [];
    var totals = {};
    var CustomObjectMgr = require('dw/object/CustomObjectMgr');
    var iterator = CustomObjectMgr.queryCustomObjects('AnalyticsProductDaily', 'custom.productId = {0} AND custom.day >= {1} AND custom.day <= {2}', 'custom.day asc', productId, range.from, range.to);
    try {
        while (iterator.hasNext() && days.length < 400) {
            var record = iterator.next().custom;
            days.push(record);
            reportHelpers.PRODUCT_FIELDS.forEach(function (f) { totals[f] = (totals[f] || 0) + (record[f] || 0); }); // eslint-disable-line no-loop-func
        }
    } finally {
        iterator.close();
    }
    var rate = reportHelpers.rate;
    model.sections.push(filter('Product', range, [{ name: 'pid', type: 'hidden', value: productId }]), {
        type: 'kv',
        title: msg('section.summary'),
        rows: [
            [msg('metric.impressions'), num(totals.impressions) + ' (' + num(totals.uniqueImpressions) + ' ' + msg('label.sessions') + ')'],
            [msg('metric.selections'), num(totals.selections) + ' / ' + msg('metric.selectionRate') + ' ' + pct(rate(totals.selections, totals.impressions))],
            [msg('metric.views'), num(totals.views) + ' (' + num(totals.uniqueViews) + ' ' + msg('label.sessions') + ')'],
            [msg('metric.cartAdds'), num(totals.cartAdds) + ' (' + num(totals.uniqueCartAdds) + ' ' + msg('label.sessions') + ', ' + num(totals.unitsAdded) + ' ' + msg('label.units') + ')'],
            [msg('metric.cartRate'), pct(rate(totals.uniqueCartAdds, totals.uniqueViews))],
            [msg('metric.orders'), num(totals.orders)],
            [msg('metric.unitsSold'), num(totals.unitsSold)],
            [msg('metric.grossCents'), usd(totals.grossCents || 0)],
            [msg('metric.discountCents'), usd(totals.discountCents || 0)],
            [msg('metric.refundCents'), usd(totals.refundCents || 0)],
            [msg('metric.netCents'), usd(totals.netCents || 0)],
            [msg('metric.conversion'), pct(rate(totals.orders, totals.uniqueViews))]
        ]
    }, {
        type: 'table',
        title: msg('section.daily'),
        columns: [msg('column.day'), msg('metric.impressions'), msg('metric.selections'), msg('metric.views'), msg('metric.cartAdds'), msg('metric.unitsSold'), msg('metric.netCents')],
        rows: days.map(function (d) { return { cells: [reportHelpers.formatDay(d.day), num(d.impressions), num(d.selections), num(d.views), num(d.cartAdds), num(d.unitsSold), usd(d.netCents || 0)] }; })
    });
    render(model);
};
exports.Product.public = true;

exports.Rankings = function () {
    if (!allowed()) return;
    var range = getRange();
    var model = { title: msg('nav.rankings'), node: 'Rankings', range: range, notices: [], sections: [filter('Rankings', range)] };
    var stored = reportHelpers.getStoredRankings(range);
    var lists;
    if (stored) {
        lists = stored.lists;
        model.notices.push(msg('notice.rankings-stored').replace('{0}', stored.generatedAt ? stored.generatedAt.toISOString().slice(0, 16).replace('T', ' ') : ''));
        if (stored.truncated) model.notices.push(msg('notice.truncated'));
    } else if (range.days > reportHelpers.MAX_PRODUCT_RANGE_DAYS) {
        model.notices.push(msg('error.product-range'));
        render(model);
        return;
    } else {
        var summary = reportHelpers.summarizeProducts(range.from, range.to, MAX_RECORDS);
        lists = reportHelpers.getRankings(summary.items, null);
        model.notices.push(msg('notice.rankings-live'));
        if (summary.truncated) model.notices.push(msg('notice.truncated'));
    }
    var money = { netCents: true };
    var rates = { conversionRate: true, cartToPurchaseRate: true };
    var valueKeys = {
        mostViewed: 'views', mostSelected: 'selections', mostAdded: 'cartAdds', bestSelling: 'unitsSold', highestRevenue: 'netCents', highestConverting: 'conversionRate',
        bestCartToPurchase: 'cartToPurchaseRate', lowestSelling: 'unitsSold', lowestRevenue: 'netCents', leastViewed: 'views', viewedNoSales: 'views',
        addedPoorConversion: 'cartToPurchaseRate', impressionsNoSelections: 'impressions'
    };
    Object.keys(valueKeys).forEach(function (list) {
        var field = valueKeys[list];
        model.sections.push({
            type: 'table',
            title: msg('ranking.' + list),
            columns: ['#', msg('column.product'), msg('column.name'), msg('sort.' + field)],
            rows: (lists[list] || []).map(function (item, index) {
                var value = item.value;
                var text = money[field] ? usd(value) : num(value);
                if (rates[field]) text = pct(value);
                return { link: url('Product', range, ['pid', item.productId]), cells: [String(index + 1), item.productId, productName(item.productId), text] };
            })
        });
    });
    render(model);
};
exports.Rankings.public = true;

exports.Categories = function () {
    if (!allowed()) return;
    var range = getRange();
    var model = { title: msg('nav.categories'), node: 'Categories', range: range, notices: [msg('notice.categories')], sections: [filter('Categories', range)] };
    if (range.days > reportHelpers.MAX_PRODUCT_RANGE_DAYS) {
        model.notices.push(msg('error.product-range'));
        render(model);
        return;
    }
    var summary = reportHelpers.summarizeCategories(range.from, range.to, MAX_RECORDS);
    if (summary.truncated) model.notices.push(msg('notice.truncated'));
    var CatalogMgr = require('dw/catalog/CatalogMgr');
    model.sections.push({
        type: 'table',
        columns: [msg('column.category'), msg('column.name'), msg('column.parent'), msg('metric.impressions'), msg('metric.selections'), msg('metric.views'), msg('metric.cartAdds'),
            msg('metric.unitsSold'), msg('metric.netCents'), msg('metric.conversion'), msg('column.bestProduct')],
        rows: summary.items.slice(0, 500).map(function (c) {
            var category = CatalogMgr.getCategory(c.categoryId);
            var parent = category && category.parent && !category.parent.root ? category.parent.ID : '';
            return {
                cells: [c.categoryId, category ? String(category.displayName || '') : '', parent, num(c.impressions), num(c.selections), num(c.views), num(c.cartAdds),
                    num(c.unitsSold), usd(c.netCents || 0), pct(c.conversionRate), c.bestProduct ? c.bestProduct.productId : '']
            };
        })
    });
    render(model);
};
exports.Categories.public = true;

exports.Funnel = function () {
    if (!allowed()) return;
    var range = getRange();
    var mode = param('mode') === 'events' ? 'events' : 'sessions';
    var report = reportHelpers.getSiteReport(range);
    var steps = reportHelpers.getFunnel(report.totals, mode);
    var metrics = reportHelpers.getMetrics(report.totals);
    var max = steps.reduce(function (m, s) { return Math.max(m, s.value); }, 0);
    render({
        title: msg('nav.funnel'),
        node: 'Funnel',
        range: range,
        notices: collectionNotices(report).concat([msg(mode === 'events' ? 'notice.funnel-events' : 'notice.funnel-sessions')]),
        sections: [
            filter('Funnel', range, [{ name: 'mode', label: msg('filter.mode'), type: 'select', value: mode, options: [{ value: 'sessions', label: msg('mode.sessions') }, { value: 'events', label: msg('mode.events') }] }]),
            { type: 'bars', rows: steps.map(function (s) { return { label: msg('step.' + s.key), width: String(max > 0 ? Math.round((s.value / max) * 100) : 0), text: num(s.value) }; }) },
            {
                type: 'table',
                columns: [msg('column.step'), msg('column.count'), msg('column.stepConversion'), msg('column.dropOff'), msg('column.overall')],
                rows: steps.map(function (s) { return { cells: [msg('step.' + s.key), num(s.value), pct(s.stepRate), pct(s.dropRate), pct(s.overallRate)] }; })
            },
            {
                type: 'kv',
                title: msg('section.checkout'),
                rows: [
                    [msg('metric.checkoutConversion'), pct(metrics.checkoutConversionRate)],
                    [msg('metric.checkoutAbandonment'), pct(metrics.checkoutAbandonmentRate)],
                    [msg('metric.cartAbandonment'), pct(metrics.cartAbandonmentRate)],
                    [msg('metric.sessionConversion'), pct(metrics.sessionConversionRate)]
                ]
            }
        ]
    });
};
exports.Funnel.public = true;

exports.Orders = function () {
    if (!allowed()) return;
    var range = getRange();
    var report = reportHelpers.getSiteReport(range);
    var t = report.totals;
    render({
        title: msg('nav.orders'),
        node: 'Orders',
        range: range,
        notices: [msg('notice.orders')],
        sections: [
            filter('Orders', range),
            {
                type: 'kv',
                title: msg('section.summary'),
                rows: [
                    [msg('metric.orders'), num(t.orders)],
                    [msg('metric.unitsSold'), num(t.unitsSold)],
                    [msg('metric.grossCents'), usd(t.grossCents)],
                    [msg('metric.discountCents'), usd(t.discountCents)],
                    [msg('metric.refundCents'), usd(t.refundCents)],
                    [msg('metric.netCents'), usd(t.netCents)],
                    [msg('metric.shippingCents'), usd(t.shippingCents)],
                    [msg('metric.taxCents'), usd(t.taxCents)],
                    [msg('metric.totalCents'), usd(t.totalCents)],
                    [msg('metric.averageOrder'), usd(reportHelpers.getMetrics(t).averageOrderCents)],
                    [msg('metric.cancelledOrders'), num(t.cancelledOrders)],
                    [msg('metric.refundedOrders'), num(t.refundedOrders)]
                ]
            },
            { type: 'bars', title: msg('section.trend.net'), rows: bars(report.series, 'netCents', usd) },
            {
                type: 'table',
                title: msg('section.daily'),
                columns: [msg('column.day'), msg('metric.orders'), msg('metric.unitsSold'), msg('metric.grossCents'), msg('metric.discountCents'), msg('metric.refundCents'), msg('metric.netCents'), msg('metric.cancelledOrders')],
                rows: report.series.map(function (d) {
                    return { cells: [reportHelpers.formatDay(d.day), num(d.orders), num(d.unitsSold), usd(d.grossCents), usd(d.discountCents), usd(d.refundCents), usd(d.netCents), num(d.cancelledOrders)] };
                })
            }
        ]
    });
};
exports.Orders.public = true;

exports.Search = function () {
    if (!allowed()) return;
    var range = getRange();
    var model = { title: msg('nav.search'), node: 'Search', range: range, notices: [], sections: [filter('Search', range)] };
    if (!analyticsHelpers.isEnabled('search')) model.notices.push(msg('notice.search-disabled'));
    var summary = reportHelpers.summarizeSearches(range.from, range.to, MAX_RECORDS);
    var totals = reportHelpers.getSiteReport(range).totals;
    if (summary.truncated) model.notices.push(msg('notice.truncated'));
    model.sections.push({
        type: 'kv',
        title: msg('section.summary'),
        rows: [
            [msg('metric.searches'), num(totals.searches)],
            [msg('metric.noResultSearches'), num(totals.noResultSearches)],
            [msg('metric.searchSelections'), num(totals.searchSelections)],
            [msg('metric.searchConversion'), pct(reportHelpers.rate(totals.searchSelections, totals.searches))]
        ]
    }, {
        type: 'table',
        title: msg('section.top-terms'),
        columns: [msg('column.term'), msg('metric.searches'), msg('metric.noResultSearches'), msg('metric.searchSelections'), msg('metric.searchConversion')],
        rows: summary.items.slice(0, 50).map(function (s) { return { cells: [s.term, num(s.searches), num(s.noResults), num(s.selections), pct(s.selectionRate)] }; })
    }, {
        type: 'table',
        title: msg('section.no-results'),
        columns: [msg('column.term'), msg('metric.noResultSearches')],
        rows: summary.items.filter(function (s) { return s.noResults > 0; }).sort(function (a, b) { return b.noResults - a.noResults || (a.term < b.term ? -1 : 1); }).slice(0, 50)
            .map(function (s) { return { cells: [s.term, num(s.noResults)] }; })
    });
    render(model);
};
exports.Search.public = true;

exports.Health = function () {
    if (!allowed()) return;
    var range = getRange();
    var aggregation = require('*/cartridge/scripts/helpers/analyticsAggregationHelpers');
    var report = reportHelpers.getSiteReport(range);
    var t = report.totals;
    var when = function (date) { return date ? date.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '-'; };
    var aggregate = aggregation.getCheckpoint('aggregate-events');
    var lock = aggregation.getCheckpoint('writer-lock');
    var integrity = aggregation.getCheckpoint('integrity-check');
    var problems = integrity ? (analyticsHelpers.parseJson(integrity.custom.counts, {}).problems || []) : [];
    var Site = require('dw/system/Site');
    render({
        title: msg('nav.health'),
        node: 'Health',
        range: range,
        notices: collectionNotices(report),
        sections: [
            filter('Health', range),
            {
                type: 'kv',
                title: msg('section.collection'),
                rows: [
                    [msg('health.enabled'), analyticsHelpers.isEnabled(null) ? msg('label.yes') : msg('label.no')],
                    [msg('health.currency'), String(Site.getCurrent().getDefaultCurrency())],
                    [msg('health.timezone'), String(Site.getCurrent().getTimezone())],
                    [msg('health.sampleRate'), String(analyticsHelpers.getIntPreference('analyticsSampleRate', 1, 100, 100)) + '%'],
                    [msg('health.backlog'), num(aggregation.queryCount(aggregation.BATCH, 'custom.receivedAt != NULL', []))],
                    [msg('health.paused'), aggregate && aggregate.custom.collectionPaused ? msg('label.yes') : msg('label.no')],
                    [msg('health.lock'), lock ? lock.custom.status + ' ' + when(lock.custom.lastRunAt) : msg('label.none')],
                    [msg('health.batches'), num(t.batches)],
                    [msg('health.accepted'), num(t.eventsAccepted)],
                    [msg('health.rejected'), num(t.eventsRejected)],
                    [msg('health.dropped'), num(t.eventsDropped)]
                ]
            },
            {
                type: 'table',
                title: msg('section.jobs'),
                columns: [msg('column.job'), msg('column.status'), msg('column.lastRun'), msg('column.lastSuccess'), msg('column.duration'), msg('column.counts')],
                rows: JOBS.map(function (jobId) {
                    var c = aggregation.getCheckpoint(jobId);
                    var x = c ? c.custom : {};
                    return { cells: [jobId, x.status || '-', when(x.lastRunAt), when(x.lastSuccessAt), x.durationMs ? num(x.durationMs) + ' ms' : '-', String(x.counts || '').slice(0, 300)] };
                })
            },
            { type: 'table', title: msg('section.problems'), columns: [msg('column.problem')], rows: problems.slice(0, 50).map(function (p) { return { cells: [String(p)] }; }) }
        ]
    });
};
exports.Health.public = true;

exports.Export = function () {
    if (!allowed()) return;
    var range = getRange();
    var report = param('report');
    if (EXPORTS.indexOf(report) < 0) {
        render({
            title: msg('nav.export'),
            node: 'Export',
            range: range,
            notices: [msg('notice.export')],
            sections: [
                filter('Export', range),
                { type: 'links', links: EXPORTS.map(function (r) { return { label: msg('export.' + r), url: url('Export', range, ['report', r]) }; }) }
            ]
        });
        return;
    }
    if (report !== 'site' && range.days > reportHelpers.MAX_PRODUCT_RANGE_DAYS) {
        render({ title: msg('nav.export'), node: 'Export', range: range, notices: [msg('error.product-range')], sections: [] });
        return;
    }
    var columns;
    var rows;
    if (report === 'site') {
        columns = ['day'].concat(reportHelpers.SITE_FIELDS);
        rows = reportHelpers.getSiteReport(range).series.map(function (d) { return [reportHelpers.formatDay(d.day)].concat(reportHelpers.SITE_FIELDS.map(function (f) { return d[f]; })); });
    } else if (report === 'products') {
        columns = ['productId', 'categoryId'].concat(reportHelpers.PRODUCT_FIELDS, ['selectionRate', 'cartRate', 'conversionRate']);
        rows = reportHelpers.sortProducts(reportHelpers.summarizeProducts(range.from, range.to, MAX_RECORDS).items, 'productId', true).map(function (p) {
            return [p.productId, p.categoryId].concat(reportHelpers.PRODUCT_FIELDS.map(function (f) { return p[f]; }), [p.selectionRate, p.cartRate, p.conversionRate]);
        });
    } else if (report === 'categories') {
        columns = ['categoryId', 'impressions', 'selections', 'views', 'cartAdds', 'unitsAdded', 'orders', 'unitsSold', 'netCents', 'conversionRate'];
        rows = reportHelpers.summarizeCategories(range.from, range.to, MAX_RECORDS).items.map(function (c) { return columns.map(function (f) { return c[f]; }); });
    } else {
        columns = ['term', 'searches', 'noResults', 'selections', 'selectionRate'];
        rows = reportHelpers.summarizeSearches(range.from, range.to, MAX_RECORDS).items.map(function (s) { return columns.map(function (f) { return s[f]; }); });
    }
    log.info('CSV export {0} {1}-{2} by {3}', report, range.from, range.to, session.userName);
    response.setContentType('text/csv; charset=UTF-8');
    response.setHttpHeader('Content-Disposition', 'attachment; filename="analytics-' + report + '-' + range.from + '-' + range.to + '.csv"');
    response.setHttpHeader('X-Content-Type-Options', 'nosniff');
    response.writer.print(reportHelpers.toCsv(columns, rows));
};
exports.Export.public = true;
