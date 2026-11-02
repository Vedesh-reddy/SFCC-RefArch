'use strict';

/**
 * Daily metrics, built by the job and only read by Business Manager, so a report never runs an
 * expensive query in a request. Gross, refunds and net are kept apart, and member savings are
 * reported as a cost, not as revenue.
 */

var membershipHelpers = require('*/cartridge/scripts/helpers/membershipHelpers');
var planHelpers = require('*/cartridge/scripts/helpers/membershipPlanHelpers');

var STATUSES = ['PENDING_PAYMENT', 'ACTIVE', 'UPGRADE_PENDING', 'RENEWAL_PENDING', 'PAYMENT_FAILED', 'EXPIRED', 'CANCELLED', 'SUSPENDED', 'REFUND_PENDING'];
var REVENUE = { PURCHASE: 'membershipRevenueCents', UPGRADE: 'upgradeRevenueCents', RENEWAL: 'renewalRevenueCents' };

/**
 * @returns {Object} current member counts by status and plan
 */
function getLiveCounts() {
    var counts = { byStatus: {}, byPlan: {} };
    STATUSES.forEach(function (status) {
        counts.byStatus[status] = membershipHelpers.queryCount('PrimeMembershipSubscription', 'custom.status = {0}', [status]);
    });
    planHelpers.getAllPlans().forEach(function (plan) {
        counts.byPlan[plan.planID] = membershipHelpers.queryCount('PrimeMembershipSubscription', 'custom.planID = {0} AND custom.paidThroughDate > {1}', [plan.planID, new Date()]);
    });
    return counts;
}

/**
 * @param {string} day - yyyy-mm-dd
 * @param {number} limit - maximum records per kind
 * @returns {Object} the day's figures; complete=false when the limit cut the scan short
 */
function buildDailyReport(day, limit) {
    var from = new Date(day + 'T00:00:00.000Z');
    var to = new Date(from.getTime() + membershipHelpers.DAY);
    var report = {
        day: day,
        complete: true,
        newMembers: 0,
        upgrades: 0,
        renewals: 0,
        failedPayments: 0,
        quotes: 0,
        membershipRevenueCents: 0,
        upgradeRevenueCents: 0,
        renewalRevenueCents: 0,
        grossRevenueCents: 0,
        refundCents: 0,
        netRevenueCents: 0,
        memberSavingsCents: 0,
        redemptions: {},
        cancellations: membershipHelpers.queryCount('PrimeMembershipAudit', 'custom.newState = {0} AND custom.timestamp >= {1} AND custom.timestamp < {2}', ['CANCELLED', from, to]),
        expirations: membershipHelpers.queryCount('PrimeMembershipAudit', 'custom.newState = {0} AND custom.timestamp >= {1} AND custom.timestamp < {2}', ['EXPIRED', from, to])
    };
    var transactions = membershipHelpers.queryPage('PrimeMembershipTransaction', 'custom.createdAt >= {0} AND custom.createdAt < {1}', 'custom.createdAt asc', [from, to], 0, limit);
    if (transactions.total > limit) report.complete = false;
    transactions.items.forEach(function (record) {
        var c = record.custom;
        if (c.transactionType !== 'REFUND') report.quotes += 1;
        if (c.status === 'FAILED') report.failedPayments += 1;
        if (c.transactionType === 'REFUND' && c.status === 'COMPLETED') report.refundCents += c.amountCents;
        if (REVENUE[c.transactionType] && (c.status === 'COMPLETED' || c.status === 'REFUNDED')) {
            report[REVENUE[c.transactionType]] += c.amountCents;
            report.grossRevenueCents += c.amountCents;
            if (c.transactionType === 'PURCHASE') report.newMembers += 1;
            if (c.transactionType === 'UPGRADE') report.upgrades += 1;
            if (c.transactionType === 'RENEWAL') report.renewals += 1;
        }
    });
    report.netRevenueCents = report.grossRevenueCents - report.refundCents;
    report.conversionPercent = report.quotes ? Math.round((report.newMembers + report.upgrades + report.renewals) * 1000 / report.quotes) / 10 : 0;
    var usage = membershipHelpers.queryPage('PrimeMembershipBenefitUsage', 'custom.createdAt >= {0} AND custom.createdAt < {1}', 'custom.createdAt asc', [from, to], 0, limit);
    if (usage.total > limit) report.complete = false;
    usage.items.forEach(function (record) {
        var c = record.custom;
        if (c.usageStatus !== 'COMMITTED' && c.usageStatus !== 'ISSUED') return;
        report.memberSavingsCents += c.discountCents || 0;
        var amounts = membershipHelpers.parseJson(c.details, null);
        if (amounts) {
            Object.keys(amounts).forEach(function (id) {
                if (amounts[id] > 0) report.redemptions[id] = (report.redemptions[id] || 0) + 1;
            });
        } else {
            report.redemptions[c.benefitID] = (report.redemptions[c.benefitID] || 0) + 1;
        }
    });
    return report;
}

/**
 * Builds the reports of the last two days: yesterday in full, and today so far.
 * @param {number} limit - maximum records per kind
 * @returns {Object} counts
 */
function runReports(limit) {
    var counts = { reports: 0, incomplete: 0 };
    [1, 0].forEach(function (daysAgo) {
        var day = membershipHelpers.toDay(new Date(Date.now() - daysAgo * membershipHelpers.DAY));
        var report = buildDailyReport(day, limit);
        membershipHelpers.saveJobState('report-' + day, report);
        counts.reports += 1;
        if (!report.complete) counts.incomplete += 1;
    });
    membershipHelpers.saveJobState('report-live', getLiveCounts());
    return counts;
}

/**
 * @param {number} days - how many days back
 * @returns {Object[]} saved reports, newest first
 */
function getRecentReports(days) {
    var reports = [];
    for (var i = 0; i < days; i++) {
        var report = membershipHelpers.getJobState('report-' + membershipHelpers.toDay(new Date(Date.now() - i * membershipHelpers.DAY)));
        if (report.day) reports.push(report);
    }
    return reports;
}

module.exports = {
    getLiveCounts: getLiveCounts,
    buildDailyReport: buildDailyReport,
    runReports: runReports,
    getRecentReports: getRecentReports
};
