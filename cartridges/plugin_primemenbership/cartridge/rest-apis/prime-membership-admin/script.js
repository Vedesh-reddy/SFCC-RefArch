'use strict';

/**
 * Custom Admin API "prime-membership-admin" (scope c_prime_membership_admin) for the OMS and
 * finance: read a membership, see payments held for review, and record refunds made in the payment
 * system. It can't mark anything as paid. Called with a storefront siteId because the records are
 * site-scoped.
 */

var membershipHelpers = require('*/cartridge/scripts/helpers/membershipHelpers');
var planHelpers = require('*/cartridge/scripts/helpers/membershipPlanHelpers');
var subscriptionHelpers = require('*/cartridge/scripts/helpers/membershipSubscriptionHelpers');
var paymentHelpers = require('*/cartridge/scripts/helpers/membershipPaymentHelpers');

var ACTOR = 'integration:admin-api';

/**
 * @returns {Object} disabled result, or a passing one
 */
function checkEnabled() {
    return planHelpers.isEnabled() ? { error: false } : membershipHelpers.errorResult('disabled');
}

/**
 * @returns {string} customer number from the path
 */
function pathCustomerNo() {
    return String(request.getSCAPIPathParameters().get('customerNo') || '');
}

exports.getMembership = function () {
    var result = checkEnabled();
    var subscription = result.error ? null : subscriptionHelpers.getSubscription(pathCustomerNo());
    if (!result.error && !subscription) result = membershipHelpers.errorResult('not-found');
    if (result.error) {
        membershipHelpers.renderApiResponse(result);
        return;
    }
    var c = subscription.custom;
    membershipHelpers.renderApiResponse(result, {
        customerNo: c.customerNo,
        planId: c.planID || null,
        status: c.status,
        statusReason: c.statusReason || null,
        entitled: subscriptionHelpers.isEntitled(subscription),
        expirationDate: c.expirationDate || null,
        paidThroughDate: c.paidThroughDate || null,
        transactions: paymentHelpers.getHistory(c.customerNo, 20)
    });
};
exports.getMembership.public = true;

exports.recordRefund = function () {
    var result = checkEnabled();
    if (result.error) {
        membershipHelpers.renderApiResponse(result);
        return;
    }
    var body = membershipHelpers.parseJson(request.getHttpParameterMap().getRequestBodyAsString(), null);
    if (!body || typeof body.c_amountCents !== 'number' || Math.floor(body.c_amountCents) !== body.c_amountCents) {
        membershipHelpers.renderApiResponse(membershipHelpers.errorResult('invalid'));
        return;
    }
    var outcome = paymentHelpers.recordRefund(pathCustomerNo(), String(body.c_orderNo || ''), body.c_amountCents, body.c_endMembership === true, String(body.c_reference || ''), ACTOR);
    membershipHelpers.renderApiResponse(outcome, outcome.error ? null : { transactionId: outcome.transactionID }, 201);
};
exports.recordRefund.public = true;

exports.listReviewTransactions = function () {
    var result = checkEnabled();
    var value = request.getHttpParameterMap().get('c_limit');
    var limit = value && value.submitted && Number(value.stringValue) > 0 && Number(value.stringValue) <= 100 ? Math.floor(Number(value.stringValue)) : 20;
    membershipHelpers.renderApiResponse(result, result.error ? null : {
        data: membershipHelpers.queryPage('PrimeMembershipTransaction', 'custom.status = {0}', 'custom.updatedAt asc', ['REVIEW'], 0, limit).items.map(function (record) {
            return Object.assign(paymentHelpers.getTransactionView(record), { customerNo: record.custom.customerNo, reason: record.custom.reviewReason || null });
        })
    });
};
exports.listReviewTransactions.public = true;
