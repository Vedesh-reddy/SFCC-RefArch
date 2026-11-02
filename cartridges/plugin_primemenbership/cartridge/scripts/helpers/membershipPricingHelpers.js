'use strict';

/**
 * Upgrade proration in integer cents and whole seconds, so a leap year needs no special case:
 * the ratio comes from the real length of the term.
 *
 *   unused credit = value paid for the current segment x remaining / segment length
 *   target cost   = target annual price x remaining / term length
 *   charge        = target cost - unused credit
 *
 * The paid value and the start of its segment are kept on the membership (creditBaseCents,
 * creditFromDate). An upgrade restarts the segment with the target cost as its value, and a
 * refund lowers the value. That accounts for earlier upgrades and refunds without replaying
 * the transaction history.
 */

/**
 * @param {Object} input - {valueCents, creditFromMs, termStartMs, expiresMs, targetAnnualCents, nowMs}
 * @returns {Object} {remainingSeconds, termSeconds, unusedCreditCents, targetCostCents, chargeCents}
 */
function calculateUpgrade(input) {
    var remainingSeconds = Math.floor((input.expiresMs - input.nowMs) / 1000);
    var termSeconds = Math.floor((input.expiresMs - input.termStartMs) / 1000);
    var segmentSeconds = Math.floor((input.expiresMs - input.creditFromMs) / 1000);
    if (remainingSeconds <= 0 || termSeconds <= 0 || segmentSeconds <= 0) {
        return { remainingSeconds: Math.max(remainingSeconds, 0), termSeconds: termSeconds, unusedCreditCents: 0, targetCostCents: 0, chargeCents: 0 };
    }
    var unusedCreditCents = Math.round((input.valueCents * Math.min(remainingSeconds, segmentSeconds)) / segmentSeconds);
    var targetCostCents = Math.round((input.targetAnnualCents * remainingSeconds) / termSeconds);
    return {
        remainingSeconds: remainingSeconds,
        termSeconds: termSeconds,
        unusedCreditCents: unusedCreditCents,
        targetCostCents: targetCostCents,
        chargeCents: targetCostCents - unusedCreditCents
    };
}

/**
 * @param {dw.object.CustomObject} subscription - membership
 * @param {Object} targetPlan - plan
 * @param {number} nowMs - now
 * @returns {Object} upgrade figures for this membership
 */
function calculateMembershipUpgrade(subscription, targetPlan, nowMs) {
    var c = subscription.custom;
    return calculateUpgrade({
        valueCents: c.creditBaseCents || 0,
        creditFromMs: c.creditFromDate.getTime(),
        termStartMs: c.startDate.getTime(),
        expiresMs: c.expirationDate.getTime(),
        targetAnnualCents: targetPlan.annualPriceCents,
        nowMs: nowMs
    });
}

module.exports = {
    calculateUpgrade: calculateUpgrade,
    calculateMembershipUpgrade: calculateMembershipUpgrade
};
