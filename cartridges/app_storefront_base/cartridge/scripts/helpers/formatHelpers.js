'use strict';

var StringUtils = require('dw/util/StringUtils');

function formatNumber(value) {
    var result = StringUtils.formatNumber(value, '#,##0', 'en_US');
    return result;
}

function formatPrice(value) {
    var result = StringUtils.formatNumber(value, '#,##0.00', 'en_US');
    return result;
}

module.exports = {
    formatNumber: formatNumber,
    formatPrice: formatPrice
};
