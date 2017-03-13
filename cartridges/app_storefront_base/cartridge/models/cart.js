'use strict';

var URLUtils = require('dw/web/URLUtils');
var Resource = require('dw/web/Resource');

var TotalsModel = require('~/cartridge/models/totals');
var ProductLineItemsModel = require('~/cartridge/models/productLineItems');

var ShippingHelpers = require('~/cartridge/scripts/checkout/shippingHelpers');

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
 * @classdesc CartModel class that represents the current basket
 *
 * @param {dw.order.Basket} basket - Current users's basket
 */
function CartModel(basket) {
    var shippingModels = ShippingHelpers.getShippingModels(basket);
    var productLineItemsModel = new ProductLineItemsModel(basket);
    var totalsModel = new TotalsModel(basket);

    if (basket !== null) {
        this.actionUrls = getCartActionUrls();
        this.numOfShipments = basket.shipments.length;
        this.totals = totalsModel;
        this.shipments = [];

        if (shippingModels) {
            var shippingModel;
            var shipment;
            for (var i = 0, ii = this.numOfShipments; i < ii; i++) {
                shippingModel = shippingModels[i];
                shipment = {};
                shipment.shippingMethods = shippingModel.applicableShippingMethods;
                shipment.selectedShippingMethod = shippingModel.selectedShippingMethodID;
                this.shipments.push(shipment);
            }
        }
    }

    this.items = productLineItemsModel.items;
    this.numItems = productLineItemsModel.totalQuantity;
    this.resources = {
        numberOfItems: Resource.msgf('label.number.items.in.cart', 'cart', null, this.numItems),
        emptyCartMsg: Resource.msg('info.cart.empty.msg', 'cart', null)
    };
}

module.exports = CartModel;
