'use strict';

var assert = require('chai').assert;
var fs = require('fs');
var os = require('os');
var path = require('path');
var childProcess = require('child_process');
var harness = require('./harness');
var fixtures = require('./fixtures');

/**
 * Validates XML against a platform XSD with xmllint, when the XSD is available locally.
 * @param {string} xml - document
 * @param {string} schema - XSD name (catalog, pricebook, inventory)
 * @returns {?string} null when valid or skipped, else the xmllint message
 */
function xsdError(xml, schema) {
    var xsd = process.env.SFCC_XSD_DIR ? path.join(process.env.SFCC_XSD_DIR, schema + '.xsd') : null;
    if (!xsd || !fs.existsSync(xsd)) return null;
    var file = path.join(os.tmpdir(), 'plugin-seller-' + schema + '-' + process.pid + '.xml');
    fs.writeFileSync(file, xml);
    try {
        childProcess.execFileSync('xmllint', ['--noout', '--schema', xsd, file], { stdio: 'pipe' });
        return null;
    } catch (e) {
        return String(e.stderr);
    } finally {
        fs.unlinkSync(file);
    }
}

var IMAGE = JSON.stringify([{ path: 'images/x.png', type: 'image/png', extension: 'png' }]);

describe('plugin_seller catalog', function () {
    describe('quality checks', function () {
        it('validates GTIN check digits', function () {
            var offerHelpers = harness().require('scripts/helpers/offerHelpers');
            assert.isTrue(offerHelpers.isValidGtin('036000291452'));
            assert.isTrue(offerHelpers.isValidGtin('4006381333931'));
            assert.isFalse(offerHelpers.isValidGtin('036000291453'));
            assert.isFalse(offerHelpers.isValidGtin('12345'));
        });

        it('flags prices far from the reference and refuses prices outside the limits', function () {
            var h = harness({ preferences: { sellerPriceDeviationPercent: 40, sellerMinPriceCents: 100, sellerMaxPriceCents: 100000 } });
            var offerHelpers = h.require('scripts/helpers/offerHelpers');
            assert.isFalse(offerHelpers.checkPrice(10000, 10000).suspicious);
            assert.isTrue(offerHelpers.checkPrice(5000, 10000).suspicious);
            assert.equal(offerHelpers.checkPrice(50, null).invalid, 'price-out-of-range');
            assert.equal(offerHelpers.checkPrice(200000, null).invalid, 'price-out-of-range');
        });
    });

    describe('featured offer ranking', function () {
        it('picks the lowest price and breaks ties by rating, handling time and ID', function () {
            var offerHelpers = harness().require('scripts/helpers/offerHelpers');
            var ranked = offerHelpers.rankOffers([
                { offerId: 'B:P', priceCents: 11500, rating: 4.1, handlingDays: 2, available: 3 },
                { offerId: 'A:P', priceCents: 12000, rating: 4.9, handlingDays: 1, available: 3 },
                { offerId: 'C:P', priceCents: 11500, rating: 4.8, handlingDays: 2, available: 3 },
                { offerId: 'D:P', priceCents: 9000, rating: 5, handlingDays: 1, available: 0 }
            ]);
            assert.deepEqual(ranked.map(function (r) { return r.offerId; }), ['C:P', 'B:P', 'A:P']);
        });

        it('weighs price, rating and handling time when configured', function () {
            var h = harness({ preferences: { sellerFeaturedOfferStrategy: { value: 'WEIGHTED' }, sellerFeaturedOfferWeights: '{"price":50,"rating":30,"handling":20}' } });
            var ranked = h.require('scripts/helpers/offerHelpers').rankOffers([
                { offerId: 'CHEAP:P', priceCents: 10000, rating: 2, handlingDays: 7, available: 1 },
                { offerId: 'GOOD:P', priceCents: 10500, rating: 5, handlingDays: 1, available: 1 }
            ]);
            assert.equal(ranked[0].offerId, 'GOOD:P');
        });
    });

    describe('offers', function () {
        var h;
        var ctx;
        var offerHelpers;
        var admin;
        beforeEach(function () {
            h = harness({ preferences: { sellerOfferApprovalRequired: false } });
            fixtures.product(h, 'P1', { bookPriceCents: 12000 });
            fixtures.approvedSeller(h, 'SELLERA', 'C1');
            ctx = fixtures.context(h, 'C1', 'catalog.write');
            offerHelpers = h.require('scripts/helpers/offerHelpers');
            admin = h.require('scripts/helpers/marketplaceHelpers').actor('ADMIN', 'reviewer');
        });

        it('lists an existing product without duplicating it, and refuses a second offer by the same seller', function () {
            var result = offerHelpers.createOffer(ctx, 'P1', { price: '115.00', quantity: '4', sellerSku: 'SKU-1' });
            assert.equal(result.offerView.status, 'ACTIVE');
            assert.equal(result.offerView.priceCents, 11500);
            assert.equal(h.rows('MarketplaceOffer')[0].custom.offerId, 'SELLERA:P1');
            assert.equal(offerHelpers.createOffer(ctx, 'P1', { price: '110', quantity: '1', sellerSku: 'SKU-2' }).errorCode, 'conflict');
            assert.equal(offerHelpers.createOffer(ctx, 'P1', { price: 'abc', quantity: '1', sellerSku: 'SKU-2' }).fields.price, 'invalid');
        });

        it('sends suspicious prices to review and keeps a live price until a proposal is approved', function () {
            var created = offerHelpers.createOffer(ctx, 'P1', { price: '20', quantity: '4', sellerSku: 'SKU-1' });
            assert.equal(created.offerView.status, 'PENDING_REVIEW');
            assert.isTrue(h.rows('MarketplaceCase').some(function (c) { return c.custom.caseType === 'SUSPICIOUS_PRICE'; }));
            assert.isFalse(offerHelpers.decideOffer('SELLERA:P1', 'approve', '', admin).error);
            var updated = offerHelpers.updateOffer(ctx, 'P1', { price: '30' }, null).offerView;
            assert.equal(updated.priceCents, 2000);
            assert.equal(updated.proposedPriceCents, 3000);
            offerHelpers.decideOffer('SELLERA:P1', 'approve', '', admin);
            assert.equal(h.get('MarketplaceOffer', 'SELLERA:P1').custom.priceCents, 3000);
        });

        it('is buyable only while active, the seller is approved and the seller list has stock', function () {
            offerHelpers.createOffer(ctx, 'P1', { price: '115', quantity: '4', sellerSku: 'SKU-1' });
            assert.equal(offerHelpers.checkOfferBuyable('SELLERA:P1', 'P1', 1).reason, 'insufficient-stock');
            h.state.inventory['marketplace-sellera'] = { P1: 3 };
            assert.isTrue(offerHelpers.checkOfferBuyable('SELLERA:P1', 'P1', 3).ok);
            assert.equal(offerHelpers.checkOfferBuyable('SELLERA:P1', 'P1', 4).reason, 'insufficient-stock');
            assert.equal(offerHelpers.checkOfferBuyable('SELLERA:P1', 'OTHER', 1).reason, 'offer-unavailable');
            ctx.seller.custom.status = 'SUSPENDED';
            assert.equal(offerHelpers.checkOfferBuyable('SELLERA:P1', 'P1', 1).reason, 'seller-unavailable');
        });

        it('applies a lower stock at once and a higher stock only after the sync', function () {
            offerHelpers.createOffer(ctx, 'P1', { price: '115', quantity: '4', sellerSku: 'SKU-1' });
            h.state.inventory['marketplace-sellera'] = { P1: 5 };
            offerHelpers.setOfferStock(ctx, 'P1', 2);
            assert.equal(offerHelpers.checkOfferBuyable('SELLERA:P1', 'P1', 3).reason, 'insufficient-stock');
            offerHelpers.setOfferStock(ctx, 'P1', 50);
            assert.equal(offerHelpers.getAvailableQuantity(h.get('MarketplaceOffer', 'SELLERA:P1'), ctx.seller), 5);
            assert.equal(offerHelpers.setOfferStock(ctx, 'P1', -1).fields.quantity, 'invalid');
        });
    });

    describe('submissions', function () {
        var h;
        var ctx;
        var submissionHelpers;
        var admin;
        var input = {
            mode: 'NEW', sellerSku: 'hp-100', name: 'Wireless Headphones', shortDescription: 'Over-ear wireless headphones',
            brand: 'Acme', categoryId: 'electronics', productType: 'SIMPLE', price: '120.00', quantity: '10', gtin: '036000291452'
        };
        beforeEach(function () {
            h = harness({ preferences: { sellerProductApprovalRequired: true } });
            fixtures.product(h, 'X');
            fixtures.approvedSeller(h, 'SELLERA', 'C1');
            ctx = fixtures.context(h, 'C1', 'catalog.write');
            submissionHelpers = h.require('scripts/helpers/productSubmissionHelpers');
            admin = h.require('scripts/helpers/marketplaceHelpers').actor('ADMIN', 'reviewer');
        });

        it('stores a draft first and submits only with images and a valid category', function () {
            var draft = submissionHelpers.createDraft(ctx, input).submissionView;
            assert.equal(draft.status, 'DRAFT');
            assert.equal(h.rows('MarketplaceSubmission')[0].custom.sellerSku, 'HP-100');
            assert.equal(submissionHelpers.submitProduct(ctx, draft.submissionId).fields.images, 'required');
            h.rows('MarketplaceSubmission')[0].custom.images = IMAGE;
            var submitted = submissionHelpers.submitProduct(ctx, draft.submissionId).submissionView;
            assert.equal(submitted.status, 'SUBMITTED');
            assert.equal(submitted.productId, 'SELLERA-HP-100');
        });

        it('lets only the owning seller read or change a submission', function () {
            var draft = submissionHelpers.createDraft(ctx, input).submissionView;
            fixtures.approvedSeller(h, 'SELLERB', 'C2');
            var other = fixtures.context(h, 'C2', 'catalog.write');
            assert.equal(submissionHelpers.updateDraft(other, draft.submissionId, { name: 'Hijacked' }, null).errorCode, 'not-found');
            assert.isNull(submissionHelpers.getOwnSubmission(other, draft.submissionId));
        });

        it('approval prepares an unpublished offer and queues provisioning', function () {
            var draft = submissionHelpers.createDraft(ctx, input).submissionView;
            h.rows('MarketplaceSubmission')[0].custom.images = IMAGE;
            submissionHelpers.submitProduct(ctx, draft.submissionId);
            assert.isFalse(submissionHelpers.decideSubmission(draft.submissionId, 'approve', '', null, admin).error);
            assert.equal(h.rows('MarketplaceSubmission')[0].custom.status, 'APPROVED');
            var offer = h.get('MarketplaceOffer', 'SELLERA:SELLERA-HP-100');
            assert.equal(offer.custom.status, 'DRAFT');
            assert.equal(offer.custom.priceCents, 12000);
            assert.isNotNull(h.rows('MarketplaceSubmission')[0].custom.nextAttemptAt);
            assert.equal(submissionHelpers.decideSubmission(draft.submissionId, 'approve', '', null, admin).errorCode, 'not-allowed-now');
        });

        it('auto-approves when review is off and no quality flag was raised', function () {
            h.preferences.sellerProductApprovalRequired = false;
            var draft = submissionHelpers.createDraft(ctx, input).submissionView;
            h.rows('MarketplaceSubmission')[0].custom.images = IMAGE;
            assert.equal(submissionHelpers.submitProduct(ctx, draft.submissionId).submissionView.status, 'APPROVED');
        });

        it('refuses updates of products the seller did not create', function () {
            fixtures.product(h, 'FIRSTPARTY');
            assert.isTrue(submissionHelpers.createDraft(ctx, { mode: 'UPDATE', productId: 'FIRSTPARTY', sellerSku: 'X1' }).error);
        });
    });

    describe('import files', function () {
        it('builds catalog, price book and inventory XML that validates against the platform schemas', function () {
            var catalogImportHelpers = harness().require('scripts/helpers/catalogImportHelpers');
            var catalog = catalogImportHelpers.getCatalogXml('master', [{
                productId: 'SELLERA-HP-100', gtin: '036000291452', name: 'Headphones & <more>', shortDescription: 'Short', online: true, searchable: true,
                images: ['marketplace/SELLERA/SELLERA-HP-100/1.png'], taxClassId: 'standard', brand: 'Acme', custom: { mktOwnerSellerId: 'SELLERA', mktOfferCount: '2' },
                variation: { attributes: [{ id: 'color', values: ['red', 'blue'] }], variants: ['SELLERA-HP-100-R'] }
            }], [{ categoryId: 'electronics', productId: 'SELLERA-HP-100', primary: true }]);
            var prices = catalogImportHelpers.getPriceBookXml('marketplace-usd', [{ productId: 'SELLERA-HP-100', cents: 11999 }]);
            var stock = catalogImportHelpers.getInventoryXml([{ listId: 'marketplace-sellera', description: 'Seller A', records: [{ productId: 'SELLERA-HP-100', allocation: 7, timestamp: new Date('2026-10-25T10:00:00Z') }] }]);
            assert.include(catalog, 'Headphones &amp; &lt;more&gt;');
            assert.include(prices, '<amount quantity="1">119.99</amount>');
            assert.isNull(xsdError(catalog, 'catalog'));
            assert.isNull(xsdError(prices, 'pricebook'));
            assert.isNull(xsdError(stock, 'inventory'));
        });

        it('maps a submission to SCAPI Admin product bodies with site-specific flags and custom attributes', function () {
            var body = harness().require('scripts/helpers/catalogImportHelpers').getScapiProduct({ productId: 'P', name: 'N', shortDescription: 'S', online: true, searchable: true, images: ['a.png'], custom: { mktOwnerSellerId: 'SELLERA', empty: null } });
            assert.deepEqual(body.onlineFlag, { TestSite: true });
            assert.deepEqual(body.shortDescription, { default: { markup: 'S', source: 'S' } });
            assert.equal(body.c_mktOwnerSellerId, 'SELLERA');
            assert.notProperty(body, 'c_empty');
        });
    });
});
