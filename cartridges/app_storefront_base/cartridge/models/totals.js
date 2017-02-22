'use strict';

var formatMoney = require('dw/util/StringUtils').formatMoney;
var money = require('dw/value/Money');
var helper = require('~/cartridge/scripts/dwHelpers');
var HashMap = require('dw/util/HashMap');
var Template = require('dw/util/Template');

/**
 * Accepts a total object and formats the value
 * @param {dw.value.Money} total - Total price of the cart
 * @returns {string} the formatted money value
 */
function getTotals(total) {
    return !total.available ? '-' : formatMoney(money(total.value, total.currencyCode));
}

/**
 * Gets the order discount amount by subtracting the basket's total including the discount from
 *      the basket's total excluding the order discount.
 * @param {dw.order.LineItemCtnr} lineItemContainer - Current users's basket
 * @returns {Object} an object that contains the value and formatted value of the order discount
 */
function getOrderLevelDiscountTotal(lineItemContainer) {
    var totalExcludingOrderDiscount = lineItemContainer.getAdjustedMerchandizeTotalPrice(false);
    var totalIncludingOrderDiscount = lineItemContainer.getAdjustedMerchandizeTotalPrice(true);
    var orderDiscount = totalExcludingOrderDiscount.subtract(totalIncludingOrderDiscount);

    return {
        value: orderDiscount.value,
        formatted: formatMoney(money(orderDiscount.value, orderDiscount.currencyCode))
    };
}

/**
 * Gets the shipping discount total by subtracting the adjusted shipping total from the
 *      shipping total price
 * @param {dw.order.LineItemCtnr} lineItemContainer - Current users's basket
 * @returns {Object} an object that contains the value and formatted value of the shipping discount
 */
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
 * creates an array of discounts.
 * @param {dw.order.LineItemCtnr} lineItemContainer - the current line item container
 * @returns {Array} an array of objects containing promotion and coupon information
 */
function getDiscounts(lineItemContainer) {
    var discounts = {};

    helper.forEach(lineItemContainer.couponLineItems, function (couponLineItem) {
        var priceAdjustments = helper.map(
            couponLineItem.priceAdjustments, function (priceAdjustment) {
                return { callOutMsg: priceAdjustment.promotion.calloutMsg };
            });
        discounts[couponLineItem.UUID] = {
            type: 'coupon',
            UUID: couponLineItem.UUID,
            couponCode: couponLineItem.couponCode,
            applied: couponLineItem.applied,
            valid: couponLineItem.valid,
            relationship: priceAdjustments
        };
    });

    helper.forEach(lineItemContainer.priceAdjustments, function (item) {
        if (!item.basedOnCoupon) {
            discounts[item.UUID] = {
                UUID: item.UUID,
                type: 'promotion',
                callOutMsg: item.promotion.calloutMsg
            };
        }
    });

    return Object.keys(discounts).map(function (key) {
        return discounts[key];
    });
}

/**
 * create the discount results html
 * @param {Array} discounts - an array of objects that contains coupon and priceAdjustment
 * information
 * @returns {string} The rendered HTML
 */
function getDiscountsHtml(discounts) {
    var context = new HashMap();
    var object = { totals: { discounts: discounts } };

    Object.keys(object).forEach(function (key) {
        context.put(key, object[key]);
    });

    var template = new Template('cart/cartCouponDisplay');
    return template.render(context).text;
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
        this.discounts = getDiscounts(lineItemContainer);
        this.discountsHtml = getDiscountsHtml(this.discounts);
    } else {
        this.subTotal = '-';
        this.grandTotal = '-';
        this.totalTax = '-';
        this.totalShippingCost = '-';
        this.orderLevelDiscountTotal = '-';
        this.shippingLevelDiscountTotal = '-';
        this.priceAdjustments = null;
    }
}

module.exports = totals;
