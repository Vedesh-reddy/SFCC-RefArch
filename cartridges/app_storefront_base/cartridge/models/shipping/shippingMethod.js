'use strict';

var helper = require('~/cartridge/scripts/dwHelpers');
var formatCurrency = require('~/cartridge/scripts/util/formatting').formatCurrency;

var ShippingMgr = require('dw/order/ShippingMgr');


/**
 * Plain JS object that represents a DW Script API dw.order.ShippingMethod object
 * @param {dw.order.ShippingMethod} shippingMethod - the default shipment of the current basket
 * @param {dw.order.Shipment} [shipment] - a Shipment
 * @returns {Object} object containing information about the selected shipping method
 */
function ShippingMethodModel(shippingMethod, shipment){
	helper.assertRequiredParameter(shipment, 'shippingMethod');
	
	this.ID = shippingMethod.ID;
	this.displayName = shippingMethod.displayName;
	this.description = shippingMethod.description;
	this.estimatedArrivalTime = shippingMethod.custom.estimatedArrivalTime;
	this.isDefault = shippingMethod.defaultMethod;
	
	// Mix in dynamically transformed properties
	if( shipment ){
		// Optional model information available with 'shipment' parameter
		this.shippingCost = getShippingCost(shippingMethod, shipment);
		this.isSelected = getIsSelected(shippingMethod, shipment);
	}
}


// Public (class) static model functions

/**
 * Returns a new ShippingMethodModel object
 * @param {dw.order.ShippingMethod} shippingMethod - the default shipment of the current basket
 * @param {dw.order.Shipment} [shipment] - a Shipment
 * @returns {Object} object containing information about the selected shipping method
 */
ShippingMethodModel.getShippingMethodModel = function(shippingMethod, shipment){
	return new ShippingMethodModel(shippingMethod, shipment);
};

/**
 * Returns an ArrayList-compatible collection of ShippingMethodModel object
 * @param {dw.order.ShippingMethod} shippingMethod - the default shipment of the current basket
 * @param {dw.order.Shipment} [shipment] - a Shipment
 * @returns {Object} object containing information about the selected shipping method
 */
ShippingMethodModel.getShippingMethodModels = function(shippingMethods, shipment){
	return helper.map(shippingMethods, function(shippingMethod){
		return new ShippingMethodModel(shippingMethod, shipment);
	})
};


// Private (module) static model functions

/**
 * Returns shippingCost property for a specific Shipment / ShippingMethod pair
 * @param {dw.order.ShippingMethod} shippingMethod - the default shipment of the current basket
 * @param {dw.order.Shipment} shipment - a shipment of the current basket
 * @returns {String} String representation of Shipping Cost
 */
function getShippingCost(shippingMethod, shipment) {
	helper.assertRequiredParameter(shipment, 'shipment');
	helper.assertRequiredParameter(shipment, 'shippingMethod');
	
	var shipmentShippingModel = ShippingMgr.getShipmentShippingModel(shipment),
		shippingCost = shipmentShippingModel.getShippingCost(shippingMethod);	

	return formatCurrency(shippingCost.amount.value, shippingCost.amount.currencyCode);		
}

/**
 * Returns isSelected property for a specific Shipment / ShippingMethod pair
 * @param {dw.order.ShippingMethod} shippingMethod - the default shipment of the current basket
 * @param {dw.order.Shipment} shipment - a shipment of the current basket
 * @returns {boolean} true is shippingMethod is selected in Shipment
 */
function getIsSelected(shippingMethod, shipment) {
	helper.assertRequiredParameter(shipment, 'shipment');
	helper.assertRequiredParameter(shipment, 'shippingMethod');
	
	var selectedShippingMethod = shipment.shippingMethod || ShippingMgr.getDefaultShippingMethod(),
		selectedShippingMethodID = selectedShippingMethod ? selectedShippingMethod.ID : null;
	
	return (selectedShippingMethodID && shippingMethod.ID==selectedShippingMethodID);
}

ShippingMethodModel.getShippingCost = getShippingCost;
ShippingMethodModel.getIsSelected = getIsSelected;

module.exports = ShippingMethodModel;