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

function getOrderLevelPriceAdjustments(lineItemContainer) {
    var priceAdjustments = {};

    helper.forEach(lineItemContainer.priceAdjustments, function (item) {
        if (item.basedOnCoupon) {
            var coupon = item.couponLineItem;
            var priceAdjustment = {
                UUID: item.UUID,
                coupon: false,
                couponCode: null,
                relationShip: null,
                callOutMsg: item.promotion.calloutMsg
            };

            if (priceAdjustments[coupon.UUID]) {
                priceAdjustments[coupon.UUID].relationship.append(priceAdjustment);
            } else {
                priceAdjustments[coupon.UUID] = {
                    UUID: coupon.UUID,
                    coupon: true,
                    couponCode: coupon.couponCode,
                    relationShip: [priceAdjustment],
                    callOutMsg: null
                };
            }
        } else {
            priceAdjustments[item.UUID] = {
                UUID: item.UUID,
                coupon: false,
                couponCode: null,
                relationShip: null,
                callOutMsg: item.promotion.calloutMsg
            };
        }
    });

    var what = Object.keys(priceAdjustments).map(function (key) {
        return priceAdjustments[key];
    });

    return what;
}

function getOrderLevelPriceAdjustmentHtml(priceAdjustments) {
    var context = new HashMap();
    var object = { totals: { orderLevelPriceAdjustments: priceAdjustments } };

    Object.keys(object).forEach(function (key) {
        context.put(key, object[key]);
    });

    var template = new Template('cart/cartCouponDisplay');
    var whatText = template.render(context).text;
    return whatText;
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
        this.orderLevelPriceAdjustments = getOrderLevelPriceAdjustments(lineItemContainer);
        this.orderLevelPriceAdjustmentHtml = getOrderLevelPriceAdjustmentHtml(
            this.orderLevelPriceAdjustments
        );
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
