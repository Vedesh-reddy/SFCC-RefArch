'use strict';

var helper = require('~/cartridge/scripts/dwHelpers');

var ShippingMgr = require('dw/order/ShippingMgr');

var AddressModel = require('~/cartridge/models/address');
var ShippingMethodModel = require('~/cartridge/models/shipping/shippingMethod');
var ProductLineItemsModel = require('~/cartridge/models/productLineItems');


// Private (module) static model functions

/**
 * Plain JS object that represents a DW Script API dw.order.ShippingMethod object
 * @param {dw.order.Shipment} shipment - the target Shipment
 * @param {Object} [address] - optional address object
 * @returns {dw.util.Collection} an array of ShippingModels
 */
function getApplicableShippingMethods(shipment, address) {
    helper.assertRequiredParameter(shipment, 'shipment');

    var shipmentShippingModel = ShippingMgr.getShipmentShippingModel(shipment);
    var shippingMethods;
    if (address) {
        shippingMethods = shipmentShippingModel.getApplicableShippingMethods(address);
    } else {
        shippingMethods = shipmentShippingModel.getApplicableShippingMethods();
    }

    return helper.map(shippingMethods, function (shippingMethod) {
        return ShippingMethodModel.getShippingMethodModel(shippingMethod, shipment);
    });
}

/**
 * Plain JS object that represents a DW Script API dw.order.ShippingMethod object
 * @param {dw.order.Shipment} shipment - the target Shipment
 * @returns {ProductLineItemsModel} an array of ShippingModels
 */
function getProductLineItemsModel(shipment) {
    helper.assertRequiredParameter(shipment, 'shipment');

	// TODO: Implement ProductLineItemsModel.getProductLineItemsModel in other file ...
    return new ProductLineItemsModel(shipment);
}

/**
 * Plain JS object that represents a DW Script API dw.order.ShippingMethod object
 * @param {dw.order.Shipment} shipment - the target Shipment
 * @returns {Object} a ShippingMethodModel object
 */
function getSelectedShippingMethod(shipment) {
    helper.assertRequiredParameter(shipment, 'shipment');

    var method = shipment.getShippingMethod();

    return method ? ShippingMethodModel.getShippingMethodModel(method, shipment) : null;
}

/**
 * Sets the shipping method of the basket's default shipment
 * @param {dw.order.Shipment} shipment - Any shipment for the current basket
 * @param {string} shippingMethodID - The shipping method ID of the desired shipping method
 * @param {dw.util.Collection} shippingMethods - List of applicable shipping methods
 * @param {Object} address - the address
 */
function selectShippingMethod(shipment, shippingMethodID, shippingMethods, address) {
    helper.assertRequiredParameter(shipment, 'shipment');

    var applicableShippingMethods;
    var defaultShippingMethod = ShippingMgr.getDefaultShippingMethod();

    var isShipmentSet = false;

    if (shippingMethods) {
        applicableShippingMethods = shippingMethods;
    } else {
        var shipmentModel = ShippingMgr.getShipmentShippingModel(shipment);
        applicableShippingMethods = address ? shipmentModel.getApplicableShippingMethods(address) :
            shipmentModel.applicableShippingMethods;
    }

    if (shippingMethodID) {
        // loop through the shipping methods to get shipping method
        var iterator = applicableShippingMethods.iterator();
        while (iterator.hasNext()) {
            var shippingMethod = iterator.next();
            if (shippingMethod.ID === shippingMethodID) {
                shipment.setShippingMethod(shippingMethod);
                isShipmentSet = true;
                break;
            }
        }
    }

    if (!isShipmentSet) {
        if (applicableShippingMethods.contains(defaultShippingMethod)) {
            shipment.setShippingMethod(defaultShippingMethod);
        } else if (applicableShippingMethods.length > 0) {
            shipment.setShippingMethod(helper.first(applicableShippingMethods));
        } else {
            shipment.setShippingMethod(null);
        }
    }
}

/**
 * Sets the default ShippingMethod for a Shipment, if absent
 * @param {dw.order.Shipment} shipment - the target Shipment object
 */
function ensureShipmentHasMethod(shipment) {
    helper.assertRequiredParameter(shipment, 'shipment');

    var shippingMethod = shipment.shippingMethod;
    if (!shippingMethod) {
        var methods = ShippingMgr.getShipmentShippingModel(shipment).applicableShippingMethods;
        var defaultMethod = ShippingMgr.getDefaultShippingMethod();

        if (!defaultMethod) {
			// If no defaultMethod set, just use the first one
            shippingMethod = methods[0];
        } else {
			// Look for defaultMethod in applicableMethods
            shippingMethod = helper.find(methods, function (method) {
                return method.ID === defaultMethod.ID;
            });
			// If found, use it.  Otherwise return the first one
            shippingMethod = shippingMethod || methods[0];
        }

        shipment.setShippingMethod(shippingMethod);
    }
}

/**
 * Plain JS object that represents a DW Script API dw.order.ShippingMethod object
 * @param {dw.order.Basket} basket - the target Basket
 * @param {string} uuid - the matching UUID to match against Shipments
 * @returns {dw.order.Shipment} a Shipment object
 */
function getShipmentByUUID(basket, uuid) {
    helper.assertRequiredParameter(basket, 'basket');
    helper.assertRequiredParameter(uuid, 'uuid');

    var shipment;
    var aShipment;

    for (var i = 0, ii = basket.shipments.length; i < ii; i++) {
        aShipment = basket.shipments[i];
        if (aShipment.UUID === uuid) {
            shipment = aShipment;
            break;
        }
    }

    return shipment;
}

// Public model constructor

/**
 * @constructor
 * @classdesc Model that represents shipping information
 *
 * @param {dw.order.shipment} shipment - the default shipment of the current basket
 */
function ShippingModel(shipment) {
    helper.assertRequiredParameter(shipment, 'shipment');

	// Simple properties
    this.UUID = shipment.UUID;

	// Derived properties
    this.productLineItems = getProductLineItemsModel(shipment);
    this.applicableShippingMethods = getApplicableShippingMethods(shipment);
    this.selectedShippingMethod = getSelectedShippingMethod(shipment);

    // Optional properties
    if (shipment.shippingAddress) {
        this.shippingAddress = new AddressModel(shipment.shippingAddress).address;
    }
}


// Public (class) static model functions


/**
 * Plain JS object that represents a DW Script API dw.order.ShippingMethod object
 * @param {dw.order.Basket} currentBasket - the target Basket object
 * @returns {dw.util.ArrayList} an array of ShippingModels
 */
ShippingModel.getShippingModels = function (currentBasket) {
    helper.assertRequiredParameter(currentBasket, 'currentBasket');

    var shipments = currentBasket ? currentBasket.getShipments() : null;

    if (!shipments) return [];

    return helper.map(shipments, function (shipment) {
        return ShippingModel.getShippingModel(shipment);
    });
};

/**
 * Plain JS object that represents a DW Script API dw.order.Shippment object
 * @param {dw.order.Shipment} shipment - the target Shipment object
 * @returns {Object} a ShippingModel object
 */
ShippingModel.getShippingModel = function (shipment) {
    helper.assertRequiredParameter(shipment, 'shipment');

	// If we have an instance hash in module static, here is where we would retrieve it
    return new ShippingModel(shipment);
};


// Extend class object with utility/helper methods

ShippingModel.getApplicableShippingMethod = getApplicableShippingMethods;
ShippingModel.getProductLineItemsModel = getProductLineItemsModel;
ShippingModel.getSelectedShippingMethod = getSelectedShippingMethod;
ShippingModel.selectShippingMethod = selectShippingMethod;
ShippingModel.ensureShipmentHasMethod = ensureShipmentHasMethod;
ShippingModel.getShipmentByUUID = getShipmentByUUID;

module.exports = ShippingModel;
