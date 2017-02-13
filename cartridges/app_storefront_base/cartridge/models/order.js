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
 * Returns the first productLineItem from a collection of productLineItems.
 * @param {Object} productLineItemsModel - line items model
 * @return {Object} returns an object with image properties
*/
function getFirstProductLineItem(productLineItemsModel) {
    if (productLineItemsModel) {
        var firstItemImage = productLineItemsModel.items[0].images.small[0];
        return {
            imageURL: firstItemImage.url,
            alt: firstItemImage.alt,
            title: firstItemImage.title
        };
    }
    return null;
}

/**
 * Order class that represents the current order
 * @param {dw.order.LineItemCtnr} lineItemContainer - Current users's basket/order
 * @param {Object} modelsObject - object with models for building a order model
 * @param {Object} modelsObject.billingModel - The current order's billing information
 * @param {Object} modelsObject.shippingModel - The current order's shipping information
 * @param {Object} modelsObject.totalsModel - The current order's total information
 * @param {Object} modelsObject.productLineItemsModel - The current order's line items
 * @param {Object} config - Object to help configure the orderModel
 * @param {string} config.numberOfLineItems - helps determine the number of lineitems needed
 * @constructor
 */
function Order(lineItemContainer, modelsObject, config) {
    if (lineItemContainer) {
        this.orderNumber = Object.hasOwnProperty.call(lineItemContainer, 'orderNo')
            ? lineItemContainer.orderNo
            : null;
        this.priceTotal = modelsObject.totalsModel
            ? modelsObject.totalsModel.grandTotal
            : null;
        this.creationDate = Object.hasOwnProperty.call(lineItemContainer, 'creationDate')
            ? lineItemContainer.creationDate
            : null;
        this.orderEmail = lineItemContainer.customerEmail;
        this.orderStatus = Object.hasOwnProperty.call(lineItemContainer, 'status')
            ? lineItemContainer.status
            : null;
        this.productQuantityTotal = lineItemContainer.productQuantityTotal ?
                lineItemContainer.productQuantityTotal : null;

        if (config.numberOfLineItems === '*') {
            this.totals = modelsObject.totalsModel;
            this.lineItemTotal = modelsObject.productLineItemsModel
                ? modelsObject.productLineItemsModel.length
                : null;
            this.steps = lineItemContainer
                ? getCheckoutStepInformation(lineItemContainer)
                : null;
            this.items = modelsObject.productLineItemsModel;
            this.billing = modelsObject.billingModel;
            this.shipping = modelsObject.shippingModel;
        } else if (config.numberOfLineItems === 'single') {
            this.firstLineItem = getFirstProductLineItem(modelsObject.productLineItemsModel);
            this.shippedToFirstName = modelsObject.shippingModel.shippingAddress.firstName;
            this.shippedToLastName = modelsObject.shippingModel.shippingAddress.lastName;
        }
    } else {
        this.orderNumber = null;
        this.creationDate = null;
        this.orderEmail = null;
        this.orderStatus = null;
    }
}

module.exports = Order;
