'use strict';

/**
 * Custom Shopper API "wallet" (scope c_wallet). A registered shopper token is required; the
 * wallet is always the token customer's own. Amounts in request bodies are dollars.
 */

var walletHelpers = require('*/cartridge/scripts/helpers/walletHelpers');
var accountHelpers = require('*/cartridge/scripts/helpers/walletAccountHelpers');

/**
 * @param {boolean} [create] - create the wallet when missing (POST endpoints only: GET cannot commit)
 * @returns {Object} owner wallet context of the token customer, or an error result
 */
function getContext(create) {
    return accountHelpers.getWalletContext(customer, !!create);
}

/**
 * @param {Object} page - {items, total}
 * @param {Object} paging - {offset, limit}
 * @returns {Object} list body
 */
function listBody(page, paging) {
    return { data: page.items, total: page.total, offset: paging.offset, limit: paging.limit };
}

/**
 * @returns {Object} the JSON body, or {} when missing
 */
function getBody() {
    return walletHelpers.getApiBody() || {};
}

exports.getWallet = function () {
    var context = getContext();
    if (context.errorCode === 'not-found') {
        walletHelpers.renderApiResponse({ error: false }, { walletId: null, status: 'NONE', availableCents: 0, heldCents: 0, currency: 'USD' });
        return;
    }
    var view = context.error ? null : accountHelpers.getWalletView(context.wallet);
    if (view) view.insights = accountHelpers.getMonthlyInsights(context.walletId, 6);
    walletHelpers.renderApiResponse(context, view);
};
exports.getWallet.public = true;

exports.listTransactions = function () {
    var context = getContext();
    var paging = walletHelpers.getApiPaging();
    var page = context.error ? null : accountHelpers.getHistory(context.walletId, walletHelpers.getApiQuery('c_type'), paging.offset, paging.limit);
    walletHelpers.renderApiResponse(context, page && listBody(page, paging));
};
exports.listTransactions.public = true;

exports.createTopUp = function () {
    var context = getContext(true);
    var result = context.error ? context : require('*/cartridge/scripts/helpers/walletTopUpHelpers').startTopUp(context, getBody().amount);
    walletHelpers.renderApiResponse(result, { topUpId: result.topUpId, redirectUrl: result.redirectUrl }, 201);
};
exports.createTopUp.public = true;

exports.getTopUp = function () {
    var topUpHelpers = require('*/cartridge/scripts/helpers/walletTopUpHelpers');
    var context = getContext();
    var topUp = context.error ? null : topUpHelpers.getOwnTopUp(context, request.getSCAPIPathParameters().get('topUpId'));
    var result = context.error ? context : (topUp ? { error: false } : walletHelpers.errorResult('not-found')); // eslint-disable-line no-nested-ternary
    walletHelpers.renderApiResponse(result, topUp && topUpHelpers.getTopUpView(topUp));
};
exports.getTopUp.public = true;

// POST, because verifying may credit the wallet (Custom API GET requests cannot commit).
exports.verifyTopUp = function () {
    var topUpHelpers = require('*/cartridge/scripts/helpers/walletTopUpHelpers');
    var context = getContext(true);
    var topUp = context.error ? null : topUpHelpers.getOwnTopUp(context, request.getSCAPIPathParameters().get('topUpId'));
    var result = context.error ? context : (topUp ? topUpHelpers.completeTopUp(topUp.custom.topUpId, context.actor) : walletHelpers.errorResult('not-found')); // eslint-disable-line no-nested-ternary
    walletHelpers.renderApiResponse(result, topUp && topUpHelpers.getTopUpView(topUp));
};
exports.verifyTopUp.public = true;

exports.getFamily = function () {
    var familyHelpers = require('*/cartridge/scripts/helpers/walletFamilyHelpers');
    var context = getContext();
    var body = context.error ? null : {
        members: familyHelpers.getMembers(context.walletId).map(familyHelpers.getMemberView),
        approvals: require('*/cartridge/scripts/helpers/walletPaymentHelpers').getPendingApprovals(context)
    };
    walletHelpers.renderApiResponse(context, body);
};
exports.getFamily.public = true;

exports.createInvitation = function () {
    var context = getContext(true);
    var result = context.error ? context : require('*/cartridge/scripts/helpers/walletFamilyHelpers').invite(context, getBody());
    walletHelpers.renderApiResponse(result, { invitationId: result.invitationId }, 201);
};
exports.createInvitation.public = true;

exports.updateMember = function () {
    var context = getContext(true);
    var body = getBody();
    var revision = body.revision === undefined || body.revision === null ? null : Number(body.revision);
    var result = context.error ? context : require('*/cartridge/scripts/helpers/walletFamilyHelpers').updateMember(context, request.getSCAPIPathParameters().get('customerNo'), body, revision);
    walletHelpers.renderApiResponse(result, result.memberView);
};
exports.updateMember.public = true;

exports.setMemberStatus = function () {
    var context = getContext(true);
    var status = String(getBody().status || '');
    var result = context;
    if (!context.error && ['REVOKED', 'FROZEN', 'ACTIVE'].indexOf(status) < 0) result = walletHelpers.errorResult('invalid', { status: 'invalid' });
    else if (!context.error) result = require('*/cartridge/scripts/helpers/walletFamilyHelpers').setMemberStatus(context, request.getSCAPIPathParameters().get('customerNo'), status);
    walletHelpers.renderApiResponse(result, { status: status });
};
exports.setMemberStatus.public = true;

exports.decideApproval = function () {
    var context = getContext(true);
    var result = context.error ? context : require('*/cartridge/scripts/helpers/walletPaymentHelpers').decideOwnerApproval(context, request.getSCAPIPathParameters().get('approvalId'), String(getBody().decision || ''));
    walletHelpers.renderApiResponse(result, { decided: true });
};
exports.decideApproval.public = true;

exports.getAllowance = function () {
    var familyHelpers = require('*/cartridge/scripts/helpers/walletFamilyHelpers');
    var member = familyHelpers.getMemberContext(customer);
    walletHelpers.renderApiResponse(member, member.error ? null : familyHelpers.getAllowance(member));
};
exports.getAllowance.public = true;
