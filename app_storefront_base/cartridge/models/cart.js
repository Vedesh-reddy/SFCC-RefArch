'use strict';

var URLUtils = require('dw/web/URLUtils');
var formatMoney = require('dw/util/StringUtils').formatMoney;
var money = require('dw/value/Money');
var Resource = require('dw/web/Resource');


/**
 * Creates an object containing the order totals
 * @param {dw.order.Basket} basket - The current users's basket
 * @returns {Array} an array of objects containing the information of applicable shipping methods
 */
function getTotals(basket) {
    var totals = {};

    totals.subTotal = !basket.adjustedMerchandizeTotalPrice.available ? '-' : formatMoney(money(
        basket.adjustedMerchandizeTotalPrice.value,
        basket.adjustedMerchandizeTotalPrice.currencyCode
    ));

    totals.grandTotal = !basket.totalGrossPrice.available ? totals.subTotal : formatMoney(money(
        basket.totalGrossPrice.value,
        basket.totalGrossPrice.currencyCode
    ));

    totals.totalTax = !basket.totalTax.available ? '-' : formatMoney(money(
        basket.totalTax.value,
        basket.totalTax.currencyCode
    ));

    totals.totalShippingCost = !basket.shippingTotalPrice.available ? '-' : formatMoney(money(
        basket.shippingTotalPrice.value,
        basket.shippingTotalPrice.currencyCode
    ));

    return totals;
}

/**
 * Generates an object of URLs
 * @returns {Object} an object of URLs in string format
 */
function getCartActionUrls() {
    return {
        removeProductLineItemUrl: URLUtils.url('Cart-RemoveProductLineItem').toString(),
        updateQuantityUrl: URLUtils.url('Cart-UpdateQuantity').toString(),
        selectShippingUrl: URLUtils.url('Cart-SelectShippingMethod').toString()
    };
}

/**
 * Cart class that represents the current basket
 * @param {dw.order.Basket} basket Current users's basket
 * @param {Object} shippingModel - Instance of the shipping model
 * @constructor
 */
function cart(basket, shippingModel, productLineItemModel) {
    if (basket !== null) {
        this.actionUrls = getCartActionUrls();
        this.numOfShipments = basket.shipments.length;
        this.totals = getTotals(basket);

        if (shippingModel) {
            this.shippingMethods = shippingModel.applicableShippingMethods;
        }

        if (basket.defaultShipment.shippingMethod) {
            this.selectedShippingMethod = basket.defaultShipment.shippingMethod.ID;
        }
    }

    this.items = productLineItemModel.items;
    this.numItems = productLineItemModel.totalQuantity;
    this.resources = {
        numberOfItems: Resource.msgf('label.number.items.in.cart', 'cart', null, this.numItems),
        emptyCartMsg: Resource.msg('info.cart.empty.msg', 'cart', null)
    };
}

module.exports = cart;
