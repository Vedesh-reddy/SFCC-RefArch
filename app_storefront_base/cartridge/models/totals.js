'use strict';

var formatMoney = require('dw/util/StringUtils').formatMoney;
var money = require('dw/value/Money');

/**
 * totals class that represents the order totals of the current basket
 * @param {dw.order.Basket} basket Current users's basket
 * @constructor
 */
function totals(basket) {
    if (basket) {
        this.subTotal = !basket.adjustedMerchandizeTotalPrice.available ? '-' : formatMoney(money(
            basket.adjustedMerchandizeTotalPrice.value,
            basket.adjustedMerchandizeTotalPrice.currencyCode
        ));

        this.grandTotal = !basket.totalGrossPrice.available ? '-' : formatMoney(money(
            basket.totalGrossPrice.value,
            basket.totalGrossPrice.currencyCode
        ));

        this.totalTax = !basket.totalTax.available ? '-' : formatMoney(money(
            basket.totalTax.value,
            basket.totalTax.currencyCode
        ));

        this.totalShippingCost = !basket.shippingTotalPrice.available ? '-' : formatMoney(money(
            basket.shippingTotalPrice.value,
            basket.shippingTotalPrice.currencyCode
        ));
    } else {
        this.subTotal = null;
        this.grandTotal = null;
        this.totalTax = null;
        this.totalShippingCost = null;
    }
}

module.exports = totals;
