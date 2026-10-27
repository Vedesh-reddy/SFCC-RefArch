'use strict';

var base = module.superModule;

/**
 * Offer lines are checked against the seller's offer and inventory list; the base check
 * reads the site inventory list, which does not hold seller stock for first-party products.
 * First-party lines keep the base checks, repeated here per line because the base helper
 * only accepts a whole basket.
 * @param {dw.order.Basket} basket - basket
 * @returns {{error: boolean, hasInventory: boolean}} result in the base shape
 */
function validateProducts(basket) {
    var hasOfferLines = basket.productLineItems.toArray().some(function (pli) { return !!pli.custom.mktOfferId; });
    var marketplace = require('*/cartridge/scripts/helpers/offerHelpers').validateOfferLines(basket);
    if (!hasOfferLines) {
        var result = base.validateProducts(basket);
        if (marketplace.error) result.error = true;
        return result;
    }
    var ProductInventoryMgr = require('dw/catalog/ProductInventoryMgr');
    var StoreMgr = require('dw/catalog/StoreMgr');
    var outcome = { error: false, hasInventory: true };
    marketplace.problems.forEach(function (problem) {
        if (problem.reason === 'insufficient-stock') {
            outcome.hasInventory = false;
        } else {
            outcome.error = true;
        }
    });
    basket.productLineItems.toArray().forEach(function (item) {
        if (item.custom.mktOfferId) return;
        if (item.product === null || !item.product.online) {
            outcome.error = true;
            return;
        }
        if (item.custom.fromStoreId) {
            var store = StoreMgr.getStore(item.custom.fromStoreId);
            var record = ProductInventoryMgr.getInventoryList(store.custom.inventoryListId).getRecord(item.productID);
            outcome.hasInventory = outcome.hasInventory && !!record && record.ATS.value >= item.quantityValue;
        } else {
            outcome.hasInventory = outcome.hasInventory && item.product.availabilityModel.getAvailabilityLevels(item.quantityValue).notAvailable.value === 0;
        }
    });
    return outcome;
}

module.exports = Object.assign({}, base, {
    validateProducts: validateProducts
});
