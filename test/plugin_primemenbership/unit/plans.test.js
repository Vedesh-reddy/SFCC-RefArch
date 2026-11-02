'use strict';

var assert = require('chai').assert;
var harness = require('../fixtures/harness');
var fixtures = require('../fixtures/fixtures');

function planHelpers(h) { return h.require('scripts/helpers/membershipPlanHelpers'); }

function validPlan(overrides) {
    return Object.assign({ planName: 'X', planRank: 9, annualPriceCents: 1000, currency: 'USD', validityMonths: 12, benefits: {} }, overrides || {});
}

describe('membership plans', function () {
    var h;
    beforeEach(function () { h = harness(); });

    describe('shipped values', function () {
        var seeds = fixtures.seedPlans();
        var byId = {};
        seeds.forEach(function (p) { byId[p.planID] = p; });

        it('ships three plans at $1,000, $2,500 and $5,000 in USD for 12 months', function () {
            assert.deepEqual(seeds.map(function (p) { return p.annualPriceCents; }), [100000, 250000, 500000]);
            seeds.forEach(function (p) {
                assert.equal(p.currency, 'USD');
                assert.equal(p.validityMonths, 12);
            });
        });

        it('gives Prime 5, Ultra Prime 8 and Ultra Prime Max 12 benefits', function () {
            assert.lengthOf(Object.keys(byId.prime.benefits), 5);
            assert.lengthOf(Object.keys(byId['ultra-prime'].benefits), 8);
            assert.lengthOf(Object.keys(byId['ultra-prime-max'].benefits), 12);
        });

        it('sets 5%, 10% and 15% discounts and 12, 24 and 48 hours of early access', function () {
            assert.deepEqual(seeds.map(function (p) { return p.benefits['member-discount'].percent; }), [5, 10, 15]);
            assert.deepEqual(seeds.map(function (p) { return p.benefits['early-access'].hours; }), [12, 24, 48]);
        });

        it('sets 45 and 60 day returns and double and triple points', function () {
            assert.equal(byId['ultra-prime'].benefits['extended-returns'].days, 45);
            assert.equal(byId['ultra-prime-max'].benefits['extended-returns'].days, 60);
            assert.equal(byId['ultra-prime'].benefits['loyalty-multiplier'].multiplier, 2);
            assert.equal(byId['ultra-prime-max'].benefits['loyalty-multiplier'].multiplier, 3);
        });

        it('caps every monetary benefit, on every plan', function () {
            seeds.forEach(function (p) {
                ['free-shipping', 'member-discount', 'exclusive-deals'].forEach(function (id) {
                    assert.isAbove(p.benefits[id].perOrderCapCents, 0, p.planID + ' ' + id);
                    assert.isAbove(p.benefits[id].annualCapCents, 0, p.planID + ' ' + id);
                });
            });
        });

        it('ships disabled until a merchant has finished the configuration', function () {
            seeds.forEach(function (p) { assert.isFalse(p.enabled); });
            assert.isFalse(fixtures.seedPlans().some(function (p) { return p.benefits['free-shipping'].methodIDs.length > 0; }));
        });

        it('makes a higher plan at least as good as a lower one on every shared benefit', function () {
            seeds.slice(1).forEach(function (plan, index) {
                var lower = seeds[index].benefits;
                var higher = plan.benefits;
                Object.keys(lower).forEach(function (id) { assert.property(higher, id); });
                assert.isAbove(higher['member-discount'].annualCapCents, lower['member-discount'].annualCapCents);
                assert.isAbove(higher['free-shipping'].annualCapCents, lower['free-shipping'].annualCapCents);
            });
        });
    });

    describe('validation', function () {
        it('accepts a minimal valid plan', function () {
            assert.deepEqual(planHelpers(h).validatePlanConfig(validPlan()), []);
        });

        it('rejects other currencies', function () {
            assert.include(planHelpers(h).validatePlanConfig(validPlan({ currency: 'EUR' })).join(), 'USD');
        });

        it('rejects a zero, negative or fractional price', function () {
            [0, -1, 10.5].forEach(function (cents) {
                assert.isAbove(planHelpers(h).validatePlanConfig(validPlan({ annualPriceCents: cents })).length, 0, String(cents));
            });
        });

        it('refuses a price so high that proration could lose precision', function () {
            assert.include(planHelpers(h).validatePlanConfig(validPlan({ annualPriceCents: 10000001 })).join(), 'too high');
            assert.deepEqual(planHelpers(h).validatePlanConfig(validPlan({ annualPriceCents: 10000000 })), []);
        });

        it('rejects an unknown benefit', function () {
            assert.include(planHelpers(h).validatePlanConfig(validPlan({ benefits: { unlimited: { enabled: true } } })).join(), 'unknown benefit');
        });

        it('refuses a discount without caps, so nothing is unlimited by default', function () {
            var problems = planHelpers(h).validateBenefit('member-discount', { enabled: true, percent: 5, promotionPolicy: 'stack' });
            assert.include(problems.join(), 'per-order cap');
            assert.include(problems.join(), 'annual cap');
        });

        it('refuses a discount above the configured maximum percent', function () {
            var problems = planHelpers(h).validateBenefit('member-discount', { enabled: true, percent: 51, promotionPolicy: 'stack', perOrderCapCents: 1, annualCapCents: 1 });
            assert.include(problems.join(), 'percent');
        });

        it('refuses a per-order cap above the annual cap', function () {
            var problems = planHelpers(h).validateBenefit('free-shipping', { enabled: true, methodIDs: ['a'], perOrderCapCents: 200, annualCapCents: 100 });
            assert.include(problems.join(), 'exceeds');
        });

        it('refuses free shipping without shipping methods', function () {
            assert.include(planHelpers(h).validateBenefit('free-shipping', { enabled: true, methodIDs: [], perOrderCapCents: 1, annualCapCents: 1 }).join(), 'shipping method');
        });

        it('does not validate the settings of a benefit that is switched off', function () {
            assert.deepEqual(planHelpers(h).validateBenefit('member-discount', { enabled: false }), []);
        });

        it('refuses a deal with an out-of-range percent or nothing to apply to', function () {
            var benefit = { enabled: true, perOrderCapCents: 1, annualCapCents: 1, deals: [{ percent: 99, productIDs: ['a'] }, { percent: 5 }] };
            var problems = planHelpers(h).validateBenefit('exclusive-deals', benefit).join();
            assert.include(problems, 'deal 0');
            assert.include(problems, 'deal 1');
        });
    });

    describe('reading plans', function () {
        beforeEach(function () { fixtures.plans(h); });

        it('sells only enabled, valid plans', function () {
            assert.lengthOf(planHelpers(h).getSellablePlans(), 3);
            h.get('PrimeMembershipPlan', 'prime').custom.enabled = false;
            assert.deepEqual(planHelpers(h).getSellablePlans().map(function (p) { return p.planID; }), ['ultra-prime', 'ultra-prime-max']);
        });

        it('treats broken benefit JSON as an invalid plan, which is not sold', function () {
            h.get('PrimeMembershipPlan', 'prime').custom.benefits = '{not json';
            assert.isFalse(planHelpers(h).getPlan('prime').valid);
            assert.notInclude(planHelpers(h).getSellablePlans().map(function (p) { return p.planID; }), 'prime');
        });

        it('sorts plans by rank', function () {
            assert.deepEqual(planHelpers(h).getAllPlans().map(function (p) { return p.planRank; }), [1, 2, 3]);
        });

        it('describes benefits from the configuration, not from fixed text', function () {
            var plan = planHelpers(h).getPlan('prime');
            plan.benefits['member-discount'].percent = 7;
            assert.include(planHelpers(h).describeBenefit(plan, 'member-discount'), '7%');
        });

        it('passes numbers to the view as strings, because ISML would print 12.0', function () {
            assert.strictEqual(planHelpers(h).getPlanView(planHelpers(h).getPlan('prime')).validityMonths, '12');
            assert.equal(planHelpers(h).getPlanView(planHelpers(h).getPlan('prime')).price, '$1,000.00');
        });
    });

    describe('saving plans', function () {
        beforeEach(function () { fixtures.plans(h); });

        function input(overrides) {
            return Object.assign({ planName: 'Prime', planRank: '1', annualPrice: '1200.50', validityMonths: '12', enabled: 'true', benefits: '{}' }, overrides || {});
        }

        it('saves a valid plan, bumps the version and audits it', function () {
            var result = planHelpers(h).savePlan('prime', input(), 'admin:ops');
            assert.isFalse(result.error);
            var record = h.get('PrimeMembershipPlan', 'prime').custom;
            assert.equal(record.annualPriceCents, 120050);
            assert.equal(record.configurationVersion, 2);
            assert.isTrue(h.rows('PrimeMembershipAudit').some(function (a) { return a.custom.action === 'plan-saved' && a.custom.actorReference === 'admin:ops'; }));
        });

        it('refuses an invalid plan and changes nothing', function () {
            var result = planHelpers(h).savePlan('prime', input({ annualPrice: '-5' }), 'admin:ops');
            assert.isTrue(result.error);
            assert.equal(h.get('PrimeMembershipPlan', 'prime').custom.annualPriceCents, 100000);
        });

        it('refuses benefits that are not JSON', function () {
            assert.equal(planHelpers(h).savePlan('prime', input({ benefits: '{{{' }), 'admin:ops').errorCode, 'invalid-plan');
        });

        it('refuses benefits longer than the platform allows for a text attribute', function () {
            var deals = [];
            for (var i = 0; i < 200; i++) deals.push({ percent: 5, productIDs: ['product-number-' + i] });
            var benefits = JSON.stringify({ 'exclusive-deals': { enabled: true, perOrderCapCents: 1, annualCapCents: 1, deals: deals } });
            var result = planHelpers(h).savePlan('prime', input({ benefits: benefits }), 'admin:ops');
            assert.include(result.problems.join(), 'longer than');
        });

        it('refuses a plan ID with unsafe characters', function () {
            assert.isTrue(planHelpers(h).savePlan('<script>', input(), 'admin:ops').error);
        });
    });

    describe('configuration check', function () {
        it('reports no problems for a finished setup', function () {
            fixtures.plans(h);
            assert.deepEqual(planHelpers(h).getConfigurationProblems(), []);
        });

        it('refuses a site that does not use USD', function () {
            fixtures.plans(h);
            h.state.siteCurrency = 'EUR';
            assert.include(planHelpers(h).getConfigurationProblems().join(), 'site currency');
            assert.isFalse(planHelpers(h).isEnabled());
        });

        it('refuses a fee product that exists in the catalog', function () {
            fixtures.plans(h);
            fixtures.product(h, 'prime-membership-fee');
            assert.include(planHelpers(h).getConfigurationProblems().join(), 'must not exist');
        });

        it('refuses quotes that would outlive the temporary basket', function () {
            fixtures.plans(h);
            h.preferences.primeMembershipQuoteMinutes = 15;
            assert.include(planHelpers(h).getConfigurationProblems().join(), 'primeMembershipQuoteMinutes');
        });

        it('reports the shipped plans as unfinished until shipping methods are set', function () {
            fixtures.seedPlans().forEach(function (plan) {
                h.create('PrimeMembershipPlan', plan.planID, { planName: plan.planName, planRank: plan.planRank, annualPriceCents: plan.annualPriceCents, currency: 'USD', validityMonths: 12, enabled: true, benefits: JSON.stringify(plan.benefits) });
            });
            assert.include(planHelpers(h).getConfigurationProblems().join(), 'shipping method');
        });

        it('reports a shop with nothing on sale, as the shipped plans are', function () {
            fixtures.plans(h);
            h.rows('PrimeMembershipPlan').forEach(function (plan) { plan.custom.enabled = false; });
            assert.include(planHelpers(h).getConfigurationProblems().join(), 'no membership plan is on sale');
        });

        it('lets a merchant sell two plans while the third is unfinished and off', function () {
            fixtures.plans(h);
            var third = h.get('PrimeMembershipPlan', 'ultra-prime-max').custom;
            third.enabled = false;
            third.benefits = '{broken';
            assert.deepEqual(planHelpers(h).getConfigurationProblems(), []);
        });

        it('reports two plans with the same rank', function () {
            fixtures.plans(h, function (plan) { plan.planRank = 1; });
            assert.include(planHelpers(h).getConfigurationProblems().join(), 'share a rank');
        });

        it('stays closed while the master switch is off', function () {
            h.preferences.primeMembershipEnabled = false;
            assert.isFalse(planHelpers(h).isEnabled());
        });
    });
});
