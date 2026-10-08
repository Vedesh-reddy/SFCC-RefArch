'use strict';

/**
 * Applies active price locks before the base calculation. Lock adjustments are
 * custom price adjustments, which promotion calculation leaves in place.
 */

var base = module.superModule;
var priceLock = require('*/cartridge/scripts/priceLock');

/**
 * @param {dw.order.Basket} basket - Current basket
 */
function calculateTotals(basket) {
    priceLock.syncBasket(basket);
    base.calculateTotals(basket);
}

module.exports = Object.assign({}, base, {
    calculateTotals: calculateTotals
});
