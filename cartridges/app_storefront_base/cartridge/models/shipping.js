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
    return new ProductLineItemsModel(shipment);
}

/**
 * Plain JS object that represents a DW Script API dw.order.ShippingMethod object
 * @param {dw.order.Shipment} shipment - the target Shipment
 * @returns {Object} a ShippingMethodModel object
 */
function getSelectedShippingMethod(shipment) {
    var method = shipment.getShippingMethod();

    return method ? new ShippingMethodModel(method, shipment) : null;
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
    this.UUID = shipment.UUID;

	// Derived properties
    this.productLineItems = getProductLineItemsModel(shipment);
    this.applicableShippingMethods = getApplicableShippingMethods(shipment, address);
    this.selectedShippingMethod = getSelectedShippingMethod(shipment);

    // Optional properties
    if (shipment.shippingAddress) {
        this.shippingAddress = new AddressModel(shipment.shippingAddress).address;
    }
}

module.exports = ShippingModel;
