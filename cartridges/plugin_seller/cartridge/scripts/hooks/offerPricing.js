'use strict';

/**
 * Applies seller offer prices and seller shipping fees to a basket.
 *
 * Registered on dw.order.calculateTax because base calculate.js resets every line to its
 * price-book price right before it calls calculateTax, and hooks for one extension point
 * run in cartridge-path order: this runs after that reset and before the base tax
 * implementation, so taxes and totals are computed on the offer price. Promotions are
 * re-applied when a price changed, so discounts are based on the price actually charged.
 * Prices always come from the offer record, never from the request. Returns nothing so
 * the base tax hook still runs (also under SCAPI).
 */

var HookMgr = require('dw/system/HookMgr');
var PromotionMgr = require('dw/campaign/PromotionMgr');
var Logger = require('dw/system/Logger');

var log = Logger.getLogger('plugin-seller', 'seller-marketplace');

/**
 * @param {dw.order.LineItemCtnr} ctnr - basket or order
 * @returns {dw.order.ProductLineItem[]} plain offer lines (no bonus or option lines)
 */
function offerLines(ctnr) {
    return ctnr.getAllProductLineItems().toArray().filter(function (pli) {
        return pli.custom.mktOfferId && !pli.bonusProductLineItem && !pli.optionProductLineItem && pli.product;
    });
}

/**
 * @param {dw.order.ProductLineItem[]} lines - offer lines
 * @returns {boolean} true when at least one line price changed
 */
function applyPrices(lines) {
    var CustomObjectMgr = require('dw/object/CustomObjectMgr');
    var marketplaceHelpers = require('*/cartridge/scripts/helpers/marketplaceHelpers');
    var changed = false;
    lines.forEach(function (pli) {
        var offer = CustomObjectMgr.getCustomObject('MarketplaceOffer', pli.custom.mktOfferId);
        if (!offer || offer.custom.productId !== pli.productID || offer.custom.status !== 'ACTIVE') {
            // Checkout validation rejects the line; until then it keeps the catalog price.
            pli.custom.mktOfferValid = false; // eslint-disable-line no-param-reassign
            return;
        }
        var cents = offer.custom.priceCents;
        pli.custom.mktOfferValid = true; // eslint-disable-line no-param-reassign
        pli.custom.mktUnitPriceCents = cents; // eslint-disable-line no-param-reassign
        if (marketplaceHelpers.centsOf(pli.basePrice) !== cents) {
            pli.setPriceValue(cents / 100);
            changed = true;
        }
    });
    return changed;
}

/**
 * Per-item seller shipping fees as product shipping line items, waived per seller once
 * that seller's lines reach the seller's free-shipping amount.
 * @param {dw.order.ProductLineItem[]} lines - offer lines
 * @returns {boolean} true when at least one fee line was added
 */
function applyShippingFees(lines) {
    if (require('dw/system/Site').getCurrent().getCustomPreferenceValue('sellerShippingFeesEnabled') !== true) return false;
    var added = false;
    var CustomObjectMgr = require('dw/object/CustomObjectMgr');
    var marketplaceHelpers = require('*/cartridge/scripts/helpers/marketplaceHelpers');
    var sellerHelpers = require('*/cartridge/scripts/helpers/sellerHelpers');
    var TaxMgr = require('dw/order/TaxMgr');
    var bySeller = {};
    lines.forEach(function (pli) {
        if (!pli.custom.mktOfferValid) return;
        var id = pli.custom.mktSellerId;
        if (!bySeller[id]) bySeller[id] = { lines: [], subtotal: 0 };
        bySeller[id].lines.push(pli);
        bySeller[id].subtotal += marketplaceHelpers.centsOf(pli.adjustedPrice);
    });
    Object.keys(bySeller).forEach(function (sellerId) {
        var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', sellerId);
        var terms = seller ? sellerHelpers.getSellerTerms(seller) : null;
        var group = bySeller[sellerId];
        var waived = !terms || terms.shippingFeeCents <= 0
            || (terms.freeShippingOverCents !== null && group.subtotal >= terms.freeShippingOverCents);
        group.lines.forEach(function (pli) {
            if (waived) {
                pli.custom.mktShippingFeeCents = 0; // eslint-disable-line no-param-reassign
                return;
            }
            var shippingLine = pli.createShippingLineItem();
            shippingLine.setQuantity(pli.quantity);
            shippingLine.setPriceValue(terms.shippingFeeCents / 100);
            shippingLine.setSurcharge(true);
            var standard = pli.shipment ? pli.shipment.standardShippingLineItem : null;
            shippingLine.setTaxClassID(standard && standard.taxClassID ? standard.taxClassID : TaxMgr.defaultTaxClassID);
            pli.custom.mktShippingFeeCents = terms.shippingFeeCents * pli.quantityValue; // eslint-disable-line no-param-reassign
            added = true;
        });
    });
    return added;
}

/**
 * @param {dw.order.LineItemCtnr} ctnr - basket being calculated
 */
exports.calculateTax = function (ctnr) {
    if (!(ctnr instanceof require('dw/order/Basket'))) return;
    var lines = offerLines(ctnr);
    if (!lines.length) return;
    try {
        var repriced = applyPrices(lines);
        if (repriced) {
            PromotionMgr.applyDiscounts(ctnr);
            HookMgr.callHook('dw.order.calculateShipping', 'calculateShipping', ctnr);
        }
        if (applyShippingFees(lines) || repriced) PromotionMgr.applyDiscounts(ctnr);
    } catch (e) {
        // Leaving lines at catalog prices is safe: checkout validation refuses invalid offer lines.
        log.error('Offer pricing failed for basket: {0}', e.message);
        lines.forEach(function (pli) { pli.custom.mktOfferValid = false; }); // eslint-disable-line no-param-reassign
    }
};
