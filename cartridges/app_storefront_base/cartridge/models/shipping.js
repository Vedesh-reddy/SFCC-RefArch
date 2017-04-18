'use strict';

var ShippingMgr = require('dw/order/ShippingMgr');

var Collections = require('~/cartridge/scripts/util/collections');

var AddressModel = require('~/cartridge/models/address');
var ProductLineItemsModel = require('~/cartridge/models/productLineItems');
var ShippingMethodModel = require('~/cartridge/models/shipping/shippingMethod');


/**
 * Plain JS object that represents a DW Script API dw.order.ShippingMethod object
 * @param {dw.order.Shipment} shipment - the target Shipment
 * @param {Object} [address] - optional address object
 * @returns {dw.util.Collection} an array of ShippingModels
 */
function getApplicableShippingMethods(shipment, address) {
    if (!shipment) return null;

    var shipmentShippingModel = ShippingMgr.getShipmentShippingModel(shipment);

    var shippingMethods;
    if (address) {
        shippingMethods = shipmentShippingModel.getApplicableShippingMethods(address);
    } else {
        shippingMethods = shipmentShippingModel.getApplicableShippingMethods();
    }

    return Collections.map(shippingMethods, function (shippingMethod) {
        return new ShippingMethodModel(shippingMethod, shipment);
    });
}

/**
 * Plain JS object that represents a DW Script API dw.order.ShippingMethod object
 * @param {dw.order.Shipment} shipment - the target Shipment
 * @returns {ProductLineItemsModel} an array of ShippingModels
 */
function getProductLineItemsModel(shipment) {
    if (!shipment) return null;

    return new ProductLineItemsModel(shipment.productLineItems);
}

/**
 * Plain JS object that represents a DW Script API dw.order.ShippingMethod object
 * @param {dw.order.Shipment} shipment - the target Shipment
 * @returns {Object} a ShippingMethodModel object
 */
function getSelectedShippingMethod(shipment) {
    if (!shipment) return null;

    var method = shipment.shippingMethod;

    return method ? new ShippingMethodModel(method, shipment) : null;
}

/**
 * ppingMethod object
 * @param {dw.order.Shipment} shipment - the target Shipment
 * @returns {string} the Shipment UUID or null
 */
function getShipmentUUID(shipment) {
    if (!shipment) return null;

    return shipment.UUID;
}

/**
 * @constructor
 * @classdesc Model that represents shipping information
 *
 * @param {dw.order.Shipment} shipment - the default shipment of the current basket
 * @param {Object} address - the address to use to filter the shipping method list
 */
function ShippingModel(shipment, address) {
	// Simple properties
    this.UUID = getShipmentUUID(shipment);

	// Derived properties
    this.productLineItems = getProductLineItemsModel(shipment);
    this.applicableShippingMethods = getApplicableShippingMethods(shipment, address);
    this.selectedShippingMethod = getSelectedShippingMethod(shipment);

    // Optional properties
    if (shipment && shipment.shippingAddress) {
        this.shippingAddress = new AddressModel(shipment.shippingAddress).address;
    } else {
        this.shippingAddress = address;
    }
}

module.exports = ShippingModel;
