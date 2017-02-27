'use strict';

var URLUtils = require('dw/web/URLUtils');
var Resource = require('dw/web/Resource');

/**
 * Generates an object of URLs
 * @returns {Object} an object of URLs in string format
 */
function getCartActionUrls() {
    return {
        removeProductLineItemUrl: URLUtils.url('Cart-RemoveProductLineItem').toString(),
        updateQuantityUrl: URLUtils.url('Cart-UpdateQuantity').toString(),
        selectShippingUrl: URLUtils.url('Cart-SelectShippingMethod').toString(),
        submitCouponCodeUrl: URLUtils.url('Cart-AddCoupon').toString(),
        removeCouponLineItem: URLUtils.url('Cart-RemoveCouponLineItem').toString()
    };
}

/**
 * @constructor
 * @classdesc Cart class that represents the current basket
 *
 * @param {dw.order.Basket} basket - Current users's basket
 * @param {Object} shippingModel - Instance of the shipping model
 * @param {Object} productLineItemModel - Model for a given product line items
 * @param {Object} totalsModel - Model with total costs for the cart
 */
function cart(basket, shippingModel, productLineItemModel, totalsModel) {
    if (basket !== null) {
        this.actionUrls = getCartActionUrls();
        this.numOfShipments = basket.shipments.length;
        this.totals = totalsModel;

        if (shippingModel) {
            this.shippingMethods = shippingModel.applicableShippingMethods;
            this.selectedShippingMethod = shippingModel.selectedShippingMethod.ID;
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
