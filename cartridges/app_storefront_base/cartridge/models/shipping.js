'use strict';

var helper = require('~/cartridge/scripts/dwHelpers');

var ShippingMgr = require('dw/order/ShippingMgr');

var AddressModel = require('~/cartridge/models/address');
var ShippingMethodModel = require('~/cartridge/models/shipping/shippingMethod');
var ProductLineItemsModel = require('~/cartridge/models/productLineItems');


/**
 * Plain JS object that represents a DW Script API dw.order.ShippingMethod object
 * @param {dw.order.ShippingMethod} shippingMethod - the default shipment of the current basket
 * @param {dw.order.Shipment} [shipment] - a Shipment
 * @returns {Object} object containing information about the selected shipping method
 */
/**
 * @constructor
 * @classdesc Model that represents shipping information
 *
 * @param {dw.order.shipment} shipment - the default shipment of the current basket
 * @param {dw.order.ShipmentShippingModel} shipmentModel - Instance of demandware shipping
 *      model which shipment-level shipping information
 * @param {Object} addressModel - Shipping address model
 */
function ShippingModel(shipment){
	helper.assertRequiredParameter(shipment, 'shipment');
	
	// Simple properties
	this.UUID = shipment.UUID;
	
	// Derived properties
	this.productLineItems = getProductLineItemsModel(shipment);
	this.applicableShippingMethods = getApplicableShippingMethods(shipment);
    this.selectedShippingMethod = getSelectedShippingMethod(shipment);
    
    // Optional properties
    if( shipment.shippingAddress ){
    	this.shippingAddress = new AddressModel(shipment.shippingAddress).address;
    }
}


// Public (class) static model functions


/**
 * Plain JS object that represents a DW Script API dw.order.ShippingMethod object
 * @param {dw.order.Basket} currentBasket
 * @returns {dw.util.ArrayList} an array of ShippingModels
 */
ShippingModel.getShippingModels = function(currentBasket){
	helper.assertRequiredParameter(currentBasket, 'currentBasket');
	
	var shipments = currentBasket ? currentBasket.getShipments() : null;
	
	if( !shipments ) return [];
	
	return helper.map(shipments, function(shipment){
		return ShippingModel.getShippingModel(shipment);
	});
};

/**
 * Plain JS object that represents a DW Script API dw.order.ShippingMethod object
 * @param {dw.order.Basket} currentBasket
 * @returns {dw.util.ArrayList} an array of ShippingModels
 */
ShippingModel.getShippingModel = function(shipment){
	helper.assertRequiredParameter(shipment, 'shipment');

	// If we have an instance hash in module static, here is where we would retrieve it
	return new ShippingModel(shipment);
};


// Private (module) static model functions

/**
 * Plain JS object that represents a DW Script API dw.order.ShippingMethod object
 * @param {dw.order.Basket} currentBasket
 * @returns {dw.util.ArrayList} an array of ShippingModels
 */
function getApplicableShippingMethods(shipment, address){
	helper.assertRequiredParameter(shipment, 'shipment');
	
	var shipmentShippingModel = ShippingMgr.getShipmentShippingModel(shipment);
    var shippingMethods;
    if( address ){
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
 * @param {dw.order.Shipment} shipment
 * @returns {ProductLineItemsModel} an array of ShippingModels
 */
function getProductLineItemsModel(shipment){
	helper.assertRequiredParameter(shipment, 'shipment');

	// TODO: Implement ProductLineItemsModel.getProductLineItemsModel in other file ...
	return new ProductLineItemsModel(shipment);
}

function getSelectedShippingMethod(shipment){
	helper.assertRequiredParameter(shipment, 'shipment');

	var method = shipment.getShippingMethod();
	
	return method ? ShippingMethodModel.getShippingMethodModel(method, shipment) : null;
}

/**
 * Sets the shipping method of the basket's default shipment
 * @param {dw.order.Shipment} shipment - Any shipment for the current basket
 * @param {string} shippingMethodID - The shipping method ID of the desired shipping method
 * @param {string} shippingMethods - List of applicable shipping methods of the current basket
 * @param {Object} address - the address
 * @return {void}
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
 * @param shipment
 */
function ensureShipmentHasMethod(shipment) {
	helper.assertRequiredParameter(shipment, 'shipment');

	var shippingMethod = shipment.shippingMethod;
	if( !shippingMethod ){
		var applicableMethods = ShippingMgr.getShipmentShippingModel(shipment).applicableShippingMethods,
			defaultMethod = ShippingMgr.getDefaultShippingMethod();
		
		if( !defaultMethod ) {
			// If no defaultMethod set, just use the first one
			shippingMethod = applicableMethods[0];
		} else {
			// Look for defaultMethod in applicableMethods
			shippingMethod = helper.find(applicableMethods, function(method){
				return method.ID===defaultMethod.ID;
			});
			// If found, use it.  Otherwise return the first one
			shippingMethod = shippingMethod || applicableMethods[0];
		}
		
		shipment.setShippingMethod(shippingMethod);
	}
}
		
function getShipmentByUUID(basket, uuid) {
	helper.assertRequiredParameter(basket, 'basket');
	helper.assertRequiredParameter(uuid, 'uuid');

	var shipment, aShipment;
	
	for( var i=0, ii=basket.shipments.length; i<ii; i++ ){
		aShipment = basket.shipments[i];
		if( aShipment.UUID == uuid ){
			shipment = aShipment;
			break;
		}
	}
	
	return shipment;
}

ShippingModel.getApplicableShippingMethod = getApplicableShippingMethods;
ShippingModel.getProductLineItemsModel = getProductLineItemsModel;
ShippingModel.getSelectedShippingMethod = getSelectedShippingMethod;
ShippingModel.selectShippingMethod = selectShippingMethod;
ShippingModel.ensureShipmentHasMethod = ensureShipmentHasMethod;
ShippingModel.getShipmentByUUID = getShipmentByUUID;

module.exports = ShippingModel;
