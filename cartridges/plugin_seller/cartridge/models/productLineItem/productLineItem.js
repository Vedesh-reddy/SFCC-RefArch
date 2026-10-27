'use strict';

var base = module.superModule;

/**
 * Offer lines show the seller, the offer's unit price and the seller's availability instead
 * of the catalog price and site availability.
 * @param {Object} product - model being built
 * @param {dw.catalog.Product} apiProduct - product
 * @param {Object} options - factory options (options.lineItem is the basket line)
 * @returns {Object} decorated model
 */
module.exports = function productLineItem(product, apiProduct, options) {
    base(product, apiProduct, options);
    var pli = options.lineItem;
    if (!pli || !pli.custom.mktOfferId) return product;
    var Resource = require('dw/web/Resource');
    var Money = require('dw/value/Money');
    var DefaultPrice = require('*/cartridge/models/price/default');
    var seller = require('dw/object/CustomObjectMgr').getCustomObject('MarketplaceSeller', pli.custom.mktSellerId);
    var available = require('*/cartridge/scripts/helpers/offerHelpers').canChangeQuantity(pli, pli.quantityValue);
    // base decorators define price and availability read-only, so offer lines return a copy;
    // the product factory uses the returned model
    var model = {};
    Object.keys(product).forEach(function (key) { model[key] = product[key]; });
    if (pli.custom.mktUnitPriceCents) model.price = new DefaultPrice(new Money(pli.custom.mktUnitPriceCents / 100, 'USD'));
    model.available = available;
    model.availability = { messages: [available ? Resource.msg('label.instock', 'common', null) : Resource.msg('error.offer.offer-unavailable', 'seller', null)], inStockDate: null };
    model.marketplace = { offerId: pli.custom.mktOfferId, sellerId: pli.custom.mktSellerId, sellerName: seller ? seller.custom.displayName : pli.custom.mktSellerId };
    return model;
};
