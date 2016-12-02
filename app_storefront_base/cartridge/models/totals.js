'use strict';

var formatMoney = require('dw/util/StringUtils').formatMoney;
var helper = require('~/cartridge/scripts/dwHelpers');

var money = require('dw/value/Money');
var Resource = require('dw/web/Resource');

/**
 * Accepts a total object and formats the value
 * @param {dw.value.Money} total - Total price of the cart
 * @returns {string} the formatted money value
 */
function getTotals(total) {
    return !total.available ? '-' : formatMoney(money(total.value, total.currencyCode));
}

function getOrderLevelDiscountTotal(lineItemContainer) {
    var totalExcludingOrderDiscount = lineItemContainer.getAdjustedMerchandizeTotalPrice(false);
    var totalIncludingOrderDiscount = lineItemContainer.getAdjustedMerchandizeTotalPrice(true);
    var orderDiscount = totalExcludingOrderDiscount.subtract(totalIncludingOrderDiscount);

    return {
        value: orderDiscount.value,
        formatted: formatMoney(money(orderDiscount.value, orderDiscount.currencyCode))
    };
}

function getShippingLevelDiscountTotal(lineItemContainer) {
    var totalExcludingShippingDiscount = lineItemContainer.shippingTotalPrice;
    var totalIncludingShippingDiscount = lineItemContainer.adjustedShippingTotalPrice;
    var shippingDiscount = totalExcludingShippingDiscount.subtract(totalIncludingShippingDiscount);

    return {
        value: shippingDiscount.value,
        formatted: formatMoney(money(shippingDiscount.value, shippingDiscount.currencyCode))
    };
}

/**
 * @constructor
 * @classdesc totals class that represents the order totals of the current line item container
 *
 * @param {dw.order.lineItemContainer} lineItemContainer - The current user's line item container
 */
function totals(lineItemContainer) {
    if (lineItemContainer) {
        this.subTotal = getTotals(lineItemContainer.getAdjustedMerchandizeTotalPrice(false));
        this.grandTotal = getTotals(lineItemContainer.totalGrossPrice);
        this.totalTax = getTotals(lineItemContainer.totalTax);
        this.totalShippingCost = getTotals(lineItemContainer.shippingTotalPrice);
        this.orderLevelDiscountTotal = getOrderLevelDiscountTotal(lineItemContainer);
        this.shippingLevelDiscountTotal = getShippingLevelDiscountTotal(lineItemContainer);
    } else {
        this.subTotal = '-';
        this.grandTotal = '-';
        this.totalTax = '-';
        this.totalShippingCost = '-';
        this.orderLevelDiscountTotal = '-';
        this.shippingLevelDiscountTotal = '-';
    }
}

module.exports = totals;
