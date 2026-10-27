'use strict';

/**
 * Reading side of the analytics for Business Manager: reporting ranges, the metric
 * definitions, funnel, product summaries and rankings, and CSV export. Reports read only the
 * precomputed daily aggregates (and the rankings the job stores), never raw events.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var analyticsHelpers = require('*/cartridge/scripts/helpers/analyticsHelpers');

var DAY = 86400000;
var MAX_RANGE_DAYS = 366;
var MAX_PRODUCT_RANGE_DAYS = 93;
var RANGES = ['today', 'yesterday', 'last-7', 'last-30', 'month', 'previous-month', 'custom'];
var RANKING_PERIODS = ['last-7', 'last-30', 'month', 'previous-month'];
var SITE_FIELDS = ['sessions', 'impressions', 'impressionSessions', 'selections', 'selectionSessions', 'views', 'viewSessions', 'cartAdds', 'unitsAdded', 'cartSessions',
    'checkoutStarts', 'checkoutFlows', 'shippingSubmits', 'shippingFlows', 'paymentSubmits', 'paymentFlows', 'completedFlows',
    'orders', 'unitsSold', 'grossCents', 'discountCents', 'shippingCents', 'taxCents', 'totalCents', 'refundCents', 'netCents', 'cancelledOrders', 'refundedOrders',
    'searches', 'noResultSearches', 'searchSelections', 'batches', 'eventsAccepted', 'eventsRejected', 'eventsDropped'];
var PRODUCT_FIELDS = ['impressions', 'uniqueImpressions', 'selections', 'uniqueSelections', 'views', 'uniqueViews', 'cartAdds', 'uniqueCartAdds', 'unitsAdded',
    'orders', 'unitsSold', 'grossCents', 'discountCents', 'refundCents', 'netCents'];
var CATEGORY_FIELDS = ['impressions', 'selections', 'views', 'cartAdds', 'unitsAdded', 'orders', 'unitsSold', 'netCents'];
var PRODUCT_SORTS = PRODUCT_FIELDS.concat(['selectionRate', 'cartRate', 'conversionRate', 'productId']);

/**
 * @param {number} numerator - part
 * @param {number} denominator - whole
 * @returns {?number} percentage with one decimal, null when the denominator is 0
 */
function rate(numerator, denominator) {
    return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;
}

/**
 * @param {string} day - yyyyMMdd
 * @param {number} offset - days to add
 * @returns {string} yyyyMMdd
 */
function addDays(day, offset) {
    var date = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8))) + offset * DAY);
    return date.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * @param {string} from - first day
 * @param {string} to - last day
 * @returns {number} days in the range
 */
function countDays(from, to) {
    return Math.round((Date.UTC(Number(to.slice(0, 4)), Number(to.slice(4, 6)) - 1, Number(to.slice(6, 8))) - Date.UTC(Number(from.slice(0, 4)), Number(from.slice(4, 6)) - 1, Number(from.slice(6, 8)))) / DAY) + 1;
}

/**
 * @param {string} day - yyyyMMdd
 * @returns {string} yyyy-MM-dd
 */
function formatDay(day) {
    return day.slice(0, 4) + '-' + day.slice(4, 6) + '-' + day.slice(6, 8);
}

/**
 * Resolves a reporting range. Days are calendar days in the site time zone.
 * @param {string} name - one of RANGES
 * @param {string} fromText - custom start, yyyy-MM-dd
 * @param {string} toText - custom end, yyyy-MM-dd
 * @param {string} [today] - yyyyMMdd, the current site day when omitted
 * @returns {Object} {name, from, to, days, error}
 */
function resolveRange(name, fromText, toText, today) {
    var now = today || analyticsHelpers.getDay();
    var range = { name: RANGES.indexOf(name) >= 0 ? name : 'last-7', error: null };
    var monthStart = now.slice(0, 6) + '01';
    if (range.name === 'today') {
        range.from = now;
        range.to = now;
    } else if (range.name === 'yesterday') {
        range.from = addDays(now, -1);
        range.to = range.from;
    } else if (range.name === 'last-30') {
        range.from = addDays(now, -29);
        range.to = now;
    } else if (range.name === 'month') {
        range.from = monthStart;
        range.to = now;
    } else if (range.name === 'previous-month') {
        range.to = addDays(monthStart, -1);
        range.from = range.to.slice(0, 6) + '01';
    } else if (range.name === 'custom') {
        var pattern = /^\d{4}-\d{2}-\d{2}$/;
        var from = pattern.test(fromText) ? fromText.replace(/-/g, '') : null;
        var to = pattern.test(toText) ? toText.replace(/-/g, '') : null;
        if (!from || !to || formatDay(addDays(from, 0)) !== fromText || formatDay(addDays(to, 0)) !== toText) {
            range.error = 'invalid-date';
        } else if (from > to) {
            range.error = 'invalid-order';
        } else if (countDays(from, to) > MAX_RANGE_DAYS) {
            range.error = 'range-too-long';
        }
        if (range.error) {
            range.name = 'last-7';
        } else {
            range.from = from;
            range.to = to;
        }
    }
    if (range.name === 'last-7') {
        range.from = addDays(now, -6);
        range.to = now;
    }
    range.days = countDays(range.from, range.to);
    range.label = formatDay(range.from) + (range.days > 1 ? ' - ' + formatDay(range.to) : '');
    return range;
}

/**
 * @param {Object} range - resolved range
 * @returns {Object} the range of the same length right before it
 */
function previousRange(range) {
    var to = addDays(range.from, -1);
    return { from: addDays(to, 1 - range.days), to: to, days: range.days };
}

/**
 * @param {string} type - aggregate type
 * @param {string} from - first day
 * @param {string} to - last day
 * @param {number} limit - most records read
 * @returns {Object} {records, truncated}
 */
function queryDays(type, from, to, limit) {
    var records = [];
    var iterator = CustomObjectMgr.queryCustomObjects(type, 'custom.day >= {0} AND custom.day <= {1}', 'custom.day asc', from, to);
    try {
        while (iterator.hasNext() && records.length < limit) records.push(iterator.next().custom);
        return { records: records, truncated: iterator.hasNext() };
    } finally {
        iterator.close();
    }
}

/**
 * @param {Object} target - totals
 * @param {Object} source - record attributes
 * @param {string[]} fields - counters
 * @returns {Object} target
 */
function addFields(target, source, fields) {
    fields.forEach(function (field) { target[field] = (target[field] || 0) + (source[field] || 0); });
    return target;
}

/**
 * Site totals and the daily series of a range (days without data are zero).
 * @param {Object} range - resolved range
 * @returns {Object} {totals, series, sampleRate}
 */
function getSiteReport(range) {
    var byDay = {};
    var sampleRate = 100;
    queryDays('AnalyticsSiteDaily', range.from, range.to, MAX_RANGE_DAYS).records.forEach(function (record) {
        byDay[record.day] = record;
        if (record.sampleRate) sampleRate = Math.min(sampleRate, record.sampleRate);
    });
    var totals = addFields({}, {}, SITE_FIELDS);
    var series = [];
    for (var i = 0; i < range.days; i++) {
        var day = addDays(range.from, i);
        var values = addFields({ day: day }, byDay[day] || {}, SITE_FIELDS);
        series.push(values);
        addFields(totals, values, SITE_FIELDS);
    }
    var hours = analyticsHelpers.getIntPreference('analyticsAbandonmentHours', 1, 720, 24);
    // A checkout attempt counts as abandoned only once its day ended analyticsAbandonmentHours ago.
    var settledBefore = analyticsHelpers.getDay(new Date(Date.now() - hours * 3600000));
    totals.settledFlows = 0;
    totals.settledCompleted = 0;
    series.forEach(function (entry) {
        if (entry.day < settledBefore) {
            totals.settledFlows += entry.checkoutFlows;
            totals.settledCompleted += entry.completedFlows;
        }
    });
    return { totals: totals, series: series, sampleRate: sampleRate };
}

/**
 * The metric definitions shown on the overview.
 * @param {Object} t - site totals
 * @returns {Object} metrics; rates are percentages or null
 */
function getMetrics(t) {
    return {
        averageOrderCents: t.orders > 0 ? Math.round(t.totalCents / t.orders) : null,
        selectionRate: rate(t.selections, t.impressions),
        checkoutConversionRate: rate(t.completedFlows, t.checkoutFlows),
        checkoutAbandonmentRate: t.settledFlows > 0 ? rate(Math.max(0, t.settledFlows - t.settledCompleted), t.settledFlows) : null,
        cartAbandonmentRate: t.cartSessions > 0 ? rate(Math.max(0, t.cartSessions - t.completedFlows), t.cartSessions) : null,
        sessionConversionRate: rate(t.orders, t.sessions)
    };
}

/**
 * @param {number} current - this period
 * @param {number} previous - previous period
 * @returns {?number} change in percent, null without a previous value
 */
function change(current, previous) {
    return previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null;
}

/**
 * Funnel steps. "sessions" mode counts shopping sessions (and checkout attempts for the
 * checkout steps); "events" mode counts events. Discovery steps are not strictly nested (a
 * session can open a product page from an outside link), so their ratios are step ratios,
 * not cohort conversion. Checkout steps are nested by checkout attempt.
 * @param {Object} t - site totals
 * @param {string} mode - sessions or events
 * @returns {Object[]} {key, value, stepRate, dropRate, overallRate}
 */
function getFunnel(t, mode) {
    var keys = mode === 'events'
        ? [['impressions', 'impressions'], ['selections', 'selections'], ['views', 'views'], ['cart', 'cartAdds'], ['checkout', 'checkoutStarts'], ['shipping', 'shippingSubmits'], ['payment', 'paymentSubmits'], ['purchase', 'orders']]
        : [['impressions', 'impressionSessions'], ['selections', 'selectionSessions'], ['views', 'viewSessions'], ['cart', 'cartSessions'], ['checkout', 'checkoutFlows'], ['shipping', 'shippingFlows'], ['payment', 'paymentFlows'], ['purchase', 'completedFlows']];
    var first = t[keys[0][1]];
    return keys.map(function (pair, index) {
        var value = t[pair[1]];
        var previous = index ? t[keys[index - 1][1]] : null;
        var stepRate = index ? rate(value, previous) : null;
        return {
            key: pair[0],
            value: value,
            stepRate: stepRate,
            dropRate: stepRate === null ? null : Math.max(0, Math.round((100 - stepRate) * 10) / 10),
            overallRate: rate(value, first)
        };
    });
}

/**
 * @param {Object} p - product totals
 * @returns {Object} p with selectionRate, cartRate (sessions adding / sessions viewing),
 *  conversionRate (orders / sessions viewing) and cartToPurchaseRate
 */
function withProductRates(p) {
    p.selectionRate = rate(p.selections, p.impressions);
    p.cartRate = rate(p.uniqueCartAdds, p.uniqueViews);
    p.conversionRate = rate(p.orders, p.uniqueViews);
    p.cartToPurchaseRate = rate(p.orders, p.uniqueCartAdds);
    return p;
}

/**
 * Product totals of a range, rolled up to master products.
 * @param {string} from - first day
 * @param {string} to - last day
 * @param {number} limit - most daily records read
 * @returns {Object} {items, truncated}
 */
function summarizeProducts(from, to, limit) {
    var byId = {};
    var result = queryDays('AnalyticsProductDaily', from, to, limit);
    result.records.forEach(function (record) {
        var item = byId[record.productId];
        if (!item) {
            item = { productId: record.productId, categoryId: record.categoryId || '' };
            byId[record.productId] = item;
        }
        if (record.categoryId) item.categoryId = record.categoryId;
        addFields(item, record, PRODUCT_FIELDS);
    });
    return {
        items: Object.keys(byId).map(function (id) { return withProductRates(byId[id]); }),
        truncated: result.truncated
    };
}

/**
 * @param {Object[]} items - product totals
 * @param {string} field - sort field (one of PRODUCT_SORTS)
 * @param {boolean} ascending - direction
 * @returns {Object[]} sorted copy; ties are broken by product ID, missing rates sort last
 */
function sortProducts(items, field, ascending) {
    var sortField = PRODUCT_SORTS.indexOf(field) >= 0 ? field : 'views';
    return items.slice().sort(function (a, b) {
        if (sortField === 'productId') return (a.productId < b.productId ? -1 : 1) * (ascending ? 1 : -1);
        var x = a[sortField];
        var y = b[sortField];
        if (x === null && y !== null) return 1;
        if (y === null && x !== null) return -1;
        if (x !== y) return (x < y ? -1 : 1) * (ascending ? 1 : -1);
        return a.productId < b.productId ? -1 : 1;
    });
}

/**
 * @param {Object[]} items - candidates
 * @param {Function} filter - eligibility
 * @param {string[]} order - [field, 'asc'|'desc'] pairs; product ID breaks remaining ties
 * @returns {Object[]} first 10
 */
function topTen(items, filter, order) {
    return items.filter(filter).sort(function (a, b) {
        for (var i = 0; i < order.length; i += 2) {
            var x = a[order[i]] === null ? -1 : a[order[i]];
            var y = b[order[i]] === null ? -1 : b[order[i]];
            if (x !== y) return (x < y ? -1 : 1) * (order[i + 1] === 'asc' ? 1 : -1);
        }
        return a.productId < b.productId ? -1 : 1;
    }).slice(0, 10);
}

/**
 * Top and bottom 10 lists. Conversion rankings only consider products that reached
 * analyticsMinRankingViews (unique viewing or adding sessions) and the "no selections" list
 * products with analyticsMinRankingImpressions. Catalog products without any activity (from
 * the rankings job) take part in the lowest-selling and least-viewed lists.
 * @param {Object[]} items - product totals
 * @param {string[]} [catalogIds] - eligible catalog products
 * @returns {Object} lists of {productId, value}
 */
function getRankings(items, catalogIds) {
    var minViews = analyticsHelpers.getIntPreference('analyticsMinRankingViews', 1, 1000000, 20);
    var minImpressions = analyticsHelpers.getIntPreference('analyticsMinRankingImpressions', 1, 10000000, 100);
    var all = items.slice();
    var known = {};
    items.forEach(function (item) { known[item.productId] = true; });
    (catalogIds || []).forEach(function (id) {
        if (!known[id]) all.push(withProductRates(addFields({ productId: id, categoryId: '' }, {}, PRODUCT_FIELDS)));
    });
    var any = function () { return true; };
    var pick = function (list, field) { return list.map(function (p) { return { productId: p.productId, value: p[field] }; }); };
    return {
        mostViewed: pick(topTen(items, function (p) { return p.views > 0; }, ['views', 'desc']), 'views'),
        mostSelected: pick(topTen(items, function (p) { return p.selections > 0; }, ['selections', 'desc']), 'selections'),
        mostAdded: pick(topTen(items, function (p) { return p.cartAdds > 0; }, ['cartAdds', 'desc', 'unitsAdded', 'desc']), 'cartAdds'),
        bestSelling: pick(topTen(items, function (p) { return p.unitsSold > 0; }, ['unitsSold', 'desc', 'netCents', 'desc']), 'unitsSold'),
        highestRevenue: pick(topTen(items, function (p) { return p.netCents > 0; }, ['netCents', 'desc', 'unitsSold', 'desc']), 'netCents'),
        highestConverting: pick(topTen(items, function (p) { return p.uniqueViews >= minViews && p.orders > 0; }, ['conversionRate', 'desc', 'orders', 'desc']), 'conversionRate'),
        bestCartToPurchase: pick(topTen(items, function (p) { return p.uniqueCartAdds >= minViews && p.orders > 0; }, ['cartToPurchaseRate', 'desc', 'orders', 'desc']), 'cartToPurchaseRate'),
        lowestSelling: pick(topTen(all, any, ['unitsSold', 'asc', 'views', 'desc']), 'unitsSold'),
        lowestRevenue: pick(topTen(all, any, ['netCents', 'asc', 'views', 'desc']), 'netCents'),
        leastViewed: pick(topTen(all, any, ['views', 'asc', 'impressions', 'desc']), 'views'),
        viewedNoSales: pick(topTen(items, function (p) { return p.unitsSold === 0 && p.uniqueViews >= minViews; }, ['views', 'desc']), 'views'),
        addedPoorConversion: pick(topTen(items, function (p) { return p.uniqueCartAdds >= minViews; }, ['cartToPurchaseRate', 'asc', 'cartAdds', 'desc']), 'cartToPurchaseRate'),
        impressionsNoSelections: pick(topTen(items, function (p) { return p.selections === 0 && p.impressions >= minImpressions; }, ['impressions', 'desc']), 'impressions')
    };
}

/**
 * Category totals of a range with each category's best product by net revenue. Every product
 * counts in one category only, so the category rows never add up to more than the site.
 * @param {string} from - first day
 * @param {string} to - last day
 * @param {number} limit - most daily records read
 * @returns {Object} {items, truncated}
 */
function summarizeCategories(from, to, limit) {
    var byId = {};
    var result = queryDays('AnalyticsCategoryDaily', from, to, limit);
    result.records.forEach(function (record) {
        if (!byId[record.categoryId]) byId[record.categoryId] = { categoryId: record.categoryId };
        addFields(byId[record.categoryId], record, CATEGORY_FIELDS);
    });
    var products = summarizeProducts(from, to, limit);
    products.items.forEach(function (p) {
        var category = byId[p.categoryId];
        if (category && p.netCents > 0 && (!category.bestProduct || p.netCents > category.bestProduct.netCents)) category.bestProduct = { productId: p.productId, netCents: p.netCents };
    });
    return {
        items: Object.keys(byId).map(function (id) {
            var c = byId[id];
            c.conversionRate = rate(c.orders, c.views);
            return c;
        }).sort(function (a, b) { return b.netCents - a.netCents || (a.categoryId < b.categoryId ? -1 : 1); }),
        truncated: result.truncated || products.truncated
    };
}

/**
 * @param {string} from - first day
 * @param {string} to - last day
 * @param {number} limit - most daily records read
 * @returns {Object} {items, truncated}, most searched first
 */
function summarizeSearches(from, to, limit) {
    var byTerm = {};
    var result = queryDays('AnalyticsSearchDaily', from, to, limit);
    result.records.forEach(function (record) {
        if (!byTerm[record.term]) byTerm[record.term] = { term: record.term };
        addFields(byTerm[record.term], record, ['searches', 'noResults', 'selections']);
    });
    return {
        items: Object.keys(byTerm).map(function (term) {
            var s = byTerm[term];
            s.selectionRate = rate(s.selections, s.searches);
            return s;
        }).sort(function (a, b) { return b.searches - a.searches || (a.term < b.term ? -1 : 1); }),
        truncated: result.truncated
    };
}

/**
 * @param {*} value - cell
 * @returns {string} CSV field; text starting like a formula is prefixed with a quote
 */
function csvCell(value) {
    var text = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = "'" + text;
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

/**
 * @param {string[]} columns - header
 * @param {Array[]} rows - cells
 * @returns {string} CSV document
 */
function toCsv(columns, rows) {
    return [columns].concat(rows).map(function (row) { return row.map(csvCell).join(','); }).join('\r\n') + '\r\n';
}

/**
 * Lists the products that can be ranked even without activity: online master and standalone
 * products of the site catalog, bounded by limit.
 * @param {number} limit - most products read
 * @returns {Object} {ids, truncated}
 */
function getCatalogProductIds(limit) {
    var ids = [];
    var iterator = require('dw/catalog/ProductMgr').queryAllSiteProducts();
    try {
        while (iterator.hasNext() && ids.length < limit) {
            var product = iterator.next();
            if (product.online && !product.variant && !product.variationGroup && !product.optionProduct && analyticsHelpers.PRODUCT_ID.test(product.ID)) ids.push(product.ID);
        }
        return { ids: ids, truncated: iterator.hasNext() };
    } finally {
        iterator.close();
    }
}

/**
 * Precomputes the rankings of the standard periods (job step).
 * @param {number} maxRecords - most daily records read per period
 * @param {number} maxProducts - most catalog products read
 * @returns {Object} counts
 */
function generateRankings(maxRecords, maxProducts) {
    var Transaction = require('dw/system/Transaction');
    var catalog = getCatalogProductIds(maxProducts);
    var counts = { periods: 0, catalogProducts: catalog.ids.length, truncated: catalog.truncated ? 1 : 0 };
    RANKING_PERIODS.forEach(function (period) {
        var range = resolveRange(period);
        var summary = summarizeProducts(range.from, range.to, maxRecords);
        var data = {
            from: range.from,
            to: range.to,
            products: summary.items.length,
            truncated: summary.truncated || catalog.truncated,
            lists: getRankings(summary.items, catalog.ids)
        };
        Transaction.wrap(function () {
            var record = CustomObjectMgr.getCustomObject('AnalyticsRanking', period) || CustomObjectMgr.createCustomObject('AnalyticsRanking', period);
            record.custom.fromDay = range.from;
            record.custom.toDay = range.to;
            record.custom.generatedAt = new Date();
            record.custom.data = JSON.stringify(data);
        });
        counts.periods += 1;
        if (summary.truncated) counts.truncated += 1;
    });
    return counts;
}

/**
 * @param {Object} range - resolved range
 * @returns {?Object} stored rankings when they were computed for exactly this range
 */
function getStoredRankings(range) {
    if (RANKING_PERIODS.indexOf(range.name) < 0) return null;
    var record = CustomObjectMgr.getCustomObject('AnalyticsRanking', range.name);
    if (!record || record.custom.fromDay !== range.from || record.custom.toDay !== range.to) return null;
    var data = analyticsHelpers.parseJson(record.custom.data, null);
    if (data) data.generatedAt = record.custom.generatedAt;
    return data;
}

module.exports = {
    RANGES: RANGES,
    SITE_FIELDS: SITE_FIELDS,
    PRODUCT_FIELDS: PRODUCT_FIELDS,
    PRODUCT_SORTS: PRODUCT_SORTS,
    MAX_PRODUCT_RANGE_DAYS: MAX_PRODUCT_RANGE_DAYS,
    rate: rate,
    addDays: addDays,
    formatDay: formatDay,
    resolveRange: resolveRange,
    previousRange: previousRange,
    queryDays: queryDays,
    getSiteReport: getSiteReport,
    getMetrics: getMetrics,
    change: change,
    getFunnel: getFunnel,
    summarizeProducts: summarizeProducts,
    sortProducts: sortProducts,
    getRankings: getRankings,
    summarizeCategories: summarizeCategories,
    summarizeSearches: summarizeSearches,
    csvCell: csvCell,
    toCsv: toCsv,
    generateRankings: generateRankings,
    getStoredRankings: getStoredRankings
};
