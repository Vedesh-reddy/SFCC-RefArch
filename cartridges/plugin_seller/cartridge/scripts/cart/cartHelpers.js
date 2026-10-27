'use strict';

var base = module.superModule;

/**
 * Offer lines use the seller's inventory list, which the base helper (site inventory) cannot
 * see. Everything else is the base implementation.
 * @param {dw.order.Basket} currentBasket - basket
 * @param {string} productId - product
 * @param {number} quantity - units
 * @param {string[]} childProducts - bundle children
 * @param {Array} options - options
 * @returns {Object} result {error, message, uuid}
 */
function addProductToCart(currentBasket, productId, quantity, childProducts, options) {
    var offerHelpers = require('*/cartridge/scripts/helpers/offerHelpers');
    var productHelpers = require('*/cartridge/scripts/helpers/productHelpers');
    var product = require('dw/catalog/ProductMgr').getProduct(productId);
    var optionModel = product ? productHelpers.getCurrentOptionModel(product.optionModel, options) : null;
    var offerId = request.httpParameterMap.get('mktOfferId').stringValue || null;
    var result = offerHelpers.addOfferToBasket(currentBasket, productId, quantity, offerId, base.addLineItem, optionModel);
    return result || base.addProductToCart(currentBasket, productId, quantity, childProducts, options);
}

/**
 * @param {dw.catalog.Product} product - product
 * @param {number} updateQuantity - new quantity
 * @param {dw.order.ProductLineItem} matchingLineItem - line
 * @param {dw.util.Collection} productLineItems - basket lines
 * @returns {boolean} true when the quantity can be set
 */
function checkPliCanBeUpdated(product, updateQuantity, matchingLineItem, productLineItems) {
    if (matchingLineItem && matchingLineItem.custom.mktOfferId) {
        return require('*/cartridge/scripts/helpers/offerHelpers').canChangeQuantity(matchingLineItem, updateQuantity);
    }
    return base.checkPliCanBeUpdated(product, updateQuantity, matchingLineItem, productLineItems);
}

module.exports = Object.assign({}, base, {
    addProductToCart: addProductToCart,
    checkPliCanBeUpdated: checkPliCanBeUpdated
});
