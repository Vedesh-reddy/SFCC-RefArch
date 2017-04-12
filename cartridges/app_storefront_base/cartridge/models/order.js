'use strict';

var Resource = require('dw/web/Resource');

var AddressModel = require('~/cartridge/models/address');
var BillingModel = require('~/cartridge/models/billing');
var PaymentModel = require('~/cartridge/models/payment');
var ProductLineItemsModel = require('~/cartridge/models/productLineItems');
var TotalsModel = require('~/cartridge/models/totals');

var ShippingHelpers = require('~/cartridge/scripts/checkout/shippingHelpers');

var DEFAULT_MODEL_CONFIG = {
    numberOfLineItems: '*'
};

var RESOURCES = {
    noSelectedPaymentMethod: Resource.msg('error.no.selected.payment.method', 'creditCard', null),
    cardType: Resource.msg('msg.payment.type.credit', 'confirmation', null),
    cardEnding: Resource.msg('msg.card.type.ending', 'confirmation', null),
    shippingMethod: Resource.msg('Shipping Method', 'checkout', null),
    items: Resource.msg('msg.items', 'checkout', null),
    item: Resource.msg('msg.item', 'checkout', null),
    addNewAddress: Resource.msg('msg.add.new.address', 'checkout', null),
    newAddress: Resource.msg('msg.new.address', 'checkout', null),
    shipToAddress: Resource.msg('msg.ship.to.address', 'checkout', null),
    shippingAddresses: Resource.msg('msg.shipping.addresses', 'checkout', null),
    accountAddresses: Resource.msg('msg.account.addresses', 'checkout', null),
    shippingTo: Resource.msg('msg.shipping.to', 'checkout', null),
    pickupInStore: Resource.msg('msg.pickup.in.store', 'checkout', null)
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
 * @param {Object} options - The current order's line items
 * @param {Object} options.config - Object to help configure the orderModel
 * @param {string} options.config.numberOfLineItems - helps determine the number of lineitems needed
 * @constructor
 */
function OrderModel(lineItemContainer, options) {
	this.resources = RESOURCES;

    if (!lineItemContainer) {
        this.orderNumber = null;
        this.creationDate = null;
        this.orderEmail = null;
        this.orderStatus = null;
        this.usingMultiShipping = null;
        this.shippable = null;
    } else {
        var safeOptions = options || {};

        var modelConfig = safeOptions.config || DEFAULT_MODEL_CONFIG;
        var customer = safeOptions.customer || lineItemContainer.customer;
        var currencyCode = safeOptions.currencyCode || lineItemContainer.currencyCode;
        var usingMultiShipping = safeOptions.usingMultiShipping
            || (lineItemContainer.shipments.length > 1);

        var shippingModels = ShippingHelpers.getShippingModels(lineItemContainer);

        var paymentModel = new PaymentModel(lineItemContainer, customer, currencyCode);

        var billingAddressModel = new AddressModel(lineItemContainer.billingAddress);
        var billingModel = new BillingModel(billingAddressModel, paymentModel);

        var productLineItemsModel = new ProductLineItemsModel(lineItemContainer);
        var totalsModel = new TotalsModel(lineItemContainer);

        this.shippable = safeOptions.shippable || false;
        this.usingMultiShipping = usingMultiShipping;
        this.orderNumber = Object.hasOwnProperty.call(lineItemContainer, 'orderNo')
            ? lineItemContainer.orderNo
            : null;
        this.priceTotal = totalsModel ? totalsModel.grandTotal
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

        if (modelConfig.numberOfLineItems === '*') {
            this.totals = totalsModel;
            this.lineItemTotal = productLineItemsModel ? productLineItemsModel.length : null;
            this.steps = lineItemContainer
                ? getCheckoutStepInformation(lineItemContainer)
                : null;
            this.items = productLineItemsModel;
            this.billing = billingModel;
            this.shipping = shippingModels;
        } else if (modelConfig.numberOfLineItems === 'single') {
            this.firstLineItem = getFirstProductLineItem(productLineItemsModel);
            this.shippedToFirstName = shippingModels[0].shippingAddress.firstName;
            this.shippedToLastName = shippingModels[0].shippingAddress.lastName;
        }
    }
}

module.exports = OrderModel;
