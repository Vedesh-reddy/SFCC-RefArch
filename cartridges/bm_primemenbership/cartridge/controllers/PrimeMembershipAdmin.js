'use strict';

/**
 * Business Manager desk (Merchant Tools > Prime Membership). Nodes are grouped under menu actions
 * in bm_extensions.xml, so plan editors, support staff and finance can be separate roles. Every
 * change is a CSRF-protected POST recorded with the BM user name. No node can mark a payment as
 * paid: a review is only applied when the order is verified as paid for the quoted amount.
 */

var ISML = require('dw/template/ISML');
var URLUtils = require('dw/web/URLUtils');
var CSRFProtection = require('dw/web/CSRFProtection');
var Logger = require('dw/system/Logger');
var membershipHelpers = require('*/cartridge/scripts/helpers/membershipHelpers');
var planHelpers = require('*/cartridge/scripts/helpers/membershipPlanHelpers');
var subscriptionHelpers = require('*/cartridge/scripts/helpers/membershipSubscriptionHelpers');
var paymentHelpers = require('*/cartridge/scripts/helpers/membershipPaymentHelpers');
var reportHelpers = require('*/cartridge/scripts/helpers/membershipReportHelpers');

var log = Logger.getLogger('prime-membership', 'membership-admin');
var PAGE = 50;

/**
 * @param {string} name - parameter
 * @returns {string} trimmed value
 */
function param(name) {
    var value = request.httpParameterMap.get(name);
    return value && value.submitted ? String(value.stringValue || '').trim() : '';
}

/**
 * @returns {string} audit actor for the BM user
 */
function actor() {
    return 'admin:' + session.userName;
}

/**
 * @returns {boolean} true for an authenticated BM session
 */
function allowed() {
    if (!session.userAuthenticated) {
        response.setStatus(403);
        return false;
    }
    return true;
}

/**
 * @param {?Date} date - date
 * @returns {string} UTC date and time to the minute
 */
function when(date) {
    return date ? date.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '';
}

/**
 * @param {Object} model - {title, back, sections}
 */
function render(model) {
    model.message = param('message');
    model.error = param('error');
    model.csrf = { name: CSRFProtection.getTokenName(), token: CSRFProtection.generateToken() };
    model.enabled = planHelpers.isEnabled();
    ISML.renderTemplate('primemembershipadmin/page', { model: model });
}

/**
 * Runs a POST action and redirects with the outcome.
 * @param {Function} fn - performs the action and returns a result object
 * @param {dw.web.URL} url - return URL
 */
function post(fn, url) {
    if (request.httpMethod !== 'POST' || !CSRFProtection.validateRequest()) {
        response.setStatus(403);
        return;
    }
    var result;
    try {
        result = fn() || { error: false };
    } catch (e) {
        log.error('Desk action failed: {0}', e.message);
        result = membershipHelpers.errorResult('general');
    }
    if (!result.error) {
        response.redirect(url.append('message', 'done'));
        return;
    }
    var details = result.problems ? ': ' + result.problems.join('; ').slice(0, 500) : '';
    response.redirect(url.append('error', result.errorCode + details));
}

/**
 * @param {Object} report - daily report
 * @returns {string[]} one row of the report table
 */
function reportCells(report) {
    return [
        report.day + (report.complete ? '' : ' (partial)'),
        String(report.newMembers),
        String(report.upgrades),
        String(report.renewals),
        membershipHelpers.formatCents(report.membershipRevenueCents),
        membershipHelpers.formatCents(report.upgradeRevenueCents),
        membershipHelpers.formatCents(report.renewalRevenueCents),
        membershipHelpers.formatCents(report.grossRevenueCents),
        membershipHelpers.formatCents(report.refundCents),
        membershipHelpers.formatCents(report.netRevenueCents),
        membershipHelpers.formatCents(report.memberSavingsCents),
        String(report.failedPayments),
        String(report.cancellations),
        String(report.expirations),
        String(report.conversionPercent) + '%',
        JSON.stringify(report.redemptions || {})
    ];
}

exports.Home = function () {
    if (!allowed()) return;
    var problems = planHelpers.getConfigurationProblems();
    var live = membershipHelpers.getJobState('report-live');
    var sections = [{
        type: problems.length ? 'table' : 'notice',
        title: 'Configuration check',
        text: 'All mandatory settings are valid.',
        columns: ['Problem'],
        rows: problems.map(function (problem) { return { cells: [problem] }; })
    }];
    if (live.byStatus) {
        sections.push({
            type: 'kv',
            title: 'Members by status (from the last reporting job)',
            rows: Object.keys(live.byStatus).map(function (status) { return [status, String(live.byStatus[status])]; })
        });
        sections.push({
            type: 'kv',
            title: 'Members by plan',
            rows: Object.keys(live.byPlan).map(function (plan) { return [plan, String(live.byPlan[plan])]; })
        });
    } else {
        sections.push({ type: 'notice', title: 'Members', text: 'Run MembershipReportingJob to see member counts.' });
    }
    sections.push({
        type: 'table',
        title: 'Daily figures: gross, refunds and net are separate; member savings are a cost, not revenue',
        columns: ['Day', 'New', 'Upgrades', 'Renewals', 'Membership revenue', 'Upgrade revenue', 'Renewal revenue', 'Gross', 'Refunds', 'Net', 'Member savings', 'Failed payments', 'Cancellations', 'Expired', 'Conversion', 'Redemptions'],
        rows: reportHelpers.getRecentReports(14).map(function (report) { return { cells: reportCells(report) }; })
    });
    render({ title: 'Prime Membership', sections: sections });
};
exports.Home.public = true;

/**
 * @param {?Object} plan - plan
 * @param {string} planID - plan ID
 * @returns {Object} plan editor section
 */
function planForm(plan, planID) {
    var field = function (name, label, value, extra) {
        return Object.assign({ name: name, label: label, type: 'text', value: value === undefined || value === null ? '' : String(value), required: false }, extra || {});
    };
    return {
        type: 'form',
        title: plan ? plan.planName + ' (' + planID + ', configuration version ' + plan.configurationVersion + ')' + (plan.valid ? '' : ' - INVALID: ' + plan.problems.join('; ')) : 'New plan',
        action: URLUtils.https('PrimeMembershipAdmin-SavePlan'),
        submit: 'Save plan',
        fields: [
            plan ? field('planID', '', planID, { type: 'hidden' }) : field('planID', 'Plan ID', '', { required: true }),
            field('planName', 'Name', plan && plan.planName, { required: true }),
            field('planRank', 'Rank (higher includes more)', plan && plan.planRank, { required: true }),
            field('annualPrice', 'Annual price in USD', plan ? (plan.annualPriceCents / 100).toFixed(2) : '', { required: true }),
            field('validityMonths', 'Validity in months', plan ? plan.validityMonths : 12, { required: true }),
            { name: 'enabled', label: 'On sale', type: 'select', options: [{ value: 'false', label: 'No' }, { value: 'true', label: 'Yes' }], value: plan && plan.enabled ? 'true' : 'false' },
            field('benefits', 'Benefits (JSON; see prime-membership-benefits.md)', plan ? JSON.stringify(plan.benefits) : '{}', { type: 'textarea' })
        ]
    };
}

exports.Plans = function () {
    if (!allowed()) return;
    var sections = planHelpers.getAllPlans().map(function (plan) { return planForm(plan, plan.planID); });
    sections.push(planForm(null, ''));
    render({ title: 'Plans and benefits', sections: sections });
};
exports.Plans.public = true;

exports.SavePlan = function () {
    if (!allowed()) return;
    post(function () {
        return planHelpers.savePlan(param('planID'), {
            planName: param('planName'),
            planRank: param('planRank'),
            annualPrice: param('annualPrice'),
            validityMonths: param('validityMonths'),
            enabled: param('enabled'),
            benefits: param('benefits')
        }, actor());
    }, URLUtils.https('PrimeMembershipAdmin-Plans'));
};
exports.SavePlan.public = true;

exports.Members = function () {
    if (!allowed()) return;
    var customerNo = param('customerNo');
    var status = param('status');
    var offset = Math.max(0, Number(param('offset')) || 0);
    var query = 'custom.status != NULL';
    var args = [];
    if (customerNo) {
        query = 'custom.customerNo = {0}';
        args = [customerNo];
    } else if (status) {
        query = 'custom.status = {0}';
        args = [status];
    }
    var page = membershipHelpers.queryPage('PrimeMembershipSubscription', query, 'custom.updatedAt desc', args, offset, PAGE);
    render({
        title: 'Memberships',
        sections: [{
            type: 'form',
            method: 'get',
            action: URLUtils.https('PrimeMembershipAdmin-Members'),
            submit: 'Search',
            fields: [
                { name: 'customerNo', label: 'Customer number', type: 'text', value: customerNo, required: false },
                { name: 'status', label: 'Status', type: 'select', value: status, options: [{ value: '', label: 'Any' }].concat(Object.keys(subscriptionHelpers.TRANSITIONS).map(function (s) { return { value: s, label: s }; })) }
            ]
        }, {
            type: 'table',
            columns: ['Customer', 'Plan', 'Status', 'Paid through', 'Pending payment'],
            rows: page.items.map(function (record) {
                var c = record.custom;
                return { link: URLUtils.https('PrimeMembershipAdmin-Member', 'customerNo', c.customerNo).toString(), cells: [c.customerNo, c.planID || '', c.status, when(c.paidThroughDate), c.pendingTransactionID ? 'yes' : ''] };
            })
        }, {
            type: 'pager',
            total: String(page.total),
            previous: offset > 0 ? URLUtils.https('PrimeMembershipAdmin-Members', 'offset', Math.max(0, offset - PAGE), 'status', status).toString() : '',
            next: offset + PAGE < page.total ? URLUtils.https('PrimeMembershipAdmin-Members', 'offset', offset + PAGE, 'status', status).toString() : ''
        }]
    });
};
exports.Members.public = true;

exports.Member = function () {
    if (!allowed()) return;
    var customerNo = param('customerNo');
    var subscription = subscriptionHelpers.getSubscription(customerNo);
    if (!subscription) {
        response.redirect(URLUtils.https('PrimeMembershipAdmin-Members').append('error', 'no-membership'));
        return;
    }
    var c = subscription.custom;
    var history = function (type, sort) {
        return membershipHelpers.queryPage(type, 'custom.subscriptionID = {0}', sort, [c.subscriptionID], 0, 100).items;
    };
    var hidden = { name: 'customerNo', type: 'hidden', value: customerNo };
    render({
        title: 'Membership ' + customerNo,
        back: URLUtils.https('PrimeMembershipAdmin-Members').toString(),
        sections: [{
            type: 'kv',
            rows: [
                ['Plan', c.planID || ''], ['Status', c.status], ['Reason', c.statusReason || ''], ['Started', when(c.startDate)], ['Expires', when(c.expirationDate)], ['Paid through', when(c.paidThroughDate)],
                ['Auto-renew', String(c.autoRenewEnabled === true)], ['Credit value', membershipHelpers.formatCents(c.creditBaseCents || 0)], ['Source order', c.sourceOrderNo || ''],
                ['Pending transaction', c.pendingTransactionID || ''], ['Benefit counters this period', c.benefitCounters || '{}']
            ]
        }, {
            type: 'form',
            title: 'Suspend, restore or record a refund (needs the corrections role)',
            action: URLUtils.https('PrimeMembershipAdmin-MemberAction'),
            submit: 'Apply',
            fields: [
                hidden,
                { name: 'action', label: 'Action', type: 'select', value: 'suspend', options: [{ value: 'suspend', label: 'Suspend' }, { value: 'restore', label: 'Restore' }, { value: 'refund', label: 'Record refund, keep membership' }, { value: 'refund-end', label: 'Record refund, end membership' }] },
                { name: 'reason', label: 'Reason, or refund reference from the payment system', type: 'text', value: '', required: true },
                { name: 'orderNo', label: 'Refunded order', type: 'text', value: '' },
                { name: 'amount', label: 'Refund amount in USD', type: 'text', value: '' }
            ]
        }, {
            type: 'table',
            title: 'Financial transactions',
            columns: ['Transaction', 'Type', 'Status', 'Total', 'Order', 'Payment reference', 'Created', 'Reason'],
            rows: history('PrimeMembershipTransaction', 'custom.createdAt desc').map(function (t) {
                return { cells: [t.custom.transactionID, t.custom.transactionType, t.custom.status, membershipHelpers.formatCents(t.custom.totalCents || 0), t.custom.orderNo || '', t.custom.paymentReference || '', when(t.custom.createdAt), t.custom.reviewReason || ''] };
            })
        }, {
            type: 'table',
            title: 'Benefit usage',
            columns: ['Usage', 'Benefit', 'Period', 'Order', 'Amount', 'Status'],
            rows: history('PrimeMembershipBenefitUsage', 'custom.createdAt desc').map(function (u) {
                return { cells: [u.custom.usageID, u.custom.benefitID, u.custom.usagePeriod || '', u.custom.orderNo || '', membershipHelpers.formatCents(u.custom.discountCents || 0), u.custom.usageStatus] };
            })
        }, {
            type: 'table',
            title: 'Audit',
            columns: ['Time', 'Action', 'By', 'From', 'To'],
            rows: history('PrimeMembershipAudit', 'custom.timestamp desc').map(function (a) {
                return { cells: [when(a.custom.timestamp), a.custom.action, a.custom.actorReference, a.custom.previousState || '', a.custom.newState || ''] };
            })
        }]
    });
};
exports.Member.public = true;

exports.MemberAction = function () {
    if (!allowed()) return;
    var customerNo = param('customerNo');
    post(function () {
        var action = param('action');
        var reason = param('reason');
        if (action === 'suspend') return subscriptionHelpers.suspendMembership(customerNo, reason, actor());
        if (action === 'restore') return subscriptionHelpers.restoreMembership(customerNo, reason, actor());
        if (action === 'refund' || action === 'refund-end') return paymentHelpers.recordRefund(customerNo, param('orderNo'), membershipHelpers.toCents(param('amount')), action === 'refund-end', reason, actor());
        return membershipHelpers.errorResult('invalid');
    }, URLUtils.https('PrimeMembershipAdmin-Member', 'customerNo', customerNo));
};
exports.MemberAction.public = true;

exports.Reviews = function () {
    if (!allowed()) return;
    var row = function (record) {
        var c = record.custom;
        return {
            cells: [c.transactionID, c.customerNo, c.transactionType, c.status, membershipHelpers.formatCents(c.totalCents || 0), c.orderNo || '', c.reviewReason || '', when(c.updatedAt)],
            link: URLUtils.https('PrimeMembershipAdmin-Member', 'customerNo', c.customerNo).toString()
        };
    };
    var review = membershipHelpers.queryPage('PrimeMembershipTransaction', 'custom.status = {0}', 'custom.updatedAt asc', ['REVIEW'], 0, PAGE).items;
    render({
        title: 'Reconciliation and corrections',
        sections: [{
            type: 'table',
            title: 'Payments held for review',
            columns: ['Transaction', 'Customer', 'Type', 'Status', 'Total', 'Order', 'Reason', 'Updated', 'Decision'],
            rows: review.map(function (record) {
                var entry = row(record);
                entry.form = { action: URLUtils.https('PrimeMembershipAdmin-ResolveReview', 'id', record.custom.transactionID).toString(), options: [{ value: 'apply', label: 'Apply if verified as paid' }, { value: 'fail', label: 'Close as failed' }] };
                return entry;
            })
        }, {
            type: 'table',
            title: 'Payments still waiting',
            columns: ['Transaction', 'Customer', 'Type', 'Status', 'Total', 'Order', 'Reason', 'Updated'],
            rows: membershipHelpers.queryPage('PrimeMembershipTransaction', 'custom.status = {0}', 'custom.updatedAt asc', ['AWAITING_PAYMENT'], 0, PAGE).items.map(row)
        }, {
            type: 'table',
            title: 'Refunds to handle',
            columns: ['Customer', 'Plan', 'Reason', 'Updated'],
            rows: membershipHelpers.queryPage('PrimeMembershipSubscription', 'custom.status = {0}', 'custom.updatedAt asc', ['REFUND_PENDING'], 0, PAGE).items.map(function (record) {
                return { link: URLUtils.https('PrimeMembershipAdmin-Member', 'customerNo', record.custom.customerNo).toString(), cells: [record.custom.customerNo, record.custom.planID || '', record.custom.statusReason || '', when(record.custom.updatedAt)] };
            })
        }]
    });
};
exports.Reviews.public = true;

exports.ResolveReview = function () {
    if (!allowed()) return;
    var id = param('id');
    post(function () {
        if (!param('reason')) return membershipHelpers.errorResult('invalid');
        return paymentHelpers.resolveReview(id, param('action'), actor() + ' (' + param('reason').slice(0, 200) + ')');
    }, URLUtils.https('PrimeMembershipAdmin-Reviews'));
};
exports.ResolveReview.public = true;

exports.Audit = function () {
    if (!allowed()) return;
    var offset = Math.max(0, Number(param('offset')) || 0);
    var page = membershipHelpers.queryPage('PrimeMembershipAudit', 'custom.timestamp != NULL', 'custom.timestamp desc', [], offset, PAGE);
    render({
        title: 'Audit trail',
        sections: [{
            type: 'table',
            columns: ['Time', 'Action', 'By', 'Membership', 'From', 'To', 'Correlation'],
            rows: page.items.map(function (a) {
                var c = a.custom;
                return { cells: [when(c.timestamp), c.action, c.actorReference, c.subscriptionID || '', c.previousState || '', c.newState || '', c.correlationID || ''] };
            })
        }, {
            type: 'pager',
            total: String(page.total),
            previous: offset > 0 ? URLUtils.https('PrimeMembershipAdmin-Audit', 'offset', Math.max(0, offset - PAGE)).toString() : '',
            next: offset + PAGE < page.total ? URLUtils.https('PrimeMembershipAdmin-Audit', 'offset', offset + PAGE).toString() : ''
        }]
    });
};
exports.Audit.public = true;
