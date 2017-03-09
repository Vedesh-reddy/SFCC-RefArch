'use strict';

var AddressModel = require('~/cartridge/models/address');
var ShippingModel = require('~/cartridge/models/shipping');
var BillingModel = require('~/cartridge/models/billing');
var PaymentModel = require('~/cartridge/models/payment');
var ProductLineItemsModel = require('~/cartridge/models/productLineItems');
var TotalsModel = require('~/cartridge/models/totals');

var DEFAULT_MODEL_CONFIG = {
    numberOfLineItems: '*'
};

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
 * @param {Object} modelsObject.shippingModels - The current order's shipping information
 * @param {Object} modelsObject.totalsModel - The current order's total information
 * @param {Object} modelsObject.productLineItemsModel - The current order's line items
 * @param {Object} config - Object to help configure the orderModel
 * @param {string} config.numberOfLineItems - helps determine the number of lineitems needed
 * @constructor
 */
function OrderModel(lineItemContainer, modelsObject, config) {
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
            this.shipping = modelsObject.shippingModels;
        } else if (config.numberOfLineItems === 'single') {
            this.firstLineItem = getFirstProductLineItem(modelsObject.productLineItemsModel);
            this.shippedToFirstName = modelsObject.shippingModels[0].shippingAddress.firstName;
            this.shippedToLastName = modelsObject.shippingModels[0].shippingAddress.lastName;
        }
    } else {
        this.orderNumber = null;
        this.creationDate = null;
        this.orderEmail = null;
        this.orderStatus = null;
    }
}

OrderModel.getOrderModel = function (order, options) {
    var safeOptions = options || {};

    var modelConfig = safeOptions.config || DEFAULT_MODEL_CONFIG;
    var customer = safeOptions.customer || order.customer;
    var currencyCode = safeOptions.currencyCode || order.currencyCode;

    var shippingModels = ShippingModel.getShippingModels(order);

    var paymentModel = new PaymentModel(order, customer, currencyCode);

    var billingAddressModel = new AddressModel(order.billingAddress);
    var billingModel = new BillingModel(billingAddressModel, paymentModel);

    var productLineItemsModel = new ProductLineItemsModel(order);
    var totalsModel = new TotalsModel(order);

    var modelsObject = {
        billingModel: billingModel,
        shippingModels: shippingModels,
        totalsModel: totalsModel,
        productLineItemsModel: productLineItemsModel
    };

    return new OrderModel(order, modelsObject, modelConfig);
};

module.exports = OrderModel;
