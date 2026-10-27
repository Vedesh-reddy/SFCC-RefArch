'use strict';

var base = module.superModule;

/**
 * Order views (confirmation, order details) name the seller of an offer line, as the cart does.
 * @param {Object} product - model being built
 * @param {dw.catalog.Product} apiProduct - product
 * @param {Object} options - factory options (options.lineItem is the order line)
 * @returns {Object} decorated model
 */
module.exports = function orderLineItem(product, apiProduct, options) {
    base(product, apiProduct, options);
    var pli = options.lineItem;
    if (!pli || !pli.custom.mktOfferId) return product;
    var seller = require('dw/object/CustomObjectMgr').getCustomObject('MarketplaceSeller', pli.custom.mktSellerId);
    product.marketplace = { offerId: pli.custom.mktOfferId, sellerId: pli.custom.mktSellerId, sellerName: seller ? seller.custom.displayName : pli.custom.mktSellerId }; // eslint-disable-line no-param-reassign
    return product;
};
