'use strict';

/**
 * Creates an object of information that contains information about the steps
 * @param {dw.order.LineItemCtnr} lineItemContainer - Current users's basket
 * @returns {Object} Creates an object that contains information about the checkout steps
 */
function getCheckoutStepInformation(lineItemContainer) {
    var shippingAddress;
    if (lineItemContainer.defaultShipment) {
        shippingAddress = lineItemContainer.defaultShipment.shippingAddress;
    }

    return {
        shipping: { iscompleted: !!shippingAddress },
        billing: { iscompleted: !!lineItemContainer.billingAddress }
    };
}

/**
 * Order class that represents the current order
 * @param {dw.order.LineItemCtnr} lineItemContainer - Current users's basket
 * @param {Object} shippingModel - The current order's shipping information
 * @param {Object} billingModel - The current order's billing information
 * @param {Object} orderTotals - The current order's total information
 * @param {Object} lineItems - The current order's line items
 * @constructor
 */
function order(lineItemContainer, shippingModel, billingModel, orderTotals, lineItems) {
    this.shipping = shippingModel;
    this.billing = billingModel;
    this.totals = orderTotals;
    this.items = lineItems;
    this.steps = lineItemContainer ? getCheckoutStepInformation(lineItemContainer) : null;

    if (lineItemContainer) {
        this.orderNumber = Object.hasOwnProperty.call(lineItemContainer, 'orderNo')
            ? lineItemContainer.orderNo
            : null;
        this.creationDate = Object.hasOwnProperty.call(lineItemContainer, 'creationDate')
            ? lineItemContainer.creationDate
            : null;
        this.orderEmail = lineItemContainer.customerEmail ? lineItemContainer.customerEmail : null;
        this.orderStatus = Object.hasOwnProperty.call(lineItemContainer, 'status')
            ? lineItemContainer.status
            : null;
        this.productQuantityTotal = lineItemContainer.productQuantityTotal ?
            lineItemContainer.productQuantityTotal : null;
    } else {
        this.orderNumber = null;
        this.creationDate = null;
        this.orderEmail = null;
        this.orderStatus = null;
    }
}

module.exports = order;
