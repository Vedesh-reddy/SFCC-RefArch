'use strict';

/**
 * Same rules for OCAPI and SCAPI shoppers: dw.order.calculateTax already covers the savings, these
 * cover product access and the reservation of an order's savings.
 */

var Status = require('dw/system/Status');

/**
 * @param {dw.order.Basket} basket - basket
 * @param {Object[]} items - items being added
 * @returns {?dw.system.Status} an error status when the shopper may not buy one of them; nothing otherwise, so other hooks run
 */
exports.beforePOST = function (basket, items) {
    var accessHelpers = require('*/cartridge/scripts/helpers/membershipAccessHelpers');
    var customerNo = basket && basket.customer && basket.customer.authenticated ? basket.customerNo : null;
    var list = Array.prototype.slice.call(items || []);
    var blocked = list.some(function (item) { return !accessHelpers.checkProductIdAccess(customerNo, item.productId).allowed; });
    return blocked ? new Status(Status.ERROR, 'prime-membership-access', 'This product is not available to this shopper yet') : undefined;
};

/**
 * @param {dw.order.Order} order - order just created
 * @returns {?dw.system.Status} an error status when the savings are no longer allowed; nothing otherwise, so other hooks run
 */
exports.afterPOST = function (order) {
    var benefitHelpers = require('*/cartridge/scripts/helpers/membershipBenefitHelpers');
    return benefitHelpers.reserveOrderBenefits(order) ? undefined : new Status(Status.ERROR, 'prime-membership-cap', 'Member savings are no longer available');
};
