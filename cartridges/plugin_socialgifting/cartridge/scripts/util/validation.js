'use strict';

/**
 * Raise a public error code without embedding private input.
 * @param {*} code - code input
 * @param {*} status - status input
 */
function fail(code, status) {
    var error = new Error(code);
    error.code = code;
    error.status = status || 400;
    throw error;
}
/**
 * Validate bounded plain text; HTML encoding belongs to the output context.
 * @param {*} value - value input
 * @param {*} max - max input
 * @param {*} required - required input
 * @returns {*} Domain result
 */
function text(value, max, required) {
    var result = String(value == null ? '' : value).trim();
    // Reject ASCII controls while retaining newlines/tabs for plain-text comments.
    // eslint-disable-next-line no-control-regex
    if ((required && !result) || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)) fail('INVALID_INPUT');
    return result;
}
/**
 * Parse a bounded whole-unit quantity.
 * @param {*} value - value input
 * @param {*} min - min input
 * @param {*} max - max input
 * @returns {*} Domain result
 */
function integer(value, min, max) {
    if (!/^\d+$/.test(String(value))) fail('INVALID_QUANTITY');
    var number = Number(value);
    if (number < min || number > max) fail('INVALID_QUANTITY');
    return number;
}
/**
 * Choice the validation domain operation.
 * @param {*} value - value input
 * @param {*} allowed - allowed input
 * @returns {*} Domain result
 */
function choice(value, allowed) {
    if (allowed.indexOf(value) === -1) fail('INVALID_INPUT');
    return value;
}
/**
 * Parse an explicitly offset event instant.
 * @param {*} value - value input
 * @returns {*} Domain result
 */
function date(value) {
    // Explicit offset is required; never interpret browser-local wall time on the server.
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(Z|[+-]\d\d:\d\d)$/.test(String(value))) fail('INVALID_DATE');
    var components = String(value).match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/);
    var year = Number(components[1]);
    var month = Number(components[2]);
    var day = Number(components[3]);
    if (year < 2000 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()
        || Number(components[4]) > 23 || Number(components[5]) > 59) fail('INVALID_DATE');
    var result = new Date(value);
    if (Number.isNaN(result.getTime())) fail('INVALID_DATE');
    return result;
}
/**
 * Interpret an HTML checkbox value.
 * @param {*} value - value input
 * @returns {*} Domain result
 */
function bool(value) { return value === true || value === 'true' || value === 'on'; }
/**
 * Calculate nonnegative remaining desired quantity.
 * @param {*} desired - desired input
 * @param {*} purchased - purchased input
 * @param {*} reserved - reserved input
 * @returns {*} Domain result
 */
function remaining(desired, purchased, reserved) { return Math.max(0, desired - purchased - reserved); }
module.exports = { fail: fail, text: text, integer: integer, choice: choice, date: date, bool: bool, remaining: remaining };
