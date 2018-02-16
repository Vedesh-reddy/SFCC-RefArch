'use strict';

/**
 * Trigger events for each change in the shipment
 * @param {List} keys - keys of changed properties of shipment
 * @param {Object} shipment - changed shipment object
 * @param {Object} currentState - current state of shipping component
 */
var trigger = function (keys, shipment, currentState) {
    keys.forEach(function (key) {
        $('.shipping-form').trigger('stateChange:' + key, {
            shipment: shipment,
            currentState: currentState
        });
    });
};

/**
 * Shipping state model constructor
 * @param {Objct} state - initial state object
 */
function shippingState(state) {
    this.shippingState = state;
}

shippingState.prototype.changeState = function (changeObject, shipmentUUID) {
    var currentState = this;
    var changedKeys = [];
    var shipmentChanged;

    if (shipmentUUID) {
        currentState.shippingState.shipments.forEach(function (shipment) {
            if (shipment.shipmentUUID === shipmentUUID) {
                shipmentChanged = shipment;
            }
        });
    }

    Object.keys(changeObject).forEach(function (key) {
        if (currentState.shippingState[key] !== undefined) {
            currentState.shippingState[key] = changeObject[key];
            changedKeys.push(key);
        } else {
            shipmentChanged[key] = changeObject[key];
            changedKeys.push(key);
        }
    });

    trigger(changedKeys, shipmentChanged, currentState);
};

module.exports = shippingState;
