'use strict';

var formatMoney = require('dw/util/StringUtils').formatMoney;
var money = require('dw/value/Money');


/**
 * Accepts a total object and formats the value
 * @param {dw.value.Money} total - Total price of the cart
 * @returns {string} the formatted money value
 */
function getTotals(total) {
    return !total.available ? '-' : formatMoney(money(total.value, total.currencyCode));
}

/**
 * @constructor
 * @classdesc totals class that represents the order totals of the current basket
 *
 * @param {dw.order.Basket} basket - Current users's basket
 */
function totals(basket) {
    if (basket) {
        this.subTotal = getTotals(basket.adjustedMerchandizeTotalPrice);
        this.grandTotal = getTotals(basket.totalGrossPrice);
        this.totalTax = getTotals(basket.totalTax);
        this.totalShippingCost = getTotals(basket.shippingTotalPrice);
    } else {
        this.subTotal = '-';
        this.grandTotal = '-';
        this.totalTax = '-';
        this.totalShippingCost = '-';
    }
}

module.exports = totals;
