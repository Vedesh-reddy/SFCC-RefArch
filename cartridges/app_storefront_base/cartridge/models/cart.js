'use strict';

var URLUtils = require('dw/web/URLUtils');
var Resource = require('dw/web/Resource');
var ShippingMgr = require('dw/order/ShippingMgr');

var TotalsModel = require('~/cartridge/models/totals');
var ProductLineItemsModel = require('~/cartridge/models/productLineItems');
var ShippingModel = require('~/cartridge/models/shipping');

var helper = require('~/cartridge/scripts/dwHelpers');


/**
 * Generates an object of URLs
 * @returns {Object} an object of URLs in string format
 */
function getCartActionUrls() {
    return {
        removeProductLineItemUrl: URLUtils.url('Cart-RemoveProductLineItem').toString(),
        updateQuantityUrl: URLUtils.url('Cart-UpdateQuantity').toString(),
        selectShippingUrl: URLUtils.url('Cart-SelectShippingMethod').toString(),
        submitCouponCodeUrl: URLUtils.url('Cart-AddCoupon').toString(),
        removeCouponLineItem: URLUtils.url('Cart-RemoveCouponLineItem').toString()
    };
}

/**
 * @constructor
 * @classdesc Cart class that represents the current basket
 *
 * @param {dw.order.Basket} basket - Current users's basket
 * @param {Object} shippingModel - Instance of the shipping model
 * @param {Object} productLineItemsModel - Model for a given product line items
 * @param {Object} totalsModel - Model with total costs for the cart
 */
function CartModel(basket, shippingModels, productLineItemsModel, totalsModel) {
    if (basket !== null) {
        this.actionUrls = getCartActionUrls();
        this.numOfShipments = basket.shipments.length;
        this.totals = totalsModel;
        this.shipments = [];

        // TODO: shipments should be deprecated ... just use shippingModels ...
        if (shippingModels) {
        	var shippingModel, shipment;
	        for( var i=0, ii=this.numOfShipments; i<ii; i++ ){
	        	shippingModel = shippingModels[i];
	        	shipment = {};
	        	shipment.shippingMethods = shippingModel.applicableShippingMethods;
	        	shipment.selectedShippingMethod = shippingModel.selectedShippingMethodID;
	        	this.shipments.push(shipment);
	        }
        }
    }

    this.items = productLineItemsModel.items;
    this.numItems = productLineItemsModel.totalQuantity;
    this.resources = {
        numberOfItems: Resource.msgf('label.number.items.in.cart', 'cart', null, this.numItems),
        emptyCartMsg: Resource.msg('info.cart.empty.msg', 'cart', null)
    };
}

/**
 * 
 */
CartModel.getCartModel = function(basket){
	helper.assertRequiredParameter(basket, 'basket');
	
	var shippingModels = ShippingModel.getShippingModels(basket);
	var productLineItemsModel = new ProductLineItemsModel(basket);
	var totalsModel = new TotalsModel(basket);
	
	return new CartModel(basket, shippingModels, productLineItemsModel, totalsModel);
};

/**
 * 
 */
CartModel.ensureAllShipmentsHaveMethods = function(basket) {
	helper.assertRequiredParameter(basket, 'basket');

	var shipments = basket.shipments,
		defaultMethod = ShippingMgr.getDefaultShippingMethod();
	
	helper.forEach(shipments, function(shipment){
		ShippingModel.ensureShipmentHasMethod(shipment);    		
	});
};

module.exports = CartModel;
