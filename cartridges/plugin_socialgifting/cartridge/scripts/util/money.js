'use strict';

var Decimal = require('dw/util/Decimal');
var Currency = require('dw/util/Currency');
var fail = require('./validation').fail;
/**
 * Decimal the money domain operation.
 * @param {*} value - value input
 * @returns {*} Domain result
 */
function decimal(value) { return new Decimal(String(value)); }
/**
 * Cmp the money domain operation.
 * @param {*} a - a input
 * @param {*} b - b input
 * @returns {*} Domain result
 */
function cmp(a, b) {
    var result = decimal(a).subtract(decimal(b));
    if (result.equals(decimal('0'))) return 0;
    return result.toString().charAt(0) === '-' ? -1 : 1;
}
/**
 * Amount the money domain operation.
 * @param {*} value - value input
 * @param {*} currency - currency input
 * @returns {*} Domain result
 */
function amount(value, currency) {
    var raw = String(value);
    var unit = Currency.getCurrency(currency);
    if (!unit || !/^(0|[1-9]\d{0,8})(\.\d{1,3})?$/.test(raw)) fail('INVALID_AMOUNT');
    var fraction = raw.split('.')[1] || '';
    if (fraction.length > unit.defaultFractionDigits || cmp(raw, '0') <= 0) fail('INVALID_AMOUNT');
    return decimal(raw).toString();
}
/**
 * Add the money domain operation.
 * @param {*} a - a input
 * @param {*} b - b input
 * @returns {*} Domain result
 */
function add(a, b) { return decimal(a).add(decimal(b)).toString(); }
/**
 * Sub the money domain operation.
 * @param {*} a - a input
 * @param {*} b - b input
 * @returns {*} Domain result
 */
function sub(a, b) { return decimal(a).subtract(decimal(b)).toString(); }
module.exports = { amount: amount, add: add, sub: sub, cmp: cmp, decimal: decimal };
