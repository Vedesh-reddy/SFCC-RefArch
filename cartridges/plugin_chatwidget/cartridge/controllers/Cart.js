'use strict';

/**
 * Journals widget-originated cart actions on the inherited SFRA Cart routes.
 * Storefront behaviour is unchanged; see scripts/helpers/journey#observe.
 * @module controllers/Cart
 */

var server = require('server');
var journey = require('*/cartridge/scripts/helpers/journey');

server.extend(module.superModule);

server.prepend('AddProduct', journey.observe('add_to_cart', function (req) {
    return { entityID: req.form.pid, context: 'quantity=' + (req.form.quantity || '') };
}));
server.prepend('UpdateQuantity', journey.observe('cart_quantity_updated', function (req) {
    return { entityID: req.querystring.pid, context: 'quantity=' + (req.querystring.quantity || '') };
}));
server.prepend('RemoveProductLineItem', journey.observe('cart_item_removed', function (req) {
    return { entityID: req.querystring.pid };
}));
server.prepend('AddCoupon', journey.observe('coupon_added', function (req) {
    return { entityID: req.querystring.couponCode };
}));
server.prepend('RemoveCouponLineItem', journey.observe('coupon_removed', function (req) {
    return { entityID: req.querystring.code };
}));
server.prepend('SelectShippingMethod', journey.observe('shipping_method_selected', function (req) {
    return { entityID: req.querystring.methodID || req.form.methodID };
}));

module.exports = server.exports();
