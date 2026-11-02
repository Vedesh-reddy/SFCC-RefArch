'use strict';

/**
 * Custom Shopper API "prime-membership" (scope c_prime_membership). There is no native membership
 * API. Plans are public; everything else needs a registered shopper token and always acts for the
 * token's customer. Paying goes through the storefront checkout, not through this API.
 */

var membershipHelpers = require('*/cartridge/scripts/helpers/membershipHelpers');
var planHelpers = require('*/cartridge/scripts/helpers/membershipPlanHelpers');
var subscriptionHelpers = require('*/cartridge/scripts/helpers/membershipSubscriptionHelpers');
var benefitHelpers = require('*/cartridge/scripts/helpers/membershipBenefitHelpers');
var paymentHelpers = require('*/cartridge/scripts/helpers/membershipPaymentHelpers');

/**
 * @returns {?string} the customer number of the registered shopper behind the token
 */
function getCustomerNo() {
    return customer && customer.authenticated && customer.registered && customer.profile ? customer.profile.customerNo : null;
}

/**
 * @returns {Object} a passing result, or why the call can't go on
 */
function checkCustomer() {
    if (!planHelpers.isEnabled()) return membershipHelpers.errorResult('disabled');
    return getCustomerNo() ? { error: false } : membershipHelpers.errorResult('unauthenticated');
}

/**
 * @returns {number} page size within bounds
 */
function getLimit() {
    var value = request.getHttpParameterMap().get('c_limit');
    var limit = value && value.submitted ? Number(value.stringValue) : 20;
    return limit > 0 && limit <= 100 ? Math.floor(limit) : 20;
}

exports.listPlans = function () {
    var result = planHelpers.isEnabled() ? { error: false } : membershipHelpers.errorResult('disabled');
    membershipHelpers.renderApiResponse(result, result.error ? null : { data: planHelpers.getSellablePlans().map(planHelpers.getPlanView) });
};
exports.listPlans.public = true;

exports.getUpgradeQuote = function () {
    var result = checkCustomer();
    if (result.error) {
        membershipHelpers.renderApiResponse(result);
        return;
    }
    var quote = paymentHelpers.getQuote(getCustomerNo(), 'UPGRADE', request.getSCAPIPathParameters().get('planId'));
    membershipHelpers.renderApiResponse(quote, quote.error ? null : {
        planId: quote.plan.planID,
        currency: quote.plan.currency,
        chargeCents: quote.amountCents,
        unusedCreditCents: quote.quoteData.unusedCreditCents,
        targetCostCents: quote.quoteData.targetCostCents,
        remainingSeconds: quote.quoteData.remainingSeconds
    });
};
exports.getUpgradeQuote.public = true;

exports.getMyMembership = function () {
    var result = checkCustomer();
    if (result.error) {
        membershipHelpers.renderApiResponse(result);
        return;
    }
    var customerNo = getCustomerNo();
    var subscription = subscriptionHelpers.getSubscription(customerNo);
    if (!subscription) {
        membershipHelpers.renderApiResponse(membershipHelpers.errorResult('not-found'));
        return;
    }
    var c = subscription.custom;
    membershipHelpers.renderApiResponse(result, {
        planId: c.planID || null,
        status: c.status,
        entitled: subscriptionHelpers.isEntitled(subscription),
        startDate: c.startDate || null,
        expirationDate: c.expirationDate || null,
        paidThroughDate: c.paidThroughDate || null,
        autoRenewEnabled: c.autoRenewEnabled === true,
        benefits: benefitHelpers.getAvailableBenefits(customerNo)
    });
};
exports.getMyMembership.public = true;

exports.cancelMyMembership = function () {
    var result = checkCustomer();
    if (result.error) {
        membershipHelpers.renderApiResponse(result);
        return;
    }
    var outcome = subscriptionHelpers.cancelMembership(getCustomerNo(), 'customer:' + getCustomerNo());
    membershipHelpers.renderApiResponse(outcome, outcome.error ? null : { effectiveDate: outcome.effectiveDate });
};
exports.cancelMyMembership.public = true;

exports.listMyTransactions = function () {
    var result = checkCustomer();
    membershipHelpers.renderApiResponse(result, result.error ? null : { data: paymentHelpers.getHistory(getCustomerNo(), getLimit()) });
};
exports.listMyTransactions.public = true;
