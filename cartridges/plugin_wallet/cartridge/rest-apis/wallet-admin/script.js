'use strict';

/**
 * Custom Admin API "wallet-admin" (scope c_wallet_admin) for the OMS and back office:
 * refunds to the wallet, top-up chargebacks, wallet status and holds. Called with a
 * storefront siteId because wallet records are site-scoped.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var walletHelpers = require('*/cartridge/scripts/helpers/walletHelpers');
var accountHelpers = require('*/cartridge/scripts/helpers/walletAccountHelpers');

var ADMIN_API = walletHelpers.actor('ADMIN', 'admin-api');

/**
 * @returns {Object} disabled result, or a passing one
 */
function checkEnabled() {
    return walletHelpers.isWalletEnabled() ? { error: false } : walletHelpers.errorResult('disabled');
}

/**
 * @returns {Object} the JSON body, or {} when missing
 */
function getBody() {
    return walletHelpers.getApiBody() || {};
}

/**
 * @returns {?dw.object.CustomObject} wallet from the customerNo path parameter
 */
function getPathWallet() {
    return CustomObjectMgr.getCustomObject('WalletAccount', String(request.getSCAPIPathParameters().get('customerNo') || ''));
}

exports.postRefund = function () {
    var result = checkEnabled();
    if (!result.error) result = require('*/cartridge/scripts/helpers/walletPaymentHelpers').refundToWallet(getBody(), ADMIN_API);
    walletHelpers.renderApiResponse(result, { refundedCents: result.refundedCents, journalId: result.journalId, replayed: result.replayed }, 201);
};
exports.postRefund.public = true;

exports.postChargeback = function () {
    var result = checkEnabled();
    var body = getBody();
    if (!result.error) result = require('*/cartridge/scripts/helpers/walletTopUpHelpers').reverseTopUp(String(body.topUpId || ''), Number(body.amountCents), String(body.reference || ''), ADMIN_API);
    walletHelpers.renderApiResponse(result, { reversedCents: result.reversedCents, shortfallCents: result.shortfallCents });
};
exports.postChargeback.public = true;

exports.getWallet = function () {
    var result = checkEnabled();
    var wallet = result.error ? null : getPathWallet();
    if (!result.error && !wallet) result = walletHelpers.errorResult('not-found');
    walletHelpers.renderApiResponse(result, wallet && accountHelpers.getWalletView(wallet));
};
exports.getWallet.public = true;

exports.setWalletStatus = function () {
    var result = checkEnabled();
    var wallet = result.error ? null : getPathWallet();
    var body = getBody();
    if (!result.error && !wallet) result = walletHelpers.errorResult('not-found');
    else if (!result.error && ['ACTIVE', 'FROZEN', 'LOCKED', 'CLOSED'].indexOf(body.status) < 0) result = walletHelpers.errorResult('invalid', { status: 'invalid' });
    else if (!result.error) result = accountHelpers.setWalletStatus(wallet, body.status, String(body.reason || 'admin-api'), ADMIN_API);
    walletHelpers.renderApiResponse(result, wallet && accountHelpers.getWalletView(wallet));
};
exports.setWalletStatus.public = true;

exports.listHolds = function () {
    var enabled = checkEnabled();
    if (enabled.error) {
        walletHelpers.renderApiResponse(enabled);
        return;
    }
    var paging = walletHelpers.getApiPaging();
    var status = walletHelpers.getApiQuery('c_status');
    var page = walletHelpers.queryPage('WalletHold', status ? 'custom.status = {0}' : 'custom.status != {0}', 'custom.createdAt desc', [status || 'RELEASED'], paging.offset, paging.limit);
    walletHelpers.renderApiResponse(enabled, {
        data: page.items.map(function (h) {
            var c = h.custom;
            return { holdId: c.holdId, walletId: c.walletId, orderNo: c.orderNo, amountCents: c.amountCents, capturedCents: c.capturedCents, refundedCents: c.refundedCents, status: c.status, createdAt: c.createdAt };
        }),
        total: page.total,
        offset: paging.offset,
        limit: paging.limit
    });
};
exports.listHolds.public = true;
