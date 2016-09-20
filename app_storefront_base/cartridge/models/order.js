'use strict';

/**
 * Creates an object of information that contains information about the steps
 * @param {dw.order.Basket} basket Current users's basket
 * @returns {Object} Creates an object that contains information about the checkout steps
 */
function getCheckoutStepInformation(basket) {
    var shippingAddress;
    if (basket.defaultShipment) {
        shippingAddress = basket.defaultShipment.shippingAddress;
    }

    return {
        shipping: { iscompleted: !!shippingAddress },
        billing: { iscompleted: !!basket.billingAddress }
    };
}

/**
 * Order class that represents the current order
 * @param {dw.order.Basket} basket Current users's basket
 * @param {Object} shippingModel - The current order's shipping information
 * @param {Object} billingModel - The current order's billing information
 * @param {Object} orderTotals - The current order's total information
 * @param {Object} lineItems - The current order's line items
 * @constructor
 */
function order(basket, shippingModel, billingModel, orderTotals, lineItems) {
    this.shipping = shippingModel;
    this.billing = billingModel;
    this.totals = orderTotals;
    this.items = lineItems;
    this.steps = basket ? getCheckoutStepInformation(basket) : null;
}

module.exports = order;
