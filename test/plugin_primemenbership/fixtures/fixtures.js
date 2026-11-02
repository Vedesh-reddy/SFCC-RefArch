'use strict';

var fs = require('fs');
var path = require('path');

var DAY = 86400000;
var SEED = path.resolve(__dirname, '../../../metadata/plugin_primemenbership/sites/RefArch_Practice/custom-objects/PrimeMembershipPlan.xml');

/**
 * @returns {Object[]} the plans as shipped in the site archive
 */
function seedPlans() {
    var xml = fs.readFileSync(SEED, 'utf8');
    return xml.split('<custom-object ').slice(1).map(function (chunk) {
        var attr = function (id) {
            var match = new RegExp('attribute-id="' + id + '">([^<]*)<').exec(chunk);
            return match ? match[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : null;
        };
        return {
            planID: /object-id="([^"]+)"/.exec(chunk)[1],
            planName: attr('planName'),
            planRank: Number(attr('planRank')),
            annualPriceCents: Number(attr('annualPriceCents')),
            currency: attr('currency'),
            validityMonths: Number(attr('validityMonths')),
            enabled: attr('enabled') === 'true',
            configurationVersion: Number(attr('configurationVersion')),
            benefits: JSON.parse(attr('benefits'))
        };
    });
}

/**
 * Imports the shipped plans and fills in what a merchant must set before selling.
 * @param {Object} h - harness
 * @param {Function} [change] - plan => void, for test-specific configuration
 */
function plans(h, change) {
    seedPlans().forEach(function (plan) {
        var benefits = plan.benefits;
        benefits['free-shipping'].methodIDs = ['standard'];
        if (benefits['birthday-reward']) benefits['birthday-reward'].couponID = 'birthday';
        if (benefits['monthly-voucher']) benefits['monthly-voucher'].couponID = 'monthly';
        if (benefits['priority-support']) benefits['priority-support'].contact = 'vip@example.com';
        if (change) change(plan);
        h.create('PrimeMembershipPlan', plan.planID, {
            planName: plan.planName,
            planRank: plan.planRank,
            annualPriceCents: plan.annualPriceCents,
            currency: plan.currency,
            validityMonths: plan.validityMonths,
            enabled: true,
            configurationVersion: plan.configurationVersion,
            benefits: JSON.stringify(benefits)
        });
    });
}

/**
 * @param {Object} h - harness
 * @param {string} customerNo - customer
 * @param {string} planID - plan
 * @param {Object} [o] - {status, startMs, expiresMs, valueCents, counters}
 * @returns {Object} an active membership record
 */
function member(h, customerNo, planID, o) {
    var opts = o || {};
    var start = opts.startMs || Date.now() - 30 * DAY;
    var expires = opts.expiresMs || start + 365 * DAY;
    return h.create('PrimeMembershipSubscription', customerNo, {
        customerNo: customerNo,
        siteID: 'RefArch_Practice',
        planID: planID,
        planVersion: 1,
        status: opts.status || 'ACTIVE',
        startDate: new Date(start),
        expirationDate: new Date(expires),
        paidThroughDate: new Date(expires),
        autoRenewEnabled: !!opts.autoRenew,
        autoRenewConsentAt: opts.autoRenew ? new Date(start) : null,
        marketingEmailsEnabled: opts.marketing !== false,
        creditBaseCents: opts.valueCents === undefined ? h.get('PrimeMembershipPlan', planID).custom.annualPriceCents : opts.valueCents,
        creditFromDate: new Date(opts.creditFromMs || start),
        benefitPeriodStart: new Date(start),
        benefitPeriodEnd: new Date(start + 365 * DAY),
        benefitCounters: JSON.stringify(opts.counters || {}),
        pendingTransactionID: opts.pending || null,
        createdAt: new Date(start),
        updatedAt: new Date(start)
    });
}

/**
 * @param {Object} h - harness
 * @param {string} id - product
 * @param {Object} [o] - {custom, categories, master}
 * @returns {Object} product registered in the catalog double
 */
function product(h, id, o) {
    var opts = o || {};
    var record = {
        ID: id,
        custom: opts.custom || {},
        masterProduct: opts.master || null,
        isVariant: function () { return !!opts.master; },
        categories: { toArray: function () { return (opts.categories || []).map(function (c) { return { ID: c, root: false, parent: { ID: 'root', root: true } }; }); } }
    };
    h.state.products[id] = record;
    return record;
}

/**
 * @param {Object} h - harness
 * @param {Object} [overrides] - basket spec overrides
 * @returns {Object} a member's basket with a $100 line and $10 standard shipping
 */
function basket(h, overrides) {
    product(h, 'P1');
    return h.basket(Object.assign({ customerNo: 'C1', lines: [{ productID: 'P1', cents: 10000 }], shipping: { methodID: 'standard', cents: 1000, country: 'US' } }, overrides || {}));
}

/**
 * Registers a coupon with single-use system codes.
 * @param {Object} h - harness
 * @param {string} id - coupon
 * @param {number} [count] - codes available
 */
function coupon(h, id, count) {
    var codes = [];
    for (var i = 0; i < (count === undefined ? 5 : count); i++) codes.push(id.toUpperCase() + '-' + i);
    h.state.coupons[id] = { codes: codes };
}

/**
 * @param {Object} h - harness
 * @param {string} name - form
 * @param {Object} values - field => value
 * @returns {Object} SFRA form double
 */
function form(h, name, values) {
    var model = { valid: true, clear: function () {} };
    Object.keys(values).forEach(function (key) {
        if (key === 'valid' || key === 'invalidCard') model[key] = values[key];
        else model[key] = { value: values[key], checked: values[key] === true, htmlName: key };
    });
    h.state.forms[name] = model; // eslint-disable-line no-param-reassign
    return model;
}

var ADDRESS = { firstName: 'Alex', lastName: 'Doe', address1: '1 Main St', address2: '', city: 'Boston', stateCode: 'MA', postalCode: '02110', countryCode: 'US', phone: '6175550100' };

/**
 * Walks a customer through review, billing and payment, as the routes do.
 * @param {Object} h - harness
 * @param {string} customerNo - customer
 * @param {string} type - PURCHASE, UPGRADE or RENEWAL
 * @param {string} planID - plan
 * @param {Object} [o] - {nonce, paid}
 * @returns {Object} {id, record, res}
 */
function checkout(h, customerNo, type, planID, o) {
    var opts = o || {};
    h.state.sessionCustomerNo = customerNo; // eslint-disable-line no-param-reassign
    form(h, 'primeMembershipSelect', { planID: planID, transactionType: type, nonce: opts.nonce || 'nonce-0001', acceptTerms: true });
    var start = h.route('PrimeMembership', 'StartCheckout', { customerNo: customerNo });
    if (!/PrimeMembership-Checkout/.test(start.redirectUrl)) return { res: start, record: null, id: null };
    var id = start.redirectUrl.split('/id/')[1];
    form(h, 'primeMembershipBilling', ADDRESS);
    h.route('PrimeMembership', 'SaveBilling', { customerNo: customerNo, query: { id: id } });
    form(h, 'primeMembershipPayment', { paymentMethod: 'CREDIT_CARD', invalidCard: !!opts.invalidCard });
    h.state.processorPays = opts.paid !== false; // eslint-disable-line no-param-reassign
    var res = h.route('PrimeMembership', 'PlaceOrder', { customerNo: customerNo, query: { id: id } });
    return { id: id, record: h.get('PrimeMembershipTransaction', id), res: res };
}

module.exports = {
    DAY: DAY,
    ADDRESS: ADDRESS,
    seedPlans: seedPlans,
    plans: plans,
    member: member,
    product: product,
    basket: basket,
    coupon: coupon,
    form: form,
    checkout: checkout
};
