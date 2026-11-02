'use strict';

/**
 * Applies member savings to the basket, and keeps the membership fee itself free of them.
 *
 * Registered on dw.order.calculateTax for the reason plugin_seller is: base calculate.js has
 * finished promotions and shipping by then and taxes come next, so taxes and totals include the
 * savings. Keep this cartridge to the right of plugin_seller, so offer prices are final here.
 * Returns nothing so the base tax hook still runs (also under SCAPI).
 */

var Logger = require('dw/system/Logger');

/**
 * @param {dw.order.LineItemCtnr} ctnr - basket being calculated
 */
exports.calculateTax = function (ctnr) {
    if (!(ctnr instanceof require('dw/order/Basket'))) return;
    var benefitHelpers = require('*/cartridge/scripts/helpers/membershipBenefitHelpers');
    if (benefitHelpers.isFeeContainer(ctnr)) {
        benefitHelpers.clearFeeBasket(ctnr);
        return;
    }
    try {
        benefitHelpers.applyMembershipSavings(ctnr);
    } catch (e) {
        // No discount is the safe failure. It must not stop a shopper from checking out at list price.
        Logger.getLogger('prime-membership', 'membership-benefit').error('Member savings not applied: {0}', e.errorCode || e.message);
        benefitHelpers.removeAdjustments(ctnr);
    }
};
