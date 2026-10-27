'use strict';

/**
 * Shipping-threshold advisor for the cart: "You are $50 away from free shipping", with
 * products priced near the gap, accessories of the basket items and the promotion.
 *
 * The distance comes from the platform's approaching-discount calculation for the active
 * shipping promotions (DiscountPlan.getApproachingShippingDiscounts), so there is no second
 * threshold to keep in sync. It is based on merchandise only: a wallet top-up is not a basket
 * line and can never close the gap.
 */

var URLUtils = require('dw/web/URLUtils');
var walletHelpers = require('*/cartridge/scripts/helpers/walletHelpers');

/**
 * @param {dw.catalog.Product} product - product
 * @returns {?Object} {id, name, priceCents, url, imageUrl, imageAlt} for an orderable product with a price
 */
function getProductCard(product) {
    if (!product || !product.online || !product.availabilityModel.orderable) return null;
    var price = product.priceModel.price;
    if (!price || !price.available) return null;
    var image = product.getImage('small', 0);
    return {
        id: product.ID,
        name: product.name,
        priceCents: walletHelpers.centsOf(price),
        url: URLUtils.url('Product-Show', 'pid', product.ID).toString(),
        imageUrl: image ? image.getURL().toString() : null,
        imageAlt: image ? image.alt : product.name
    };
}

/**
 * @param {number} minCents - lower price bound
 * @param {number} maxCents - upper price bound
 * @param {string[]} exclude - product IDs already in the basket
 * @param {number} limit - maximum results
 * @returns {Object[]} orderable products in the price band
 */
function getProductsNearPrice(minCents, maxCents, exclude, limit) {
    var ProductSearchModel = require('dw/catalog/ProductSearchModel');
    var search = new ProductSearchModel();
    search.setCategoryID(walletHelpers.getPreference('walletAdvisorCategoryId'));
    search.setPriceMin(minCents / 100);
    search.setPriceMax(maxCents / 100);
    search.setOrderableProductsOnly(true);
    search.search();
    var results = [];
    var hits = search.getProductSearchHits();
    while (hits.hasNext() && results.length < limit) {
        var product = hits.next().product;
        var item = exclude.indexOf(product.ID) < 0 ? getProductCard(product) : null;
        if (item) results.push(item);
    }
    return results;
}

/**
 * @param {dw.order.Basket} basket - basket
 * @param {number} limit - maximum results
 * @returns {Object[]} recommended accessories of the basket products
 */
function getAccessories(basket, limit) {
    var inBasket = basket.productLineItems.toArray().map(function (pli) { return pli.productID; });
    var results = [];
    basket.productLineItems.toArray().forEach(function (pli) {
        if (!pli.product || results.length >= limit) return;
        pli.product.getRecommendations().toArray().forEach(function (rec) {
            var id = rec.recommendedItem.ID;
            var item = results.length < limit && inBasket.indexOf(id) < 0 && !results.some(function (r) { return r.id === id; }) ? getProductCard(rec.recommendedItem) : null;
            if (item) results.push(item);
        });
    });
    return results;
}

/**
 * @param {Object[]} approaching - {distanceCents, thresholdCents, promotionId, promotionName, calloutMsg}
 * @returns {?Object} the closest approaching shipping discount
 */
function getClosestDiscount(approaching) {
    var candidates = approaching.filter(function (a) { return a.distanceCents > 0; });
    candidates.sort(function (a, b) { return a.distanceCents - b.distanceCents; });
    return candidates[0] || null;
}

/**
 * @param {dw.order.Basket} basket - current basket
 * @returns {?Object} advice, or null when no shipping promotion is approaching
 */
function getAdvice(basket) {
    if (!walletHelpers.isWalletEnabled() || walletHelpers.getPreference('walletAdvisorEnabled') === false || !basket || !basket.defaultShipment) return null;
    var plan = require('dw/campaign/PromotionMgr').getDiscounts(basket);
    var approaching = plan.getApproachingShippingDiscounts(basket.defaultShipment).toArray().map(function (a) {
        var promotion = a.discount && a.discount.promotion;
        return {
            distanceCents: walletHelpers.centsOf(a.distanceFromConditionThreshold),
            thresholdCents: walletHelpers.centsOf(a.conditionThreshold),
            promotionId: promotion ? promotion.ID : null,
            promotionName: promotion ? promotion.name : null,
            calloutMsg: promotion && promotion.calloutMsg ? String(promotion.calloutMsg) : null
        };
    });
    var target = getClosestDiscount(approaching);
    if (!target) return null;
    var limit = walletHelpers.getPreference('walletAdvisorMaxSuggestions');
    var band = Math.round((target.distanceCents * walletHelpers.getPreference('walletAdvisorPriceBandPercent')) / 100);
    var inBasket = basket.productLineItems.toArray().map(function (pli) { return pli.productID; });
    return {
        distanceCents: target.distanceCents,
        thresholdCents: target.thresholdCents,
        promotionName: target.promotionName,
        calloutMsg: target.calloutMsg,
        nearPrice: getProductsNearPrice(target.distanceCents, target.distanceCents + band, inBasket, limit),
        accessories: getAccessories(basket, limit),
        browseUrl: URLUtils.url('Search-Show', 'cgid', walletHelpers.getPreference('walletAdvisorCategoryId'),
            'pmin', (target.distanceCents / 100).toFixed(2), 'pmax', ((target.distanceCents + band) / 100).toFixed(2)).toString()
    };
}

module.exports = {
    getClosestDiscount: getClosestDiscount,
    getAdvice: getAdvice
};
