'use strict';

var helper = require('~/cartridge/scripts/dwHelpers');

var formatMoney = require('dw/util/StringUtils').formatMoney;
var money = require('dw/value/Money');
var ShippingMgr = require('dw/order/ShippingMgr');


/**
 * Sets the shipping method of the basket's default shipment
 * @param {dw.order.Shipment} defaultShipment - The default shipment for the current basket
 * @param {string} shippingMethodID - The shipping method ID of the desired shipping method
 * @param {string} shippingMethods - List of applicable shipping methods of the current basket
 * @param {Object} address - the address
 * @return {void}
 */
function selectShippingMethod(defaultShipment, shippingMethodID, shippingMethods, address) {
    var applicableShippingMethods;
    var defaultShippingMethod = ShippingMgr.getDefaultShippingMethod();
    var isShipmentSet = false;

    if (shippingMethods) {
        applicableShippingMethods = shippingMethods;
    } else {
        var shipmentModel = ShippingMgr.getShipmentShippingModel(defaultShipment);
        applicableShippingMethods = address ? shipmentModel.getApplicableShippingMethods(address) :
            shipmentModel.applicableShippingMethods;
    }

    if (shippingMethodID) {
        // loop through the shipping methods to get shipping method
        var iterator = applicableShippingMethods.iterator();
        while (iterator.hasNext()) {
            var shippingMethod = iterator.next();
            if (shippingMethod.ID === shippingMethodID) {
                defaultShipment.setShippingMethod(shippingMethod);
                isShipmentSet = true;
                break;
            }
        }
    }

    if (!isShipmentSet) {
        if (applicableShippingMethods.contains(defaultShippingMethod)) {
            defaultShipment.setShippingMethod(defaultShippingMethod);
        } else if (applicableShippingMethods.length > 0) {
            defaultShipment.setShippingMethod(shippingMethods.iterator().next());
        } else {
            defaultShipment.setShippingMethod(null);
        }
    }
}

/**
 * Creates an array of objects containing the information of applicable shipping methods
 * @param {dw.order.ShipmentShippingModel} shipmentModel - Instance of the shipping model
 * @param {Object} address - the address
 * @returns {Array} an array of objects containing the information of applicable shipping methods
 */
function getApplicableShippingMethods(shipmentModel, address) {
    var shippingMethods = address ? shipmentModel.getApplicableShippingMethods(address) :
        shipmentModel.applicableShippingMethods;

    return helper.map(shippingMethods, function (shippingMethod) {
        var shippingCost = shipmentModel.getShippingCost(shippingMethod);
        return {
            description: shippingMethod.description,
            displayName: shippingMethod.displayName,
            ID: shippingMethod.ID,
            shippingCost: formatMoney(money(
                shippingCost.amount.value,
                shippingCost.amount.currencyCode
            )),
            estimatedArrivalTime: shippingMethod.custom.estimatedArrivalTime
        };
    });
}

/**
 * Converts API shipment into plain object
 * @param {dw.order.shipment} shippingMethod - the default shipment of the current basket
 * @returns {Object} object containing information about the selected shipping method
 */
function getSelectedShippingMethod(shippingMethod) {
    return {
        ID: shippingMethod.ID,
        displayName: shippingMethod.displayName,
        description: shippingMethod.description,
        estimatedArrivalTime: shippingMethod.custom.estimatedArrivalTime
    };
}

/**
 * @constructor
 * @classdesc Model that represents shipping information
 *
 * @param {dw.order.shipment} defaultShipment - the default shipment of the current basket
 * @param {dw.order.ShipmentShippingModel} shipmentModel - Instance of demandware shipping
 *      model which shipment-level shipping information
 * @param {Object} addressModel - Shipping address model
 */
function shipping(defaultShipment, shipmentModel, addressModel) {
    if (addressModel) {
        this.applicableShippingMethods = shipmentModel ?
            getApplicableShippingMethods(shipmentModel, addressModel.address) :
            null;
        this.shippingAddress = addressModel.address;
    } else {
        this.applicableShippingMethods = shipmentModel ?
            getApplicableShippingMethods(shipmentModel) :
            null;
        this.shippingAddress = null;
    }
    this.selectedShippingMethod = defaultShipment && defaultShipment.shippingMethod ?
        getSelectedShippingMethod(defaultShipment.shippingMethod) :
        null;
}

shipping.selectShippingMethod = selectShippingMethod;
shipping.getApplicableShippingMethods = getApplicableShippingMethods;

module.exports = shipping;
