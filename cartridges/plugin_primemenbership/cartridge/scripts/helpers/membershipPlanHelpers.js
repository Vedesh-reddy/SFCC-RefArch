'use strict';

/**
 * Membership plans: reading, validation and the storefront view. A plan's benefits are JSON
 * in its custom object. Anything financial in that JSON that is missing or out of range makes
 * the plan invalid, and an invalid plan cannot be sold and grants nothing (fail closed).
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var membershipHelpers = require('*/cartridge/scripts/helpers/membershipHelpers');

var TYPE = 'PrimeMembershipPlan';
var CURRENCY = 'USD';
// Proration multiplies cents by seconds; above this, 36 months would pass the safe integer range.
var MAX_PRICE_CENTS = 10000000;
// The platform's limit for a text attribute.
var MAX_BENEFITS_LENGTH = 4000;
var POLICIES = ['exclude-promoted', 'stack', 'best-of'];
var REVERSALS = ['restore', 'keep'];

/**
 * Every benefit the engine knows. "integration" names the external dependency a benefit needs
 * to be real; without it the benefit is shown as not yet available, never as active.
 */
var BENEFITS = {
    'free-shipping': { order: 1, monetary: true },
    'member-discount': { order: 2, monetary: true },
    'early-access': { order: 3 },
    'exclusive-deals': { order: 4, monetary: true },
    'birthday-reward': { order: 5 },
    'priority-support': { order: 6, integration: 'support' },
    'extended-returns': { order: 7, integration: 'returns' },
    'loyalty-multiplier': { order: 8, integration: 'loyalty' },
    'gift-wrap': { order: 9, integration: 'gift-wrap' },
    'launch-access': { order: 10 },
    'monthly-voucher': { order: 11 },
    'vip-event': { order: 12 }
};

/**
 * @param {*} value - value
 * @returns {boolean} true for a positive integer
 */
function isPositiveInt(value) {
    return typeof value === 'number' && Math.floor(value) === value && value > 0;
}

/**
 * @param {*} value - value
 * @returns {boolean} true for an array of non-empty strings
 */
function isIdList(value) {
    return Array.isArray(value) && value.every(function (id) { return typeof id === 'string' && id.length > 0 && id.length <= 256; });
}

/**
 * @param {Object} benefit - benefit configuration
 * @param {string} id - benefit ID
 * @param {string[]} problems - collects problems
 */
function checkCaps(benefit, id, problems) {
    if (!isPositiveInt(benefit.perOrderCapCents)) problems.push(id + ': per-order cap is required');
    if (!isPositiveInt(benefit.annualCapCents)) problems.push(id + ': annual cap is required');
    if (isPositiveInt(benefit.perOrderCapCents) && isPositiveInt(benefit.annualCapCents) && benefit.perOrderCapCents > benefit.annualCapCents) problems.push(id + ': per-order cap exceeds annual cap');
}

/**
 * @param {string} id - benefit ID
 * @param {Object} benefit - benefit configuration
 * @returns {string[]} problems, empty when valid
 */
function validateBenefit(id, benefit) {
    var problems = [];
    var fail = function (message) { problems.push(id + ': ' + message); };
    if (!BENEFITS[id]) {
        fail('unknown benefit');
        return problems;
    }
    if (typeof benefit !== 'object' || benefit === null) {
        fail('configuration is missing');
        return problems;
    }
    if (benefit.enabled !== true) return problems;
    if (BENEFITS[id].monetary) checkCaps(benefit, id, problems);
    ['excludedProductIDs', 'excludedCategoryIDs', 'includedCategoryIDs', 'countries', 'customerGroupIDs'].forEach(function (list) {
        if (benefit[list] !== undefined && !isIdList(benefit[list])) fail(list + ' must be a list of IDs');
    });
    ['validFrom', 'validTo'].forEach(function (name) {
        if (benefit[name] !== undefined && !(Date.parse(benefit[name]) > 0)) fail(name + ' must be a date');
    });
    if (benefit.maxUsesPerPeriod !== undefined && !isPositiveInt(benefit.maxUsesPerPeriod)) fail('maxUsesPerPeriod must be a positive whole number');
    if (benefit.reversal !== undefined && REVERSALS.indexOf(benefit.reversal) < 0) fail('reversal must be restore or keep');
    if (id === 'member-discount') {
        var max = membershipHelpers.getPreference('primeMembershipMaxDiscountPercent');
        if (typeof benefit.percent !== 'number' || !(benefit.percent > 0) || benefit.percent > max) fail('percent must be above 0 and at most ' + max);
        if (POLICIES.indexOf(benefit.promotionPolicy) < 0) fail('promotionPolicy must be one of ' + POLICIES.join(', '));
    }
    if (id === 'free-shipping' && (!isIdList(benefit.methodIDs) || !benefit.methodIDs.length)) fail('at least one shipping method is required');
    if ((id === 'early-access' || id === 'launch-access') && !isPositiveInt(benefit.hours)) fail('hours must be a positive whole number');
    if (id === 'extended-returns' && !isPositiveInt(benefit.days)) fail('days must be a positive whole number');
    if (id === 'loyalty-multiplier' && !(typeof benefit.multiplier === 'number' && benefit.multiplier > 1)) fail('multiplier must be above 1');
    if (id === 'exclusive-deals') {
        if (!Array.isArray(benefit.deals)) {
            fail('deals must be a list');
        } else {
            benefit.deals.forEach(function (deal, index) {
                if (!deal || !(deal.percent > 0) || deal.percent > membershipHelpers.getPreference('primeMembershipMaxDiscountPercent')) fail('deal ' + index + ': percent is out of range');
                if (!deal || (!isIdList(deal.productIDs) && !isIdList(deal.categoryIDs))) fail('deal ' + index + ': products or categories are required');
            });
        }
    }
    if (id === 'vip-event' && !Array.isArray(benefit.events)) fail('events must be a list');
    return problems;
}

/**
 * @param {Object} input - {planName, planRank, annualPriceCents, currency, validityMonths, benefits}
 * @returns {string[]} problems, empty when the plan is safe to sell
 */
function validatePlanConfig(input) {
    var problems = [];
    if (!input.planName) problems.push('plan name is required');
    if (!isPositiveInt(input.planRank)) problems.push('rank must be a positive whole number');
    if (!isPositiveInt(input.annualPriceCents)) problems.push('price must be above zero');
    if (input.annualPriceCents > MAX_PRICE_CENTS) problems.push('price is too high');
    if (input.currency !== CURRENCY) problems.push('only ' + CURRENCY + ' is supported');
    if (!isPositiveInt(input.validityMonths) || input.validityMonths > 36) problems.push('validity must be 1 to 36 months');
    if (typeof input.benefits !== 'object' || input.benefits === null || Array.isArray(input.benefits)) {
        problems.push('benefits must be a JSON object');
    } else {
        Object.keys(input.benefits).forEach(function (id) {
            problems = problems.concat(validateBenefit(id, input.benefits[id]));
        });
    }
    return problems;
}

/**
 * @param {dw.object.CustomObject} record - plan
 * @returns {Object} plain plan, with valid=false when its configuration can't be trusted
 */
function toPlan(record) {
    var c = record.custom;
    var plan = {
        planID: c.planID,
        planName: c.planName,
        planRank: c.planRank,
        annualPriceCents: c.annualPriceCents,
        currency: c.currency,
        validityMonths: c.validityMonths,
        enabled: c.enabled === true,
        configurationVersion: c.configurationVersion || 1,
        benefits: membershipHelpers.parseJson(c.benefits, null)
    };
    plan.problems = validatePlanConfig(plan);
    plan.valid = plan.problems.length === 0;
    return plan;
}

/**
 * @param {string} planID - plan
 * @returns {?Object} plain plan, or null
 */
function getPlan(planID) {
    var record = CustomObjectMgr.getCustomObject(TYPE, String(planID || ''));
    return record ? toPlan(record) : null;
}

/**
 * @returns {Object[]} all plans by rank
 */
function getAllPlans() {
    return membershipHelpers.queryPage(TYPE, 'custom.planRank != NULL', 'custom.planRank asc', [], 0, 50).items.map(toPlan);
}

/**
 * @returns {Object[]} plans that can be sold
 */
function getSellablePlans() {
    return getAllPlans().filter(function (plan) { return plan.enabled && plan.valid; });
}

/**
 * Keeps the plugin closed until everything that money depends on is in place.
 * @returns {string[]} problems, empty when the plugin may run
 */
function getConfigurationProblems() {
    var problems = [];
    var Site = require('dw/system/Site');
    if (membershipHelpers.getPreference('primeMembershipCurrency') !== CURRENCY) problems.push('primeMembershipCurrency must be ' + CURRENCY);
    if (Site.getCurrent().getDefaultCurrency() !== CURRENCY) problems.push('the site currency must be ' + CURRENCY);
    if (!membershipHelpers.getListPreference('primeMembershipPaymentMethods').length) problems.push('primeMembershipPaymentMethods is empty');
    if (!membershipHelpers.getListPreference('primeMembershipBillingCountries').length) problems.push('primeMembershipBillingCountries is empty');
    if (!membershipHelpers.getPreference('primeMembershipFromEmail')) problems.push('primeMembershipFromEmail is empty');
    var feeID = membershipHelpers.getPreference('primeMembershipFeeProductID');
    if (!feeID) problems.push('primeMembershipFeeProductID is empty');
    else if (require('dw/catalog/ProductMgr').getProduct(feeID)) problems.push('primeMembershipFeeProductID must not exist in the catalog');
    var minutes = membershipHelpers.getPreference('primeMembershipQuoteMinutes');
    if (!(minutes > 0 && minutes < 15)) problems.push('primeMembershipQuoteMinutes must be 1 to 14');
    // A plan that is off isn't sold, so it can wait; the plan editor still shows what is wrong with it.
    var plans = getAllPlans().filter(function (plan) { return plan.enabled; });
    if (!plans.length) problems.push('no membership plan is on sale');
    plans.forEach(function (plan) {
        plan.problems.forEach(function (problem) { problems.push(plan.planID + ' ' + problem); });
    });
    var ranks = {};
    plans.forEach(function (plan) {
        if (ranks[plan.planRank]) problems.push('plans ' + ranks[plan.planRank] + ' and ' + plan.planID + ' share a rank');
        ranks[plan.planRank] = plan.planID;
    });
    return problems;
}

/**
 * @returns {boolean} true when switched on and for USD. The per-plan validity is checked where
 * a plan is used, so this stays cheap enough for every basket calculation.
 */
function isEnabled() {
    return membershipHelpers.getPreference('primeMembershipEnabled') === true
        && membershipHelpers.getPreference('primeMembershipCurrency') === CURRENCY
        && require('dw/system/Site').getCurrent().getDefaultCurrency() === CURRENCY;
}

/**
 * Saves a plan after validation. Prices apply to future quotes only; a paid membership keeps
 * its paid value, because proration uses the stored credit and not the plan price.
 * @param {string} planID - plan
 * @param {Object} input - plan fields
 * @param {string} actor - audit actor
 * @returns {Object} result
 */
function savePlan(planID, input, actor) {
    if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(String(planID || ''))) return membershipHelpers.errorResult('invalid', { planID: 'invalid' });
    var plan = {
        planName: String(input.planName || '').trim().slice(0, 100),
        planRank: Number(input.planRank),
        annualPriceCents: membershipHelpers.toCents(input.annualPrice),
        currency: String(input.currency || CURRENCY),
        validityMonths: Number(input.validityMonths),
        enabled: input.enabled === true || input.enabled === 'true',
        benefits: membershipHelpers.parseJson(input.benefits, null)
    };
    var problems = validatePlanConfig(plan);
    if (JSON.stringify(plan.benefits).length > MAX_BENEFITS_LENGTH) problems.push('benefits are longer than ' + MAX_BENEFITS_LENGTH + ' characters');
    if (problems.length) {
        var result = membershipHelpers.errorResult('invalid-plan');
        result.problems = problems;
        return result;
    }
    Transaction.wrap(function () {
        var record = CustomObjectMgr.getCustomObject(TYPE, planID);
        var previous = record ? JSON.stringify({ price: record.custom.annualPriceCents, enabled: record.custom.enabled, version: record.custom.configurationVersion }) : null;
        if (!record) {
            record = CustomObjectMgr.createCustomObject(TYPE, planID);
            record.custom.createdAt = new Date();
        }
        record.custom.planName = plan.planName;
        record.custom.planRank = plan.planRank;
        record.custom.annualPriceCents = plan.annualPriceCents;
        record.custom.currency = plan.currency;
        record.custom.validityMonths = plan.validityMonths;
        record.custom.enabled = plan.enabled;
        record.custom.benefits = JSON.stringify(plan.benefits);
        record.custom.configurationVersion = (record.custom.configurationVersion || 0) + 1;
        record.custom.updatedAt = new Date();
        membershipHelpers.audit('plan-saved', actor, 'plan:' + planID, previous, JSON.stringify({ price: plan.annualPriceCents, enabled: plan.enabled, version: record.custom.configurationVersion }), null);
    });
    return { error: false };
}

/**
 * @param {Object} plan - plan
 * @returns {string[]} IDs of the enabled benefits, in display order
 */
function getEnabledBenefitIds(plan) {
    return Object.keys(plan.benefits || {}).filter(function (id) {
        return plan.benefits[id] && plan.benefits[id].enabled === true;
    }).sort(function (a, b) { return BENEFITS[a].order - BENEFITS[b].order; });
}

/**
 * @param {Object} plan - plan
 * @param {string} id - benefit ID
 * @returns {string} what the benefit gives on this plan, from its configuration
 */
function describeBenefit(plan, id) {
    var Resource = require('dw/web/Resource');
    var b = plan.benefits[id];
    var values = [];
    if (id === 'member-discount') values = [String(b.percent), membershipHelpers.formatCents(b.perOrderCapCents), membershipHelpers.formatCents(b.annualCapCents)];
    if (id === 'free-shipping') values = [membershipHelpers.formatCents(b.annualCapCents)];
    if (id === 'early-access' || id === 'launch-access') values = [String(b.hours)];
    if (id === 'extended-returns') values = [String(b.days)];
    if (id === 'loyalty-multiplier') values = [String(b.multiplier)];
    return Resource.msgf('benefit.' + id, membershipHelpers.BUNDLE, null, values[0] || '', values[1] || '', values[2] || '');
}

/**
 * @param {Object} plan - plan
 * @returns {Object} storefront view: numbers as strings, because ISML prints JS numbers as 0.0
 */
function getPlanView(plan) {
    return {
        planID: plan.planID,
        planName: plan.planName,
        planRank: plan.planRank,
        price: membershipHelpers.formatCents(plan.annualPriceCents),
        validityMonths: String(plan.validityMonths),
        benefits: getEnabledBenefitIds(plan).map(function (id) {
            return { id: id, text: describeBenefit(plan, id) };
        })
    };
}

module.exports = {
    BENEFITS: BENEFITS,
    getPlan: getPlan,
    getAllPlans: getAllPlans,
    getSellablePlans: getSellablePlans,
    getConfigurationProblems: getConfigurationProblems,
    isEnabled: isEnabled,
    validatePlanConfig: validatePlanConfig,
    validateBenefit: validateBenefit,
    savePlan: savePlan,
    getEnabledBenefitIds: getEnabledBenefitIds,
    describeBenefit: describeBenefit,
    getPlanView: getPlanView
};
