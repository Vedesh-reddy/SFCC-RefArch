'use strict';

/**
 * Creates an object with information about the state of Shipping stage of checkout process
 * @param {Object} order - order model
 * @returns {Object} and object with the current state of shipping component
 */
function getStateInfo(order) {
    var multiship = order.shipping.length > 1;
    var shipments = order.shipping.map(function (shipment) {
        return {
            shipmentUUID: shipment.UUID,
            methodID: shipment.selectedShippingMethod.ID,
            deliveryAddress: !shipment.selectedShippingMethod.storePickupEnabled
                ? shipment.shippingAddress
                : null,
            pickupAddress: shipment.selectedShippingMethod.storePickupEnabled
                ? shipment.shippingAddress
                : null,
            pickupEnabled: shipment.selectedShippingMethod.storePickupEnabled,
            editMode: false,
            searchZipCode: '',
            searchRadius: '15'
        };
    });

    return {
        shipments: shipments,
        multiship: multiship,
        collapsed: false
    };
}

/**
 * @constructor
 * @classdesc Model that represents initial state of the shipping information
 *
 * @param {Object} orderModel - the order model
 */
function ShippingState(orderModel) {
    this.shippingState = getStateInfo(orderModel);
}

module.exports = ShippingState;
