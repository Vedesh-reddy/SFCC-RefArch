'use strict';

var assert = require('chai').assert;
var harness = require('./harness');
var fixtures = require('./fixtures');

describe('plugin_seller onboarding and authorization', function () {
    var h;
    var sellerHelpers;
    var admin;
    beforeEach(function () {
        h = harness({ preferences: { sellerRequiredDocumentTypes: ['IDENTITY'], sellerRequireCleanDocumentScan: false }, customers: ['C2'] });
        sellerHelpers = h.require('scripts/helpers/sellerHelpers');
        admin = h.require('scripts/helpers/marketplaceHelpers').actor('ADMIN', 'reviewer');
    });

    /**
     * Applies as SELLERA, verifies the e-mail and adds an identity document.
     * @returns {Object} seller context (application.write)
     */
    function readyToSubmit() {
        sellerHelpers.applyAsSeller(h.customer('C1'), fixtures.application());
        var ctx = fixtures.context(h, 'C1', 'application.write');
        ctx.seller.custom.emailVerified = true;
        h.create('MarketplaceDocument', 'DOC-1', { sellerId: 'SELLERA', docType: 'IDENTITY', state: 'ACTIVE', reviewStatus: 'PENDING', scanStatus: 'UNSCANNED', uploadedAt: new Date() });
        return ctx;
    }

    it('creates a draft seller and an owner membership, keeping only the last four tax ID digits', function () {
        var result = sellerHelpers.applyAsSeller(h.customer('C1'), fixtures.application());
        assert.isFalse(result.error);
        assert.equal(result.sellerView.status, 'DRAFT');
        assert.equal(result.sellerView.taxIdLast4, '6789');
        assert.notInclude(JSON.stringify(h.rows('MarketplaceSeller')[0].custom), '3456789');
        assert.equal(h.rows('MarketplaceSellerMember')[0].custom.role, 'OWNER');
        assert.isTrue(h.rows('MarketplaceAuditEvent').some(function (a) { return a.custom.action === 'APPLY'; }));
    });

    it('refuses applications without the current agreement, for guests, reserved IDs and second accounts', function () {
        assert.equal(sellerHelpers.applyAsSeller(h.customer('C1'), fixtures.application({ agreementAccepted: false })).fields.agreementAccepted, 'required');
        assert.equal(sellerHelpers.applyAsSeller(h.customer('C1'), fixtures.application({ agreementVersion: '2025-01' })).fields.agreementVersion, 'outdated');
        assert.equal(sellerHelpers.applyAsSeller({ authenticated: false, registered: false }, fixtures.application()).errorCode, 'unauthenticated');
        assert.equal(sellerHelpers.applyAsSeller(h.customer('C1'), fixtures.application({ sellerId: 'ADMIN' })).fields.sellerId, 'reserved');
        assert.isFalse(sellerHelpers.applyAsSeller(h.customer('C1'), fixtures.application()).error);
        assert.equal(sellerHelpers.applyAsSeller(h.customer('C1'), fixtures.application({ sellerId: 'SELLERB' })).errorCode, 'conflict');
        assert.equal(sellerHelpers.applyAsSeller(h.customer('C9'), fixtures.application()).fields.sellerId, 'taken');
    });

    it('closes registration when the agreement version is not configured', function () {
        h.preferences.sellerAgreementVersion = null;
        assert.equal(sellerHelpers.applyAsSeller(h.customer('C1'), fixtures.application()).errorCode, 'disabled');
    });

    it('flags a second live seller with the same tax ID for review without telling the applicant', function () {
        sellerHelpers.applyAsSeller(h.customer('C1'), fixtures.application());
        assert.isFalse(sellerHelpers.applyAsSeller(h.customer('C2'), fixtures.application({ sellerId: 'SELLERB' })).error);
        var cases = h.rows('MarketplaceCase');
        assert.isTrue(cases.some(function (c) { return c.custom.caseType === 'DUPLICATE_SELLER' && c.custom.sellerId === 'SELLERB'; }));
        assert.isFalse(cases[0].custom.visibleToSeller);
    });

    it('always resolves the seller from the signed-in customer (no cross-seller access)', function () {
        fixtures.approvedSeller(h, 'SELLERA', 'C1');
        fixtures.approvedSeller(h, 'SELLERB', 'C2');
        assert.equal(fixtures.context(h, 'C2', 'catalog.write').sellerId, 'SELLERB');
        var stranger = fixtures.context(h, 'C3', 'catalog.read');
        assert.equal(stranger.errorCode, 'forbidden');
        assert.isTrue(stranger.notSeller);
    });

    it('applies role and status rules', function () {
        var ctx = fixtures.approvedSeller(h, 'SELLERA', 'C1');
        h.create('MarketplaceSellerMember', 'C5', { sellerId: 'SELLERA', role: 'FULFILLMENT', active: true });
        assert.equal(fixtures.context(h, 'C5', 'catalog.write').errorCode, 'forbidden');
        assert.equal(fixtures.context(h, 'C5', 'orders.write').role, 'FULFILLMENT');
        ctx.seller.custom.status = 'SUSPENDED';
        assert.equal(fixtures.context(h, 'C1', 'catalog.write').errorCode, 'forbidden');
        assert.equal(fixtures.context(h, 'C1', 'orders.write').sellerId, 'SELLERA');
        h.preferences.sellerMarketplaceEnabled = false;
        assert.equal(fixtures.context(h, 'C1', 'orders.read').errorCode, 'disabled');
    });

    it('requires a verified e-mail and the required documents before submitting', function () {
        sellerHelpers.applyAsSeller(h.customer('C1'), fixtures.application());
        var result = sellerHelpers.submitApplication(fixtures.context(h, 'C1', 'application.write'));
        assert.equal(result.errorCode, 'incomplete');
        assert.include(result.problems, 'email-not-verified');
        assert.include(result.problems, 'missing-document:IDENTITY');
    });

    it('verifies the contact e-mail with a single-use code bound to the session', function () {
        sellerHelpers.applyAsSeller(h.customer('C1'), fixtures.application());
        var ctx = fixtures.context(h, 'C1', 'application.write');
        assert.isFalse(sellerHelpers.sendVerificationCode(ctx, 'session-x').error);
        assert.equal(h.state.mails[0].mail.to, 'ada@example.com');
        var code = h.state.mails[0].context.code;
        assert.match(code, /^\d{6}$/);
        assert.notInclude(JSON.stringify(h.rows('MarketplaceOtp')[0].custom), code);
        assert.equal(sellerHelpers.verifyEmailCode(ctx, code, 'session-y').errorCode, 'code-invalid');
        assert.isFalse(sellerHelpers.verifyEmailCode(ctx, code, 'session-x').error);
        assert.isTrue(ctx.seller.custom.emailVerified);
        assert.equal(sellerHelpers.verifyEmailCode(ctx, code, 'session-x').errorCode, 'code-missing');
        assert.isFalse(h.state.logs.some(function (l) { return l.message.indexOf(code) >= 0; }));
    });

    it('locks a code after the configured wrong attempts, expires it and enforces the resend cooldown', function () {
        h.preferences.sellerOtpMaxAttempts = 2;
        sellerHelpers.applyAsSeller(h.customer('C1'), fixtures.application());
        var ctx = fixtures.context(h, 'C1', 'application.write');
        sellerHelpers.sendVerificationCode(ctx, 's');
        var code = h.state.mails[0].context.code;
        var wrong = code === '000000' ? '111111' : '000000';
        assert.equal(sellerHelpers.verifyEmailCode(ctx, wrong, 's').errorCode, 'code-invalid');
        assert.equal(sellerHelpers.verifyEmailCode(ctx, wrong, 's').errorCode, 'code-locked');
        assert.equal(sellerHelpers.verifyEmailCode(ctx, code, 's').errorCode, 'code-locked');
        assert.equal(sellerHelpers.sendVerificationCode(ctx, 's').errorCode, 'rate-limited');
        h.rows('MarketplaceOtp')[0].custom.lastSentAt = new Date(Date.now() - 3600000);
        sellerHelpers.sendVerificationCode(ctx, 's');
        h.rows('MarketplaceOtp')[0].custom.expiresAt = new Date(Date.now() - 1000);
        assert.equal(sellerHelpers.verifyEmailCode(ctx, h.state.mails[1].context.code, 's').errorCode, 'code-expired');
    });

    it('submits, then a reviewer approves through manual verification and the seller gets an inventory list', function () {
        var ctx = readyToSubmit();
        var result = sellerHelpers.submitApplication(ctx);
        assert.equal(result.status, 'PENDING_VERIFICATION');
        assert.equal(ctx.seller.custom.kycStatus, 'MANUAL_REVIEW');
        var blocked = sellerHelpers.decideSeller('SELLERA', 'approve', '', null, admin);
        assert.equal(blocked.errorCode, 'incomplete');
        h.get('MarketplaceDocument', 'DOC-1').custom.reviewStatus = 'ACCEPTED';
        var approved = sellerHelpers.decideSeller('SELLERA', 'approve', '', null, admin);
        assert.equal(approved.sellerView.status, 'APPROVED');
        assert.equal(ctx.seller.custom.kycStatus, 'VERIFIED_MANUAL');
        assert.equal(ctx.seller.custom.inventoryListId, 'marketplace-sellera');
        assert.isTrue(h.rows('MarketplaceNotification').some(function (n) { return n.custom.type === 'APPLICATION_APPROVED'; }));
    });

    it('requires a reason for negative decisions and refuses invalid moves or stale pages', function () {
        fixtures.approvedSeller(h, 'SELLERA', 'C1');
        assert.equal(sellerHelpers.decideSeller('SELLERA', 'suspend', '', null, admin).fields.reason, 'required');
        assert.equal(sellerHelpers.decideSeller('SELLERA', 'approve', '', null, admin).errorCode, 'not-allowed-now');
        assert.equal(sellerHelpers.decideSeller('SELLERA', 'suspend', 'counterfeit reports', 7, admin).errorCode, 'stale');
        assert.equal(sellerHelpers.decideSeller('SELLERA', 'suspend', 'counterfeit reports', 0, admin).sellerView.status, 'SUSPENDED');
        assert.isTrue(h.get('MarketplaceSeller', 'SELLERA').custom.catalogDirty);
    });

    it('terminating a seller removes every member except the owner', function () {
        fixtures.approvedSeller(h, 'SELLERA', 'C1');
        assert.isFalse(sellerHelpers.setMember('SELLERA', 'C2', 'CATALOG', admin).error);
        assert.equal(sellerHelpers.setMember('SELLERA', 'C7', 'CATALOG', admin).fields.customerNo, 'unknown');
        sellerHelpers.decideSeller('SELLERA', 'terminate', 'policy violation', null, admin);
        assert.isFalse(h.get('MarketplaceSellerMember', 'C2').custom.active);
        assert.isTrue(h.get('MarketplaceSellerMember', 'C1').custom.active);
    });

    it('accepts provider identity results only with the matching reference', function () {
        h.preferences.sellerKycProvider = { value: 'EXTERNAL' };
        h.state.hooks['app.plugin.seller.kyc'] = { start: function () { return { status: 'SUBMITTED', reference: 'kyc-ref-1' }; } };
        sellerHelpers.submitApplication(readyToSubmit());
        var provider = h.require('scripts/helpers/marketplaceHelpers').actor('PROVIDER', 'kyc');
        assert.equal(sellerHelpers.recordIdentityResult('SELLERA', 'VERIFIED', 'other', provider).errorCode, 'conflict');
        assert.equal(sellerHelpers.recordIdentityResult('SELLERA', 'VERIFIED', 'kyc-ref-1', provider).status, 'PENDING_APPROVAL');
    });

    it('fails closed when the external provider hook is missing', function () {
        h.preferences.sellerKycProvider = { value: 'EXTERNAL' };
        var ctx = readyToSubmit();
        sellerHelpers.submitApplication(ctx);
        assert.equal(ctx.seller.custom.kycStatus, 'ERROR');
        assert.isTrue(h.rows('MarketplaceCase').some(function (c) { return c.custom.caseType === 'INTEGRATION_FAILURE'; }));
    });

    it('validates seller settings against marketplace limits', function () {
        var ctx = fixtures.approvedSeller(h, 'SELLERA', 'C1');
        var settingsCtx = fixtures.context(h, 'C1', 'settings.write');
        assert.equal(sellerHelpers.updateSettings(settingsCtx, { handlingDays: 25 }, null).fields.handlingDays, 'out-of-range');
        assert.isFalse(sellerHelpers.updateSettings(settingsCtx, { handlingDays: 3, returnDays: 30, returnsAccepted: 'true', shippingFee: '4.50' }, null).error);
        var terms = sellerHelpers.getSellerTerms(ctx.seller);
        assert.equal(terms.handlingDays, 3);
        assert.equal(terms.shippingFeeCents, 0, 'shipping fees are off by default');
        h.preferences.sellerShippingFeesEnabled = true;
        assert.equal(sellerHelpers.getSellerTerms(ctx.seller).shippingFeeCents, 450);
    });
});
