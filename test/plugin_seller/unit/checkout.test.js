'use strict';

var assert = require('chai').assert;
var harness = require('./harness');
var fixtures = require('./fixtures');

/**
 * @param {Object} h - harness
 * @param {Object} fields - line fields
 * @returns {Object} product line item double
 */
function line(h, fields) {
    var pli = Object.assign({
        UUID: 'L' + Math.random().toString(16).slice(2, 8),
        custom: {},
        bonusProductLineItem: false,
        optionProductLineItem: false,
        quantityValue: 1,
        productInventoryListID: null,
        shipment: { standardShippingLineItem: { taxClassID: 'shipping' } },
        shippingLines: []
    }, fields);
    pli.product = h.state.products[pli.productID] || null;
    pli.quantity = { value: pli.quantityValue };
    pli.basePrice = new h.Money(fields.catalogCents / 100, 'USD');
    pli.adjustedPrice = new h.Money((fields.catalogCents * pli.quantityValue) / 100, 'USD');
    pli.setPriceValue = function (value) {
        pli.basePrice = new h.Money(value, 'USD');
        pli.adjustedPrice = new h.Money(value * pli.quantityValue, 'USD');
    };
    pli.setProductInventoryListID = function (id) { pli.productInventoryListID = id; };
    pli.createShippingLineItem = function () {
        var s = { setQuantity: function (q) { s.quantity = q; }, setPriceValue: function (v) { s.price = v; }, setSurcharge: function (f) { s.surcharge = f; }, setTaxClassID: function (t) { s.taxClassID = t; } };
        pli.shippingLines.push(s);
        return s;
    };
    return pli;
}

/**
 * @param {Object} h - harness
 * @param {Object[]} lines - lines
 * @returns {Object} basket double (instance of the Basket mock)
 */
function basket(h, lines) {
    var b = Object.create(h.Basket.prototype);
    var collection = { toArray: function () { return lines; } };
    b.getAllProductLineItems = function () { return collection; };
    b.productLineItems = collection;
    lines.forEach(function (l) { l.lineItemCtnr = b; });
    return b;
}

describe('plugin_seller checkout', function () {
    var h;
    var offerHelpers;
    beforeEach(function () {
        h = harness({ preferences: { sellerOfferApprovalRequired: false, sellerShippingFeesEnabled: true } });
        fixtures.product(h, 'P1', { bookPriceCents: 12000 });
        fixtures.product(h, 'OWNED', { custom: { mktOwnerSellerId: 'SELLERA' } });
        fixtures.approvedSeller(h, 'SELLERA', 'C1', { settings: JSON.stringify({ shippingFeeCents: 500, freeShippingOverCents: 30000 }) });
        offerHelpers = h.require('scripts/helpers/offerHelpers');
        offerHelpers.createOffer(fixtures.context(h, 'C1', 'catalog.write'), 'P1', { price: '115', quantity: '5', sellerSku: 'SKU-1' });
        h.state.inventory['marketplace-sellera'] = { P1: 5 };
        // Registered by app_storefront_base in a real cartridge path.
        h.state.hooks['dw.order.calculateShipping'] = { calculateShipping: function () { h.state.shippingCalculated = true; } };
    });

    it('charges the offer price from the offer record and re-applies promotions', function () {
        var pli = line(h, { productID: 'P1', catalogCents: 12000, custom: { mktOfferId: 'SELLERA:P1', mktSellerId: 'SELLERA' } });
        h.require('scripts/hooks/offerPricing').calculateTax(basket(h, [pli]));
        assert.equal(pli.basePrice.value, 115);
        assert.equal(pli.custom.mktUnitPriceCents, 11500);
        assert.isTrue(pli.custom.mktOfferValid);
        assert.isTrue(h.state.shippingCalculated);
        assert.isAbove(h.state.discounts, 0);
    });

    it('adds the seller shipping fee per item below the seller free-shipping amount', function () {
        var pli = line(h, { productID: 'P1', catalogCents: 12000, quantityValue: 2, custom: { mktOfferId: 'SELLERA:P1', mktSellerId: 'SELLERA' } });
        h.require('scripts/hooks/offerPricing').calculateTax(basket(h, [pli]));
        assert.lengthOf(pli.shippingLines, 1);
        assert.equal(pli.shippingLines[0].price, 5);
        assert.isTrue(pli.shippingLines[0].surcharge);
        assert.equal(pli.custom.mktShippingFeeCents, 1000);
    });

    it('leaves lines of a suspended offer at catalog price and marks them invalid', function () {
        h.get('MarketplaceOffer', 'SELLERA:P1').custom.status = 'SUSPENDED';
        var pli = line(h, { productID: 'P1', catalogCents: 12000, custom: { mktOfferId: 'SELLERA:P1', mktSellerId: 'SELLERA' } });
        h.require('scripts/hooks/offerPricing').calculateTax(basket(h, [pli]));
        assert.equal(pli.basePrice.value, 120);
        assert.isFalse(pli.custom.mktOfferValid);
    });

    it('ignores orders: prices are only applied to baskets', function () {
        var pli = line(h, { productID: 'P1', catalogCents: 12000, custom: { mktOfferId: 'SELLERA:P1', mktSellerId: 'SELLERA' } });
        h.require('scripts/hooks/offerPricing').calculateTax({ getAllProductLineItems: function () { return { toArray: function () { return [pli]; } }; } });
        assert.equal(pli.basePrice.value, 120);
    });

    it('adds an offer line bound to the seller inventory list, refusing a second seller for the same product', function () {
        var lines = [];
        var b = basket(h, lines);
        b.defaultShipment = {};
        var addLine = {
            addLineItem: function (bk, product, quantity) {
                var pli = line(h, { productID: product.ID, catalogCents: 12000, quantityValue: quantity });
                pli.setQuantityValue = function (q) { pli.quantityValue = q; };
                lines.push(pli);
                return pli;
            },
            getOptionModel: function () { return null; }
        };
        var result = offerHelpers.addOfferToBasket(b, 'P1', 2, 'SELLERA:P1', addLine.addLineItem, null);
        assert.isFalse(result.error);
        assert.equal(lines[0].custom.mktSellerId, 'SELLERA');
        assert.equal(lines[0].productInventoryListID, 'marketplace-sellera');
        assert.isTrue(offerHelpers.addOfferToBasket(b, 'P1', 4, 'SELLERA:P1', addLine.addLineItem, null).error);
        assert.isTrue(offerHelpers.addOfferToBasket(b, 'P1', 1, 'SELLERB:P1', addLine.addLineItem, null).error);
    });

    it('leaves first-party lines to the base helper and requires an offer for seller-owned products', function () {
        var b = basket(h, []);
        assert.isNull(offerHelpers.addOfferToBasket(b, 'P1', 1, null, function () { throw new Error('not called'); }, null));
        assert.isTrue(offerHelpers.addOfferToBasket(b, 'OWNED', 1, null, function () { throw new Error('not called'); }, null).error);
    });

    it('blocks checkout when the price changed since the last calculation, or a seller-owned line has no offer', function () {
        var pli = line(h, { productID: 'P1', catalogCents: 12000, custom: { mktOfferId: 'SELLERA:P1', mktSellerId: 'SELLERA', mktOfferValid: true, mktUnitPriceCents: 11500 }, productInventoryListID: 'marketplace-sellera' });
        assert.isFalse(offerHelpers.validateOfferLines(basket(h, [pli])).error);
        h.get('MarketplaceOffer', 'SELLERA:P1').custom.priceCents = 9900;
        assert.equal(offerHelpers.validateOfferLines(basket(h, [pli])).problems[0].reason, 'offer-changed');
        var owned = line(h, { productID: 'OWNED', catalogCents: 1000 });
        assert.equal(offerHelpers.validateOfferLines(basket(h, [owned])).problems[0].reason, 'offer-unavailable');
    });

    it('counts all lines of one offer against the seller stock', function () {
        var a = line(h, { productID: 'P1', catalogCents: 12000, quantityValue: 3, custom: { mktOfferId: 'SELLERA:P1', mktSellerId: 'SELLERA', mktOfferValid: true, mktUnitPriceCents: 11500 }, productInventoryListID: 'marketplace-sellera' });
        var b = line(h, { productID: 'P1', catalogCents: 12000, quantityValue: 3, custom: { mktOfferId: 'SELLERA:P1', mktSellerId: 'SELLERA', mktOfferValid: true, mktUnitPriceCents: 11500 }, productInventoryListID: 'marketplace-sellera' });
        assert.equal(offerHelpers.validateOfferLines(basket(h, [a, b])).problems[0].reason, 'insufficient-stock');
    });
});
