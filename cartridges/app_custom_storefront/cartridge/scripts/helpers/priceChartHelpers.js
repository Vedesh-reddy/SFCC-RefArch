'use strict';

var WIDTH = 640;
var HEIGHT = 180;
var TOP = 16;
var BOTTOM = 148;
var DAY_MS = 86400000;

/**
 * Turns a price history summary into SVG geometry for a step chart. Prices hold until
 * they change, so a step line shows what shoppers actually paid between changes.
 * @param {Object} summary - Result of the plugin_smartcommerce priceHistory.summary()
 * @param {number} now - Current time in milliseconds
 * @returns {Object} Paths, change markers, stats and trend for the template
 */
function buildChart(summary, now) {
    var points = summary.history.slice().reverse().map(function (point) {
        return { time: point.date.getTime(), price: point.price, formatted: point.priceFormatted };
    });
    points.push({ time: now, price: summary.current, formatted: summary.currentFormatted });

    var startTime = Math.min(points[0].time, now - DAY_MS);
    var prices = points.map(function (point) { return point.price; });
    var low = Math.min.apply(null, prices);
    var high = Math.max.apply(null, prices);
    var highest = points.filter(function (point) { return point.price === high; })[0];

    var xFor = function (time) {
        return ((time - startTime) / (now - startTime)) * WIDTH;
    };
    var yFor = function (price) {
        return high === low ? (TOP + BOTTOM) / 2 : BOTTOM - (((price - low) / (high - low)) * (BOTTOM - TOP));
    };

    var line = 'M' + xFor(points[0].time).toFixed(1) + ' ' + yFor(points[0].price).toFixed(1);
    var marks = [];
    points.forEach(function (point, index) {
        if (index > 0) {
            line += ' H' + xFor(point.time).toFixed(1) + ' V' + yFor(point.price).toFixed(1);
        }
        marks.push({
            x: xFor(point.time).toFixed(1),
            y: yFor(point.price).toFixed(1),
            formatted: point.formatted
        });
    });

    var first = points[0].price;
    var change = first > 0 ? ((summary.current - first) / first) * 100 : 0;
    var direction = 'flat';
    if (Math.abs(change) >= 0.5) {
        direction = change < 0 ? 'down' : 'up';
    }

    return {
        width: WIDTH,
        height: HEIGHT,
        baseline: BOTTOM + 8,
        line: line,
        area: line + ' V' + (BOTTOM + 8) + ' H' + xFor(points[0].time).toFixed(1) + ' Z',
        marks: marks,
        startDate: new Date(points[0].time),
        endDate: new Date(now),
        highestFormatted: highest.formatted,
        direction: direction,
        changePercent: Math.abs(change).toFixed(0)
    };
}

/**
 * Escapes text for use in SVG markup
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeXml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Renders a chart as inline SVG
 * @param {Object} chart - Result of buildChart
 * @param {string} label - Spoken description of the chart
 * @returns {string} SVG markup, safe to print unencoded because every value is numeric or escaped
 */
function renderSvg(chart, label) {
    var marks = chart.marks.map(function (mark) {
        return '<circle class="price-chart-mark" cx="' + mark.x + '" cy="' + mark.y + '" r="4" vector-effect="non-scaling-stroke"><title>' + escapeXml(mark.formatted) + '</title></circle>';
    }).join('');
    return '<svg class="price-chart w-100" viewBox="0 0 ' + chart.width + ' ' + chart.height + '" preserveAspectRatio="none" role="img" aria-label="' + escapeXml(label) + '">'
        + '<defs><linearGradient id="price-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0071e3" stop-opacity="0.28"/><stop offset="1" stop-color="#0071e3" stop-opacity="0"/></linearGradient></defs>'
        + '<line class="price-chart-axis" x1="0" x2="' + chart.width + '" y1="' + chart.baseline + '" y2="' + chart.baseline + '"/>'
        + '<path class="price-chart-area" d="' + chart.area + '" fill="url(#price-chart-fill)"/>'
        + '<path class="price-chart-line" d="' + chart.line + '" pathLength="1" vector-effect="non-scaling-stroke"/>'
        + marks
        + '</svg>';
}

module.exports = {
    buildChart: buildChart,
    renderSvg: renderSvg
};
