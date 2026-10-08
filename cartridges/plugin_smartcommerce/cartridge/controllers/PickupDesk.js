'use strict';

/* global request, session */

/**
 * Business Manager page for store staff: enter the order number and the customer's
 * pickup code before handing over the order. Access is governed by the BM module
 * permission of the "Store Pickup Desk" menu action.
 * @module controllers/PickupDesk
 */

var ISML = require('dw/template/ISML');
var OrderMgr = require('dw/order/OrderMgr');
var CSRFProtection = require('dw/web/CSRFProtection');
var Logger = require('dw/system/Logger');
var storePickup = require('~/cartridge/scripts/storePickup');

var customLogger = Logger.getLogger('smart-commerce', 'pickup-desk');

/**
 * Shows the verification form.
 */
function start() {
    ISML.renderTemplate('smart/bm/pickup-desk', {});
}
start.public = true;

/**
 * Verifies the code and marks the order collected.
 */
function verify() {
    var params = request.httpParameterMap;
    var orderNo = params.orderNo.stringValue || '';
    var result;
    if (request.httpMethod !== 'POST' || !CSRFProtection.validateRequest()) {
        result = 'csrf';
    } else {
        var order = orderNo ? OrderMgr.getOrder(orderNo.trim()) : null;
        result = order ? storePickup.verifyCode(order, params.code.stringValue) : 'not-found';
    }
    customLogger.info('Pickup verification for order {0} by {1}: {2}', orderNo, session.userName, result);
    ISML.renderTemplate('smart/bm/pickup-desk', { orderNo: orderNo, result: result });
}
verify.public = true;

module.exports = {
    Start: start,
    Verify: verify
};
