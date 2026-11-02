'use strict';

var assert = require('chai').assert;
var harness = require('../fixtures/harness');

var DAY = 86400000;

function pricing() { return harness().require('scripts/helpers/membershipPricingHelpers'); }

function term(startIso, endIso) {
    return { termStartMs: Date.parse(startIso), creditFromMs: Date.parse(startIso), expiresMs: Date.parse(endIso) };
}

describe('upgrade proration', function () {
    it('charges the documented $750 for Prime to Ultra Prime at 50% of the term', function () {
        var t = term('2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z');
        var result = pricing().calculateUpgrade(Object.assign({ valueCents: 100000, targetAnnualCents: 250000, nowMs: (t.termStartMs + t.expiresMs) / 2 }, t));
        assert.equal(result.chargeCents, 75000);
        assert.equal(result.unusedCreditCents, 50000);
        assert.equal(result.targetCostCents, 125000);
    });

    it('charges the full difference immediately after purchase', function () {
        var t = term('2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z');
        assert.equal(pricing().calculateUpgrade(Object.assign({ valueCents: 100000, targetAnnualCents: 500000, nowMs: t.termStartMs }, t)).chargeCents, 400000);
    });

    it('charges almost nothing on the final day', function () {
        var t = term('2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z');
        var charge = pricing().calculateUpgrade(Object.assign({ valueCents: 100000, targetAnnualCents: 250000, nowMs: t.expiresMs - DAY }, t)).chargeCents;
        assert.equal(charge, Math.round(150000 / 365));
    });

    it('gives nothing to charge after expiration', function () {
        var t = term('2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z');
        var result = pricing().calculateUpgrade(Object.assign({ valueCents: 100000, targetAnnualCents: 250000, nowMs: t.expiresMs + DAY }, t));
        assert.equal(result.chargeCents, 0);
        assert.equal(result.remainingSeconds, 0);
    });

    it('uses the real length of a leap year term', function () {
        var t = term('2028-01-01T00:00:00Z', '2029-01-01T00:00:00Z');
        var result = pricing().calculateUpgrade(Object.assign({ valueCents: 100000, targetAnnualCents: 250000, nowMs: t.termStartMs + 183 * DAY }, t));
        assert.equal(result.termSeconds, 366 * 86400);
        assert.equal(result.chargeCents, 75000);
    });

    it('treats a term across Feb 29 the same way', function () {
        var t = term('2027-06-01T00:00:00Z', '2028-06-01T00:00:00Z');
        assert.equal(pricing().calculateUpgrade(Object.assign({ valueCents: 100000, targetAnnualCents: 250000, nowMs: t.termStartMs }, t)).termSeconds, 366 * 86400);
    });

    it('credits a previous upgrade correctly: Prime to Ultra at 50%, Ultra to Max at 75%', function () {
        var start = Date.parse('2026-01-01T00:00:00Z');
        var end = Date.parse('2027-01-01T00:00:00Z');
        var span = end - start;
        var p = pricing();
        var first = p.calculateUpgrade({ valueCents: 100000, targetAnnualCents: 250000, termStartMs: start, creditFromMs: start, expiresMs: end, nowMs: start + span * 0.5 });
        assert.equal(first.chargeCents, 75000);
        var second = p.calculateUpgrade({ valueCents: first.targetCostCents, targetAnnualCents: 500000, termStartMs: start, creditFromMs: start + span * 0.5, expiresMs: end, nowMs: start + span * 0.75 });
        assert.equal(second.unusedCreditCents, 62500);
        assert.equal(second.targetCostCents, 125000);
        assert.equal(second.chargeCents, 62500);
    });

    it('charges two later steps less than one direct upgrade at the first step, since Max started later', function () {
        var start = Date.parse('2026-01-01T00:00:00Z');
        var end = Date.parse('2027-01-01T00:00:00Z');
        var span = end - start;
        var p = pricing();
        var first = p.calculateUpgrade({ valueCents: 100000, targetAnnualCents: 250000, termStartMs: start, creditFromMs: start, expiresMs: end, nowMs: start + span * 0.25 });
        var second = p.calculateUpgrade({ valueCents: first.targetCostCents, targetAnnualCents: 500000, termStartMs: start, creditFromMs: start + span * 0.25, expiresMs: end, nowMs: start + span * 0.5 });
        var direct = p.calculateUpgrade({ valueCents: 100000, targetAnnualCents: 500000, termStartMs: start, creditFromMs: start, expiresMs: end, nowMs: start + span * 0.25 });
        assert.equal(first.chargeCents + second.chargeCents, 112500 + 125000);
        assert.isBelow(first.chargeCents + second.chargeCents, direct.chargeCents);
    });

    it('lowers the credit after a refund, so the charge is higher', function () {
        var t = term('2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z');
        var now = (t.termStartMs + t.expiresMs) / 2;
        var plain = pricing().calculateUpgrade(Object.assign({ valueCents: 100000, targetAnnualCents: 250000, nowMs: now }, t)).chargeCents;
        var refunded = pricing().calculateUpgrade(Object.assign({ valueCents: 80000, targetAnnualCents: 250000, nowMs: now }, t)).chargeCents;
        assert.equal(refunded, plain + 10000);
    });

    it('keeps the proration formula after an early renewal, when the remaining term is over a year', function () {
        var start = Date.parse('2026-12-01T00:00:00Z');
        var end = Date.parse('2027-12-01T00:00:00Z');
        var now = Date.parse('2026-11-01T00:00:00Z');
        var unusedAtRenewal = Math.round(100000 * 30 / 365);
        var result = pricing().calculateUpgrade({ valueCents: unusedAtRenewal + 100000, targetAnnualCents: 250000, termStartMs: start, creditFromMs: now, expiresMs: end, nowMs: now });
        var ratio = (end - now) / (end - start);
        assert.closeTo(result.chargeCents, 150000 * ratio, 100);
    });

    it('returns whole cents', function () {
        var t = term('2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z');
        for (var i = 1; i < 50; i++) {
            var r = pricing().calculateUpgrade(Object.assign({ valueCents: 99999, targetAnnualCents: 250001, nowMs: t.termStartMs + i * 7 * DAY + 12345 }, t));
            assert.strictEqual(r.chargeCents, Math.floor(r.chargeCents));
            assert.strictEqual(r.chargeCents, r.targetCostCents - r.unusedCreditCents);
        }
    });

    it('stays in the safe integer range at the highest allowed price and longest term', function () {
        var t = term('2026-01-01T00:00:00Z', '2029-01-01T00:00:00Z');
        var r = pricing().calculateUpgrade(Object.assign({ valueCents: 5000000, targetAnnualCents: 10000000, nowMs: t.termStartMs + 1000 }, t));
        assert.isTrue(Number.isSafeInteger(10000000 * r.remainingSeconds));
        assert.isAbove(r.chargeCents, 0);
    });

    it('adds calendar months with month-end clamping', function () {
        var helpers = harness().require('scripts/helpers/membershipHelpers');
        assert.equal(helpers.addMonths(new Date('2028-02-29T10:00:00Z'), 12).toISOString(), '2029-02-28T10:00:00.000Z');
        assert.equal(helpers.addMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString(), '2026-02-28T00:00:00.000Z');
        assert.equal(helpers.addMonths(new Date('2026-03-15T00:00:00Z'), 12).toISOString(), '2027-03-15T00:00:00.000Z');
    });

    it('parses money without float drift and refuses bad input', function () {
        var helpers = harness().require('scripts/helpers/membershipHelpers');
        assert.equal(helpers.toCents('19.99'), 1999);
        assert.equal(helpers.toCents('1000'), 100000);
        assert.equal(helpers.toCents('0.07'), 7);
        ['abc', '-5', '1.999', '', null].forEach(function (bad) { assert.isNull(helpers.toCents(bad), String(bad)); });
    });

    it('rounds money objects to cents', function () {
        var h = harness();
        var helpers = h.require('scripts/helpers/membershipHelpers');
        assert.equal(helpers.centsOf(new h.Money(19.99, 'USD')), 1999);
        assert.equal(helpers.centsOf(new h.Money(1.005 * 100 / 100, 'USD')), 100);
        assert.equal(helpers.centsOf(new h.Money(null, 'USD')), 0);
    });
});
