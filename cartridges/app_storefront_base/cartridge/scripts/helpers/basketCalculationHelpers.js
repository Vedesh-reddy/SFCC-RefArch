'use strict';

var HookMgr = require('dw/system/HookMgr');

/**
 * Calculate sales taxes
 * @param {dw.order.Basket} basket - current basket
 * @returns {Object} - object describing taxes that needs to be applied
 */
function calculateTaxes(basket) {
    return HookMgr.callHook('app.basket.taxes', 'calculateTaxes', basket);
}

/**
 * Calculate all totals as well as shipping and taxes
 * @param {dw.order.Basket} basket - current basket
 */
function calculateTotals(basket) {
    HookMgr.callHook('dw.order.calculate', 'calculate', basket);
}

module.exports = {
    calculateTotals: calculateTotals,
    calculateTaxes: calculateTaxes
};
