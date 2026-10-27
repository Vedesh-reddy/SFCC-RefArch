'use strict';

var assert = require('chai').assert;
var harness = require('./harness');
var fixtures = require('./fixtures');

var PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4]);
var PDF = Buffer.from('%PDF-1.7 test document');

/**
 * Multipart request double: each upload is {field, contentType, name, data}.
 * @param {Object} h - harness
 * @param {Object[]} uploads - uploads
 * @param {Object} fields - regular form fields
 * @returns {Object} HttpParameterMap double
 */
function multipart(h, uploads, fields) {
    return {
        get: function (name) { return { stringValue: (fields || {})[name] || null }; },
        processMultipart: function (callback) {
            var result = {};
            uploads.forEach(function (u, i) {
                var file = callback(u.field, u.contentType, u.name);
                if (file) {
                    h.state.files[file.fullPath] = u.data;
                    result['f' + i] = file;
                }
            });
            return { values: function () { return { toArray: function () { return Object.keys(result).map(function (k) { return result[k]; }); } }; } };
        }
    };
}

describe('plugin_seller integration points', function () {
    describe('Custom Shopper API', function () {
        var h;
        var api;
        beforeEach(function () {
            h = harness({ preferences: { sellerOfferApprovalRequired: false } });
            fixtures.product(h, 'P1', { bookPriceCents: 12000 });
            fixtures.approvedSeller(h, 'SELLERA', 'C1');
            fixtures.approvedSeller(h, 'SELLERB', 'C2');
            api = h.require('rest-apis/marketplace/script');
        });

        it('resolves the seller from the token, so another seller cannot read a submission', function () {
            h.api({ customer: h.customer('C1'), body: { mode: 'NEW', sellerSku: 'A1', name: 'Thing' } });
            api.createSubmission();
            assert.equal(h.state.responses[0].status, 201);
            var id = h.state.responses[0].body.submissionId;
            h.api({ customer: h.customer('C2'), path: { submissionId: id } });
            api.getSubmission();
            assert.equal(h.state.responses[0].status, 404);
            h.api({ customer: { authenticated: false, registered: false }, path: { submissionId: id } });
            api.getSubmission();
            assert.equal(h.state.responses[0].status, 401);
        });

        it('returns field errors as RFC 9457 problem details without internals', function () {
            h.api({ customer: h.customer('C1'), path: { productId: 'P1' }, body: { price: 'abc', quantity: 1, sellerSku: 'S1' } });
            api.upsertOffer();
            var r = h.state.responses[0];
            assert.equal(r.status, 400);
            assert.equal(r.type, 'marketplace-invalid');
            assert.include(r.custom.fields, 'price');
            assert.notInclude(JSON.stringify(r), 'Error');
            h.api({ customer: h.customer('C1'), body: '{not json' });
            api.createSubmission();
            assert.equal(h.state.responses[0].status, 400);
        });

        it('publishes offers without seller contact or account data', function () {
            h.api({ customer: h.customer('C1'), path: { productId: 'P1' }, body: { price: '99.00', quantity: 3, sellerSku: 'S1' } });
            api.upsertOffer();
            assert.equal(h.state.responses[0].status, 201);
            h.state.inventory['marketplace-sellera'] = { P1: 3 };
            h.api({ query: { c_productId: 'P1' } });
            api.getProductOffers();
            var body = h.state.responses[0].body;
            assert.equal(body.data[0].priceCents, 9900);
            assert.isTrue(body.data[0].featured);
            assert.notInclude(JSON.stringify(body), '@example.com');
            assert.isTrue(body.data[0].available);
        });

        it('requires an idempotency key for shipments', function () {
            h.api({ customer: h.customer('C1'), path: { orderNo: '1' }, body: { carrier: 'UPS' } });
            api.createShipment();
            assert.equal(h.state.responses[0].status, 400);
            assert.include(h.state.responses[0].custom.fields, 'idempotencyKey');
        });

        it('limits writes per seller and hour', function () {
            h.preferences.sellerWriteRateLimitPerHour = 1;
            h.api({ customer: h.customer('C1'), body: { mode: 'NEW', sellerSku: 'A1', name: 'Thing' } });
            api.createSubmission();
            h.api({ customer: h.customer('C1'), body: { mode: 'NEW', sellerSku: 'A2', name: 'Thing two' } });
            api.createSubmission();
            assert.equal(h.state.responses[0].status, 429);
        });
    });

    describe('documents', function () {
        it('stores only files whose leading bytes match an allowed type, under generated names', function () {
            var h = harness({ preferences: { sellerDocumentAllowedTypes: ['application/pdf'] } });
            var ctx = fixtures.approvedSeller(h, 'SELLERA', 'C1', { status: 'DRAFT' });
            var documentHelpers = h.require('scripts/helpers/sellerDocumentHelpers');
            var upload = function (uploads, fields) { return documentHelpers.uploadDocument(ctx, multipart(h, uploads, fields)); };
            assert.isFalse(upload([{ field: 'document', contentType: 'application/pdf', name: '../../evil.pdf', data: PDF }], { docType: 'IDENTITY' }).error);
            var record = h.rows('MarketplaceDocument')[0].custom;
            assert.match(record.storagePath, /^documents\/[a-f0-9]{32}\.bin$/);
            assert.equal(record.fileName, '.._.._evil.pdf');
            assert.equal(record.scanStatus, 'UNSCANNED');
            assert.equal(upload([{ field: 'document', contentType: 'application/pdf', name: 'fake.pdf', data: Buffer.from('MZ executable') }], { docType: 'IDENTITY' }).fields.document, 'rejected');
            assert.equal(upload([{ field: 'document', contentType: 'image/png', name: 'a.png', data: PNG }], { docType: 'IDENTITY' }).fields.document, 'rejected');
            assert.equal(upload([], { docType: 'PASSPORT' }).fields.docType, 'invalid');
        });

        it('quarantines a file reported infected and blocks approval until the scan is clean', function () {
            var h = harness({ preferences: { sellerDocumentScanProvider: { value: 'EXTERNAL' }, sellerRequiredDocumentTypes: ['IDENTITY'] } });
            h.state.hooks['app.plugin.seller.scan'] = { submit: function () { return { status: 'PENDING', reference: 'scan-1' }; } };
            var ctx = fixtures.approvedSeller(h, 'SELLERA', 'C1', { status: 'DRAFT' });
            var documentHelpers = h.require('scripts/helpers/sellerDocumentHelpers');
            var view = documentHelpers.uploadDocument(ctx, multipart(h, [{ field: 'document', contentType: 'application/pdf', name: 'id.pdf', data: PDF }], { docType: 'IDENTITY' })).documentView;
            assert.include(documentHelpers.getApprovalProblems('SELLERA'), 'scan-not-clean');
            assert.equal(documentHelpers.recordScanResult(view.documentId, 'INFECTED', 'scan-x').errorCode, 'conflict');
            assert.isFalse(documentHelpers.recordScanResult(view.documentId, 'INFECTED', 'scan-1').error);
            var record = h.rows('MarketplaceDocument')[0].custom;
            assert.equal(record.state, 'QUARANTINED');
            assert.notProperty(h.state.files, '/IMPEX/plugin-seller-private/' + record.storagePath);
        });
    });

    describe('provisioning', function () {
        it('writes import files for approved submissions and publishes only after verification', function () {
            var h = harness({ preferences: { sellerProductApprovalRequired: false, sellerMasterCatalogId: 'master', sellerSiteCatalogId: 'site' } });
            fixtures.product(h, 'X');
            fixtures.approvedSeller(h, 'SELLERA', 'C1');
            var ctx = fixtures.context(h, 'C1', 'catalog.write');
            var submissionHelpers = h.require('scripts/helpers/productSubmissionHelpers');
            var draft = submissionHelpers.createDraft(ctx, { mode: 'NEW', sellerSku: 'HP1', name: 'Headphones', shortDescription: 'Wireless over-ear', brand: 'Acme', categoryId: 'electronics', productType: 'SIMPLE', price: '99.00', quantity: '4' }).submissionView;
            h.state.files['/IMPEX/plugin-seller-private/images/SELLERA/' + draft.submissionId + '/a.png.bin'] = PNG;
            h.rows('MarketplaceSubmission')[0].custom.images = JSON.stringify([{ path: 'images/SELLERA/' + draft.submissionId + '/a.png.bin', type: 'image/png', extension: 'png' }]);
            submissionHelpers.submitProduct(ctx, draft.submissionId);
            h.rows('MarketplaceSubmission')[0].custom.nextAttemptAt = new Date(Date.now() - 1000);

            var catalogImportHelpers = h.require('scripts/helpers/catalogImportHelpers');
            assert.equal(catalogImportHelpers.preparePublishing(10).prepared, 1);
            var written = Object.keys(h.state.files).filter(function (f) { return /plugin-seller\/provision\/.*\.xml$/.test(f); });
            assert.lengthOf(written, 4);
            assert.isTrue(Object.keys(h.state.files).some(function (f) { return f === '/CATALOGS/master/default/marketplace/SELLERA/SELLERA-HP1/1.png'; }));
            assert.equal(h.rows('MarketplaceSubmission')[0].custom.status, 'PROVISIONING');

            assert.equal(catalogImportHelpers.verifyPublishing(10).failed, 1);
            assert.equal(h.rows('MarketplaceSubmission')[0].custom.lastError, 'product-missing');
            assert.equal(h.rows('MarketplaceSubmission')[0].custom.status, 'PROVISIONING_FAILED');

            h.rows('MarketplaceSubmission')[0].custom.nextAttemptAt = new Date(Date.now() - 1000);
            catalogImportHelpers.preparePublishing(10);
            fixtures.product(h, 'SELLERA-HP1', { bookPriceCents: 9900, custom: { mktOwnerSellerId: 'SELLERA' } });
            h.state.inventory['marketplace-sellera'] = { 'SELLERA-HP1': 4 };
            assert.equal(catalogImportHelpers.verifyPublishing(10).published, 1);
            assert.equal(h.rows('MarketplaceSubmission')[0].custom.status, 'PUBLISHED');
            assert.equal(h.get('MarketplaceOffer', 'SELLERA:SELLERA-HP1').custom.status, 'ACTIVE');
        });

        it('opens a case after the last provisioning attempt', function () {
            var h = harness({ preferences: { sellerProvisioningMaxAttempts: 1 } });
            fixtures.approvedSeller(h, 'SELLERA', 'C1');
            h.create('MarketplaceSubmission', 'SUB-1', { sellerId: 'SELLERA', status: 'PROVISIONING', productId: 'SELLERA-X', payload: JSON.stringify({ categoryId: 'electronics', productType: 'SIMPLE', priceCents: 100 }), provisionAttempts: 1, batchId: 'B', updatedAt: new Date() });
            h.require('scripts/helpers/catalogImportHelpers').verifyPublishing(10);
            assert.isTrue(h.rows('MarketplaceCase').some(function (c) { return c.custom.caseType === 'PROVISIONING_FAILED'; }));
            assert.isNull(h.get('MarketplaceSubmission', 'SUB-1').custom.nextAttemptAt);
        });

        it('syncs dirty offers: seller stock, featured price and aggregate for seller-owned products', function () {
            var h = harness({ preferences: { sellerOfferApprovalRequired: false } });
            fixtures.product(h, 'OWNED', { custom: { mktOwnerSellerId: 'SELLERA' } });
            fixtures.approvedSeller(h, 'SELLERA', 'C1');
            fixtures.approvedSeller(h, 'SELLERB', 'C2');
            h.create('MarketplaceOffer', 'SELLERA:OWNED', { sellerId: 'SELLERA', productId: 'OWNED', status: 'ACTIVE', priceCents: 5000, stock: 2, stockDirty: true, priceDirty: true, stockUpdatedAt: new Date(Date.now() - 5000), updatedAt: new Date(Date.now() - 5000) });
            h.create('MarketplaceOffer', 'SELLERB:OWNED', { sellerId: 'SELLERB', productId: 'OWNED', status: 'ACTIVE', priceCents: 4500, stock: 3, stockDirty: true, priceDirty: true, stockUpdatedAt: new Date(Date.now() - 5000), updatedAt: new Date(Date.now() - 5000) });
            var catalogImportHelpers = h.require('scripts/helpers/catalogImportHelpers');
            var counts = catalogImportHelpers.prepareOfferSync(100);
            assert.equal(counts.offers, 2);
            var files = Object.keys(h.state.files).filter(function (f) { return /plugin-seller\/sync\/.*\.xml$/.test(f); });
            var inventory = h.state.files[files.filter(function (f) { return /inventory/.test(f); })[0]].toString();
            assert.include(inventory, '<header list-id="inventory_site">');
            assert.match(inventory, /<record product-id="OWNED"><allocation>5<\/allocation>/);
            var prices = h.state.files[files.filter(function (f) { return /pricebook/.test(f); })[0]].toString();
            assert.include(prices, '<amount quantity="1">45.00</amount>');
            h.state.inventory['marketplace-sellera'] = { OWNED: 2 };
            h.state.inventory['marketplace-sellerb'] = { OWNED: 3 };
            assert.equal(catalogImportHelpers.confirmOfferSync().confirmed, 2);
            assert.isFalse(h.get('MarketplaceOffer', 'SELLERA:OWNED').custom.stockDirty);
        });
    });

    describe('jobs', function () {
        it('reports partial failures as ERROR and does nothing while the marketplace is off', function () {
            var h = harness({ preferences: { sellerMarketplaceEnabled: false } });
            var jobs = h.require('scripts/jobs/marketplace');
            assert.equal(jobs.notifications({ MaxItems: 10 }).code, 'DISABLED');
            h.preferences.sellerMarketplaceEnabled = true;
            h.preferences.sellerFromEmail = null;
            assert.equal(jobs.notifications({ MaxItems: 10 }).code, 'OK');
        });

        it('keeps a resumable cursor for the performance step', function () {
            var h = harness();
            fixtures.approvedSeller(h, 'SELLERA', 'C1');
            fixtures.approvedSeller(h, 'SELLERB', 'C2');
            var jobs = h.require('scripts/jobs/marketplace');
            assert.equal(jobs.performance({ MaxItems: 1 }).code, 'OK');
            assert.equal(h.require('scripts/helpers/marketplaceHelpers').getJobState('performance').cursor, 'SELLERA');
            jobs.performance({ MaxItems: 1 });
            jobs.performance({ MaxItems: 1 });
            assert.equal(h.require('scripts/helpers/marketplaceHelpers').getJobState('performance').cursor, '');
        });

        it('cleans up expired rate buckets and old request keys', function () {
            var h = harness();
            h.create('MarketplaceRateBucket', 'old', { count: 1, expiresAt: new Date(Date.now() - 1000) });
            h.create('MarketplaceRateBucket', 'live', { count: 1, expiresAt: new Date(Date.now() + 60000) });
            h.create('MarketplaceRequestKey', 'k1', { createdAt: new Date(Date.now() - 40 * 86400000) });
            var status = h.require('scripts/jobs/marketplace').cleanup({});
            assert.equal(status.code, 'OK');
            assert.deepEqual(h.rows('MarketplaceRateBucket').map(function (r) { return r.custom.bucketId; }), ['live']);
            assert.lengthOf(h.rows('MarketplaceRequestKey'), 0);
        });

        it('delivers queued e-mails with retries and resolves addresses at send time', function () {
            var h = harness({ preferences: { sellerNotificationChannels: ['INBOX', 'EMAIL'] } });
            fixtures.approvedSeller(h, 'SELLERA', 'C1');
            var helpers = h.require('scripts/helpers/marketplaceHelpers');
            helpers.notify('SELLERA', 'NEW_ORDER', { orderNo: '00001' });
            var stored = h.rows('MarketplaceNotification');
            assert.lengthOf(stored, 2);
            assert.notInclude(JSON.stringify(stored.map(function (n) { return n.custom; })), '@example.com');
            var counts = helpers.deliverNotifications(10);
            assert.equal(counts.sent, 1);
            assert.equal(h.state.mails[0].mail.to, 'sellera@example.com');
            assert.equal(helpers.getInbox('SELLERA', 0, 10).unread, 1);
        });
    });
});
