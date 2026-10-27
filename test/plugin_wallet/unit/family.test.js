'use strict';

var assert = require('chai').assert;
var harness = require('./harness');
var fixtures = require('./fixtures');

describe('plugin_wallet family wallet and security', function () {
    var h;
    var familyHelpers;
    var paymentHelpers;
    var owner;
    beforeEach(function () {
        h = harness({ preferences: { walletFamilyRequireCode: true } });
        familyHelpers = h.require('scripts/helpers/walletFamilyHelpers');
        paymentHelpers = h.require('scripts/helpers/walletPaymentHelpers');
        owner = fixtures.fundedWallet(h, 'OWNER1', 20000);
        h.state.categories = {};
    });

    /**
     * @param {string} template - e-mail template
     * @returns {Object} context of the last e-mail sent with that template
     */
    function lastMail(template) {
        return h.state.mails.filter(function (m) { return m.template === template; }).pop().context;
    }

    /**
     * @returns {string} invitation token taken from the e-mail
     */
    function invite() {
        assert.isFalse(familyHelpers.invite(owner, { email: 'kid1@example.com', nickname: 'Kid', perOrderLimit: '30', dailyLimit: '50', monthlyLimit: '100' }).error);
        return /token\/([a-f0-9]{48})/.exec(lastMail('wallet/email/invitation').url)[1];
    }

    /**
     * @returns {Object} member payer context after accepting the invitation
     */
    function join() {
        var token = invite();
        familyHelpers.sendAcceptCode(h.customer('KID1'), token, 'session-1');
        familyHelpers.acceptInvitation(h.customer('KID1'), token, lastMail('wallet/email/code').code, 'session-1');
        return familyHelpers.getMemberContext(h.customer('KID1'));
    }

    /**
     * @param {Object} basket - basket double
     * @param {string} customerNo - payer
     * @returns {Object} payer context with the wallet amount
     */
    function payerOf(basket, customerNo) {
        return paymentHelpers.getBasketPayer(h.customer(customerNo), basket);
    }

    it('accepts an invitation only for the invited e-mail, with a code', function () {
        var token = invite();
        assert.notInclude(JSON.stringify(h.rows('WalletInvitation')[0].custom), token, 'token is stored hashed');
        assert.equal(familyHelpers.sendAcceptCode(h.customer('OTHER'), token, 'session-1').errorCode, 'forbidden');
        assert.equal(familyHelpers.acceptInvitation(h.customer('KID1'), token, '000000', 'session-1').errorCode, 'code-missing');
        familyHelpers.sendAcceptCode(h.customer('KID1'), token, 'session-1');
        var result = familyHelpers.acceptInvitation(h.customer('KID1'), token, lastMail('wallet/email/code').code, 'session-1');
        assert.equal(result.memberView.status, 'ACTIVE');
        assert.equal(result.memberView.perOrderLimitCents, 3000);
        assert.isNull(familyHelpers.getInvitation(token));
    });

    it('validates invitation fields', function () {
        var result = familyHelpers.invite(owner, { email: 'nope', perOrderLimit: '1.234' });
        assert.equal(result.fields.email, 'invalid');
        assert.equal(result.fields.perOrderLimit, 'invalid');
    });

    it('shows a member only their remaining allowance, never the owner balance', function () {
        var member = join();
        var allowance = familyHelpers.getAllowance(member);
        assert.deepEqual(Object.keys(allowance).sort(), ['nickname', 'perOrderLimitCents', 'remainingThisMonthCents', 'remainingTodayCents', 'requireOwnerApproval']);
        assert.notInclude(JSON.stringify(allowance), '20000');
    });

    it('caps a member payment at the per-order limit and enforces daily and monthly limits', function () {
        join();
        var result = paymentHelpers.applyToBasket(h.customer('KID1'), fixtures.basket(h, 10000), { mode: 'FAMILY' }, 'session-1');
        assert.equal(result.walletCents, 3000);
        assert.equal(result.requirement, 'CODE');
        var member = familyHelpers.getMemberContext(h.customer('KID1'));
        assert.equal(familyHelpers.checkMemberLimits(member.member, 3001, []).fields.limit, 'member-order');
        h.create('WalletHold', 'HOLD-X', { walletId: 'OWNER1', orderNo: 'O', amountCents: 3000, refundedCents: 0, status: 'CAPTURED', memberCustomerNo: 'KID1', createdAt: new Date() });
        assert.equal(familyHelpers.checkMemberLimits(member.member, 2500, []).fields.limit, 'member-daily');
    });

    it('restricts member payments to allowed categories', function () {
        join();
        var category = { ID: 'books', root: false, parent: { ID: 'root', root: true } };
        h.state.products.BOOK = { isVariant: function () { return false; }, categories: { toArray: function () { return [category]; } } };
        h.state.products.TOY = { isVariant: function () { return false; }, categories: { toArray: function () { return [{ ID: 'toys', root: false, parent: null }]; } } };
        assert.isFalse(familyHelpers.updateMember(owner, 'KID1', { allowedCategoryIds: 'books' }, null).error);
        var member = familyHelpers.getMemberContext(h.customer('KID1'));
        assert.isFalse(familyHelpers.checkMemberLimits(member.member, 100, ['BOOK']).error);
        assert.equal(familyHelpers.checkMemberLimits(member.member, 100, ['BOOK', 'TOY']).fields.limit, 'member-category');
    });

    it('refuses member changes from a stale page or another wallet', function () {
        join();
        assert.equal(familyHelpers.updateMember(owner, 'KID1', { nickname: 'Kiddo' }, 5).errorCode, 'stale');
        var stranger = fixtures.fundedWallet(h, 'STRANGER', 0);
        assert.equal(familyHelpers.updateMember(stranger, 'KID1', { nickname: 'Mine' }, null).errorCode, 'not-found');
        assert.equal(familyHelpers.setMemberStatus(stranger, 'KID1', 'REVOKED').errorCode, 'not-found');
    });

    it('revoking a member ends payment authorization at once and expires their approvals', function () {
        join();
        var basket = fixtures.basket(h, 2000);
        paymentHelpers.applyToBasket(h.customer('KID1'), basket, { mode: 'FAMILY' }, 'session-1');
        var payer = payerOf(basket, 'KID1');
        paymentHelpers.sendPaymentCode(payer, basket.UUID, 'session-1');
        assert.isFalse(paymentHelpers.verifyPaymentCode(payer, basket.UUID, lastMail('wallet/email/code').code, 'session-1').error);
        familyHelpers.setMemberStatus(owner, 'KID1', 'REVOKED');
        var pi = paymentHelpers.getWalletInstruments(basket)[0];
        assert.equal(paymentHelpers.authorizePayment('ORD1', pi, h.customer('KID1'), 'session-1').errorCode, 'forbidden');
        assert.equal(h.rows('WalletApproval')[0].custom.status, 'EXPIRED');
    });

    it('lets the owner approve a member payment when asked to', function () {
        join();
        familyHelpers.updateMember(owner, 'KID1', { requireOwnerApproval: true }, null);
        var basket = fixtures.basket(h, 2000);
        assert.equal(paymentHelpers.applyToBasket(h.customer('KID1'), basket, { mode: 'FAMILY' }, 'session-1').requirement, 'OWNER');
        var approvalId = paymentHelpers.requestOwnerApproval(payerOf(basket, 'KID1'), basket.UUID).approvalId;
        assert.lengthOf(paymentHelpers.getPendingApprovals(owner), 1);
        var stranger = fixtures.fundedWallet(h, 'STRANGER', 0);
        assert.equal(paymentHelpers.decideOwnerApproval(stranger, approvalId, 'APPROVED').errorCode, 'not-found');
        assert.isFalse(paymentHelpers.decideOwnerApproval(owner, approvalId, 'APPROVED').error);
        var auth = paymentHelpers.authorizePayment('ORD1', paymentHelpers.getWalletInstruments(basket)[0], h.customer('KID1'), 'session-1');
        assert.isFalse(auth.error);
        assert.equal(h.get('WalletHold', auth.holdId).custom.memberCustomerNo, 'KID1');
    });

    it('asks for a code from an unknown session, and locks the wallet after repeated locked codes', function () {
        h.preferences.walletLockAfterLockedCodes = 1;
        h.preferences.walletOtpMaxAttempts = 1;
        var basket = fixtures.basket(h, 1000);
        assert.equal(paymentHelpers.applyToBasket(h.customer('OWNER1'), basket, { mode: 'OWN' }, 'brand-new-session').requirement, 'CODE');
        var payer = payerOf(basket, 'OWNER1');
        paymentHelpers.sendPaymentCode(payer, basket.UUID, 'brand-new-session');
        var code = lastMail('wallet/email/code').code;
        assert.equal(paymentHelpers.verifyPaymentCode(payer, basket.UUID, code === '000000' ? '111111' : '000000', 'brand-new-session').errorCode, 'code-locked');
        assert.equal(h.get('WalletAccount', 'OWNER1').custom.status, 'LOCKED');
        assert.isTrue(h.rows('WalletCase').some(function (c) { return c.custom.caseType === 'FAILED_CODES'; }));
    });

    it('does not let a customer join two family wallets or their own', function () {
        join();
        var second = fixtures.fundedWallet(h, 'OWNER2', 0);
        familyHelpers.invite(second, { email: 'kid1@example.com' });
        var token = /token\/([a-f0-9]{48})/.exec(lastMail('wallet/email/invitation').url)[1];
        h.rows('WalletOtp').forEach(function (o) { o.custom.lastSentAt = new Date(Date.now() - 3600000); });
        familyHelpers.sendAcceptCode(h.customer('KID1'), token, 'session-1');
        assert.equal(familyHelpers.acceptInvitation(h.customer('KID1'), token, lastMail('wallet/email/code').code, 'session-1').errorCode, 'conflict');
        assert.equal(familyHelpers.invite(owner, { email: 'owner1@example.com' }).fields.email, 'self');
    });
});
