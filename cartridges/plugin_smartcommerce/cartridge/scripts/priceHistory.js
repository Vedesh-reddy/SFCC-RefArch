'use strict';

/**
 * Price history per product and currency, recorded by the RecordPriceHistory job.
 * One custom object holds the change points as JSON [[timeMs, price], ...] so a
 * product page needs a single key lookup.
 * @module scripts/priceHistory
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Money = require('dw/value/Money');

var TYPE = 'SmartPriceHistory';
var DAY_MS = 24 * 60 * 60 * 1000;
var KEEP_DAYS = 90;
var LOWEST_DAYS = 30;

/**
 * Price-book price without promotions. Masters and sets have no own price history;
 * their variants and members do.
 * @param {dw.catalog.Product} product - Product
 * @returns {dw.value.Money|null} Current price
 */
function currentPrice(product) {
    if (!product || product.master || product.variationGroup || product.productSet) {
        return null;
    }
    var price = product.priceModel.price;
    return price && price.available ? price : null;
}

/**
 * @param {dw.object.CustomObject|null} stored - History record
 * @returns {Array<Array<number>>} Change points, oldest first
 */
function entries(stored) {
    try {
        return stored ? JSON.parse(stored.custom.priceHistory || '[]') : [];
    } catch (e) {
        return [];
    }
}

/**
 * Drops points older than KEEP_DAYS but keeps the one in force at the cutoff.
 * @param {Array<Array<number>>} points - Change points, oldest first
 * @param {number} now - Current time in ms
 * @returns {Array<Array<number>>} Pruned points
 */
function prune(points, now) {
    var cutoff = now - (KEEP_DAYS * DAY_MS);
    var first = 0;
    while (first + 1 < points.length && points[first + 1][0] <= cutoff) {
        first += 1;
    }
    return points.slice(first);
}

/**
 * Appends a change point when the price differs from the last one recorded.
 * @param {dw.catalog.Product} product - Product
 * @param {number} now - Current time in ms
 * @returns {boolean} Whether a change was recorded
 */
function record(product, now) {
    var price = currentPrice(product);
    if (!price) {
        return false;
    }
    var key = product.ID + '|' + price.currencyCode;
    var existing = CustomObjectMgr.getCustomObject(TYPE, key);
    var points = entries(existing);
    var last = points[points.length - 1];
    if (last && last[1] === price.value) {
        return false;
    }
    points.push([now, price.value]);
    Transaction.wrap(function () {
        var target = existing || CustomObjectMgr.createCustomObject(TYPE, key);
        target.custom.productID = product.ID;
        target.custom.currencyCode = price.currencyCode;
        target.custom.priceHistory = JSON.stringify(prune(points, now));
    });
    return true;
}

/**
 * The lowest price includes the price in force when the window opened and today's price,
 * so a product unchanged for 30 days reports its current price.
 * @param {dw.catalog.Product} product - Product
 * @param {number} now - Current time in ms
 * @returns {Object|null} Current and lowest price plus change points, newest first
 */
function summary(product, now) {
    var price = currentPrice(product);
    if (!price) {
        return null;
    }
    var currency = price.currencyCode;
    var points = entries(CustomObjectMgr.getCustomObject(TYPE, product.ID + '|' + currency));
    var windowStart = now - (LOWEST_DAYS * DAY_MS);
    var lowest = price.value;
    points.forEach(function (point, index) {
        var next = points[index + 1];
        if (point[0] >= windowStart || !next || next[0] > windowStart) {
            lowest = Math.min(lowest, point[1]);
        }
    });
    return {
        productID: product.ID,
        currencyCode: currency,
        current: price.value,
        currentFormatted: price.toFormattedString(),
        lowest30: lowest,
        lowest30Formatted: new Money(lowest, currency).toFormattedString(),
        history: points.slice().reverse().map(function (point) {
            return {
                date: new Date(point[0]),
                price: point[1],
                priceFormatted: new Money(point[1], currency).toFormattedString()
            };
        })
    };
}

module.exports = {
    currentPrice: currentPrice,
    record: record,
    summary: summary
};
