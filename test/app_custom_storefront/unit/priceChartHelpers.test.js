'use strict';

const assert = require('chai').assert;
const path = require('path');

const { buildChart, renderSvg } = require(path.resolve('cartridges/app_custom_storefront/cartridge/scripts/helpers/priceChartHelpers'));

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 2);

function summary(current, history) {
    return {
        current: current,
        currentFormatted: '$' + current,
        history: history.map(function (entry) {
            return { date: new Date(NOW - (entry[0] * DAY)), price: entry[1], priceFormatted: '$' + entry[1] };
        })
    };
}

describe('priceChartHelpers.buildChart', function () {
    it('reads history newest first and reports a price drop', function () {
        const chart = buildChart(summary(80, [[1, 80], [10, 100]]), NOW);
        assert.equal(chart.direction, 'down');
        assert.equal(chart.changePercent, '20');
        assert.equal(chart.highestFormatted, '$100');
        assert.equal(chart.marks.length, 3);
        assert.equal(chart.startDate.getTime(), NOW - (10 * DAY));
    });

    it('reports a price rise', function () {
        const chart = buildChart(summary(150, [[5, 100]]), NOW);
        assert.equal(chart.direction, 'up');
        assert.equal(chart.changePercent, '50');
    });

    it('draws a flat line when the price never changed', function () {
        const chart = buildChart(summary(100, [[20, 100]]), NOW);
        assert.equal(chart.direction, 'flat');
        assert.equal(chart.marks[0].y, chart.marks[1].y);
    });

    it('copes with a product that has no recorded history', function () {
        const chart = buildChart(summary(100, []), NOW);
        assert.equal(chart.marks.length, 1);
        assert.equal(chart.direction, 'flat');
        assert.notInclude(chart.line, 'NaN');
    });

    it('escapes labels and prices in the rendered SVG', function () {
        const chart = buildChart(summary(100, [[2, 100]]), NOW);
        chart.marks[0].formatted = '<b>$1</b>';
        const svg = renderSvg(chart, 'a "quoted" <label>');
        assert.notInclude(svg, '<b>');
        assert.include(svg, '&lt;b&gt;$1&lt;/b&gt;');
        assert.include(svg, 'a &quot;quoted&quot; &lt;label&gt;');
    });

    it('puts the highest price at the top of the chart and keeps it in bounds', function () {
        const chart = buildChart(summary(50, [[3, 100], [9, 75]]), NOW);
        const ys = chart.marks.map(function (mark) { return Number(mark.y); });
        assert.equal(Math.min.apply(null, ys), ys[1]);
        ys.forEach(function (y) {
            assert.isAtLeast(y, 0);
            assert.isAtMost(y, chart.height);
        });
    });
});
