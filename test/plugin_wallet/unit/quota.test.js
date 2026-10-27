'use strict';

var assert = require('chai').assert;
var harness = require('./harness');
var fixtures = require('./fixtures');

// A storefront request may create at most 10 custom objects (api.dw.object.CustomObjectMgr.create()@SF),
// counted across every cartridge, so place-order must leave room for the other plugins.
describe('plugin_wallet storefront create quota', function () {
    var MAX_CREATES_PER_PAYMENT = 7;

    /**
     * @param {Object} h - harness
     * @param {Function} fn - work done in one request
     * @returns {number} custom objects created by fn
     */
    function creates(h, fn) {
        var before = Object.keys(h.db).length;
        fn();
        return Object.keys(h.db).length - before;
    }

    /**
     * Authorizes at order placement and settles after it, as CheckoutServices-PlaceOrder does.
     * @param {Object} h - harness
     * @param {Object} pay - walletPaymentHelpers
     * @param {Object} basket - basket with the wallet applied
     * @param {string} customerNo - payer
     * @param {string} orderNo - order
     */
    function placeOrder(h, pay, basket, customerNo, orderNo) {
        var pi = pay.getWalletInstruments(basket)[0];
        var auth = pay.authorizePayment(orderNo, pi, h.customer(customerNo), 'session-1');
        assert.isFalse(auth.error, auth.errorCode);
        fixtures.order(h, orderNo, 3, [pi], 3000);
        h.state.orders[orderNo].orderToken = 't';
        assert.equal(pay.settleAfterPlaceOrder([auth.holdId], { orderID: orderNo, orderToken: 't', error: false }).captured, 1);
    }

    it('keeps an owner payment and a family member payment well under 10 creates per request', function () {
        var h = harness({ preferences: { walletFamilyRequireCode: false, walletNotificationChannels: ['INBOX', 'EMAIL'] } });
        var fam = h.require('scripts/helpers/walletFamilyHelpers');
        var pay = h.require('scripts/helpers/walletPaymentHelpers');
        var owner = fixtures.fundedWallet(h, 'OWNER1', 20000);
        h.state.categories = {};
        h.get('WalletAccount', 'OWNER1').custom.recentSessions = [h.require('scripts/helpers/walletHelpers').sha256('session-1').slice(0, 32)];

        var own = fixtures.basket(h, 3000);
        pay.applyToBasket(h.customer('OWNER1'), own, { mode: 'OWN' }, 'session-1');
        assert.isAtMost(creates(h, function () { placeOrder(h, pay, own, 'OWNER1', 'ORD1'); }), MAX_CREATES_PER_PAYMENT);

        fam.invite(owner, { email: 'kid1@example.com', nickname: 'Kid', perOrderLimit: '40' });
        var token = /token\/([a-f0-9]{48})/.exec(h.state.mails.filter(function (m) { return m.template === 'wallet/email/invitation'; }).pop().context.url)[1];
        fam.sendAcceptCode(h.customer('KID1'), token, 'session-1');
        fam.acceptInvitation(h.customer('KID1'), token, h.state.mails.filter(function (m) { return m.template === 'wallet/email/code'; }).pop().context.code, 'session-1');
        var kid = fixtures.basket(h, 3000);
        pay.applyToBasket(h.customer('KID1'), kid, { mode: 'FAMILY' }, 'session-1');
        assert.isAtMost(creates(h, function () { placeOrder(h, pay, kid, 'KID1', 'ORD2'); }), MAX_CREATES_PER_PAYMENT);
    });
});
