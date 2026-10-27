'use strict';

var assert = require('chai').assert;
var crypto = require('crypto');
var harness = require('./harness');

describe('plugin_seller marketplaceHelpers', function () {
    describe('amounts', function () {
        var helpers;
        beforeEach(function () {
            helpers = harness().require('scripts/helpers/marketplaceHelpers');
        });

        it('turns dollar input into integer cents and rejects malformed input', function () {
            assert.equal(helpers.toCents('12'), 1200);
            assert.equal(helpers.toCents('12.5'), 1250);
            assert.equal(helpers.toCents('0.07'), 7);
            assert.equal(helpers.toCents(19.99), 1999);
            assert.isNull(helpers.toCents('12.345'));
            assert.isNull(helpers.toCents('-1'));
            assert.isNull(helpers.toCents('1e3'));
            assert.isNull(helpers.toCents(''));
        });

        it('formats cents through StringUtils.formatMoney as USD', function () {
            assert.equal(helpers.formatCents(123456), '$1,234.56');
            assert.equal(helpers.formatCents(-300), '-$3.00');
            assert.equal(helpers.formatCents(5), '$0.05');
        });

        it('reads Money as integer cents', function () {
            var h = harness();
            var cents = h.require('scripts/helpers/marketplaceHelpers').centsOf;
            assert.equal(cents(new h.Money(19.99, 'USD')), 1999);
            assert.equal(cents(new h.Money(0.1 + 0.2, 'USD')), 30);
            assert.equal(cents(new h.Money(null, 'USD')), 0);
        });
    });

    describe('site checks', function () {
        it('only enables the marketplace for USD sites', function () {
            var h = harness();
            var helpers = h.require('scripts/helpers/marketplaceHelpers');
            assert.isTrue(helpers.isMarketplaceEnabled());
            h.state.siteCurrency = 'EUR';
            assert.isFalse(helpers.isMarketplaceEnabled());
            h.preferences.sellerCurrency = 'EUR';
            h.state.siteCurrency = 'USD';
            assert.isFalse(helpers.isMarketplaceEnabled());
        });

        it('reads metadata defaults, and enum preferences as plain values', function () {
            var h = harness();
            var sellerHelpers = h.require('scripts/helpers/sellerHelpers');
            assert.isTrue(sellerHelpers.getPreference('sellerApprovalRequired'));
            assert.equal(sellerHelpers.getPreference('sellerSettlementHoldDays'), 14);
            assert.equal(sellerHelpers.getEnumPreference('sellerProvisioningStrategy'), 'IMPEX');
            h.preferences.sellerProvisioningStrategy = { value: 'SCAPI_ADMIN' };
            assert.equal(sellerHelpers.getEnumPreference('sellerProvisioningStrategy'), 'SCAPI_ADMIN');
            assert.deepEqual(sellerHelpers.getListPreference('sellerRestrictedCategoryIds'), []);
        });

        it('reports missing catalog identifiers before publishing', function () {
            var h = harness({ preferences: { sellerPriceBookId: null } });
            assert.isFalse(h.require('scripts/helpers/catalogImportHelpers').canPublish());
        });

        it('closes registration while the agreement version is not set', function () {
            var h = harness();
            var sellerHelpers = h.require('scripts/helpers/sellerHelpers');
            assert.isTrue(sellerHelpers.isRegistrationOpen());
            h.preferences.sellerAgreementVersion = null;
            assert.isFalse(sellerHelpers.isRegistrationOpen());
        });
    });

    describe('status flows', function () {
        it('allows only defined moves', function () {
            var h = harness();
            var helpers = h.require('scripts/helpers/marketplaceHelpers');
            var flow = h.require('scripts/helpers/productSubmissionHelpers').SUBMISSION_FLOW;
            assert.isTrue(helpers.canMove(flow, 'SUBMITTED', 'UNDER_REVIEW'));
            assert.isFalse(helpers.canMove(flow, 'PUBLISHED', 'DRAFT'));
            assert.isFalse(helpers.canMove(flow, 'UNKNOWN', 'DRAFT'));
        });
    });

    describe('security', function () {
        it('verifies fresh webhook signatures and rejects stale or forged ones', function () {
            var helpers = harness().require('scripts/helpers/marketplaceHelpers');
            var body = '{"id":"evt_12345678"}';
            var t = String(Math.floor(Date.now() / 1000));
            var v1 = crypto.createHmac('sha256', 'w'.repeat(40)).update(t + '.' + body).digest('hex');
            assert.isTrue(helpers.isValidWebhookSignature('t=' + t + ',v1=' + v1, body));
            assert.isFalse(helpers.isValidWebhookSignature('t=' + t + ',v1=' + v1, body + ' '));
            assert.isFalse(helpers.isValidWebhookSignature('t=' + (Number(t) - 1000) + ',v1=' + v1, body));
            assert.isFalse(helpers.isValidWebhookSignature('', body));
        });

        it('fails closed when a key is missing or short', function () {
            var helpers = harness({ secrets: { 'plugin-seller.hmac': 'short' } }).require('scripts/helpers/marketplaceHelpers');
            assert.isNull(helpers.hmac('plugin-seller.hmac', 'x'));
            assert.isNull(helpers.hmac('plugin-seller.unknown', 'x'));
        });

        it('creates unguessable IDs', function () {
            var helpers = harness().require('scripts/helpers/marketplaceHelpers');
            assert.match(helpers.createId('SUB'), /^SUB-[0-9A-F]{24}$/);
            assert.notEqual(helpers.createId('A'), helpers.createId('A'));
        });

        it('rate limits within a window, per subject', function () {
            var helpers = harness().require('scripts/helpers/marketplaceHelpers');
            assert.isTrue(helpers.checkRateLimit('t', 'subject', 2, 3600));
            assert.isTrue(helpers.checkRateLimit('t', 'subject', 2, 3600));
            assert.isFalse(helpers.checkRateLimit('t', 'subject', 2, 3600));
            assert.isTrue(helpers.checkRateLimit('t', 'other', 2, 3600));
        });

        it('strips control characters from text input', function () {
            var helpers = harness().require('scripts/helpers/marketplaceHelpers');
            assert.equal(helpers.cleanText(' a\u0000b\nc '), 'ab\nc');
            assert.equal(helpers.cleanText(null), '');
        });
    });

    describe('results', function () {
        it('builds base-style error results with a localized message', function () {
            var result = harness().require('scripts/helpers/marketplaceHelpers').errorResult('invalid', { name: 'required' });
            assert.isTrue(result.error);
            assert.equal(result.errorCode, 'invalid');
            assert.equal(result.errorMessage, harness.messages['error.invalid']);
            assert.notEqual(result.errorMessage, harness.messages['error.general']);
            assert.deepEqual(result.fields, { name: 'required' });
        });
    });
});
