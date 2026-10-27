'use strict';

/**
 * Business Manager desk of the marketplace (Merchant Tools > Marketplace). Each node is
 * registered under exactly one menu action in bm_extensions.xml, so access follows the
 * Business Manager module granted to the user's role: sellers, catalog, trust & safety,
 * finance, audit. Every change is a POST with a CSRF token and is recorded with the BM
 * user name. Pages are built as simple view models rendered by one template.
 */

var ISML = require('dw/template/ISML');
var URLUtils = require('dw/web/URLUtils');
var CSRFProtection = require('dw/web/CSRFProtection');
var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Logger = require('dw/system/Logger');
var marketplaceHelpers = require('*/cartridge/scripts/helpers/marketplaceHelpers');

var log = Logger.getLogger('plugin-seller', 'seller-approval');
var PAGE = 50;
var REQUIRED_PREFERENCES = ['sellerAgreementVersion', 'sellerFromEmail', 'sellerAdminNotificationEmails', 'sellerMasterCatalogId', 'sellerSiteCatalogId', 'sellerPriceBookId', 'sellerSiteInventoryListId'];

/**
 * @param {string} name - request parameter
 * @returns {string} trimmed value ('' when absent)
 */
function param(name) {
    var value = request.httpParameterMap.get(name);
    return value && value.submitted ? String(value.stringValue || '').trim() : '';
}

/**
 * @returns {?number} revision the page showed
 */
function revisionParam() {
    return param('revision') ? Number(param('revision')) : null;
}

/**
 * @returns {Object} audit actor for the signed-in BM user
 */
function actor() {
    return marketplaceHelpers.actor('ADMIN', session.userName);
}

/**
 * @returns {boolean} true for an authenticated Business Manager session
 */
function allowed() {
    if (!session.userAuthenticated) {
        response.setStatus(403);
        return false;
    }
    return true;
}

/**
 * @param {Date} date - date
 * @returns {string} ISO date and time to the minute
 */
function when(date) {
    return date ? date.toISOString().slice(0, 16).replace('T', ' ') : '';
}

/**
 * @param {number} cents - amount
 * @returns {string} formatted USD
 */
function usd(cents) {
    return typeof cents === 'number' ? marketplaceHelpers.formatCents(cents) : '';
}

/**
 * @param {Object} model - {title, back, sections}
 */
function render(model) {
    model.message = param('message');
    model.error = param('error');
    model.csrf = { name: CSRFProtection.getTokenName(), token: CSRFProtection.generateToken() };
    model.enabled = marketplaceHelpers.isMarketplaceEnabled();
    ISML.renderTemplate('marketplace/page', { model: model });
}

/**
 * Runs a POST action and redirects with the outcome.
 * @param {Function} fn - performs the action and returns a result object
 * @param {dw.web.URL} back - where to return
 */
function post(fn, back) {
    if (request.httpMethod !== 'POST' || !CSRFProtection.validateRequest()) {
        response.setStatus(403);
        return;
    }
    var result;
    try {
        result = fn() || { error: false };
    } catch (e) {
        log.error('Marketplace desk action failed: {0}', e.message);
        result = marketplaceHelpers.errorResult('general');
    }
    if (!result.error) {
        response.redirect(back.append('message', 'done'));
        return;
    }
    var fields = result.fields ? ' ' + JSON.stringify(result.fields).slice(0, 300) : '';
    response.redirect(back.append('error', result.errorCode + fields));
}

/**
 * @param {string} name - field name
 * @param {string} label - label
 * @param {Object} [extra] - {type, options, value, required}
 * @returns {Object} form field
 */
function field(name, label, extra) {
    return Object.assign({ name: name, label: label, type: 'text', value: '', required: false }, extra || {});
}

/**
 * @param {string} action - action value
 * @param {string} label - button label
 * @returns {Object} option
 */
function option(action, label) {
    return { value: action, label: label };
}

/**
 * @param {string} type - custom object type
 * @param {string} query - query
 * @param {Array} args - arguments
 * @param {string} sort - sort
 * @returns {{items: Array, total: number, offset: number}} page from the offset parameter
 */
function pageOf(type, query, args, sort) {
    var offset = Math.max(0, Math.floor(Number(param('offset')) || 0));
    var result = marketplaceHelpers.queryPage(type, query, sort, args, offset, PAGE);
    result.offset = offset;
    return result;
}

/**
 * @param {Object} result - page
 * @param {string} node - controller node
 * @param {Object} params - extra query parameters
 * @returns {Object} pager section
 */
function pager(result, node, params) {
    var make = function (offset) {
        var url = URLUtils.url('MarketplaceAdmin-' + node, 'offset', String(offset));
        Object.keys(params || {}).forEach(function (k) { if (params[k]) url.append(k, params[k]); });
        return url.toString();
    };
    return {
        type: 'pager',
        total: String(result.total),
        previous: result.offset > 0 ? make(Math.max(0, result.offset - PAGE)) : null,
        next: result.offset + PAGE < result.total ? make(result.offset + PAGE) : null
    };
}

/**
 * @param {string} node - controller node
 * @param {string} name - filter parameter
 * @param {string[]} values - allowed values
 * @returns {Object} filter section
 */
function filter(node, name, values) {
    return {
        type: 'filter',
        links: [{ label: 'All', url: URLUtils.url('MarketplaceAdmin-' + node).toString(), active: !param(name) }].concat(values.map(function (v) {
            return { label: v, url: URLUtils.url('MarketplaceAdmin-' + node, name, v).toString(), active: param(name) === v };
        }))
    };
}

/**
 * @param {string} name - parameter
 * @param {string[]} allowedValues - allowed values
 * @returns {?string} value when allowed
 */
function allowedParam(name, allowedValues) {
    var value = param(name);
    return allowedValues.indexOf(value) >= 0 ? value : null;
}

// ---------------------------------------------------------------- Home and audit

exports.Home = function () {
    if (!allowed()) return;
    var sellerHelpers = require('*/cartridge/scripts/helpers/sellerHelpers');
    var count = marketplaceHelpers.queryCount;
    var missing = REQUIRED_PREFERENCES.filter(function (id) {
        var value = sellerHelpers.getPreference(id);
        return !value || value.length === 0;
    });
    render({
        title: 'Marketplace',
        sections: [
            { type: 'kv', title: 'Waiting', rows: [
                ['Sellers to review', String(count('MarketplaceSeller', 'custom.status = {0} OR custom.status = {1}', ['PENDING_VERIFICATION', 'PENDING_APPROVAL']))],
                ['Product submissions to review', String(count('MarketplaceSubmission', 'custom.status = {0} OR custom.status = {1}', ['SUBMITTED', 'UNDER_REVIEW']))],
                ['Failed publications', String(count('MarketplaceSubmission', 'custom.status = {0}', ['PROVISIONING_FAILED']))],
                ['Offers to review', String(count('MarketplaceOffer', 'custom.reviewState = {0}', ['PENDING']))],
                ['Open cases', String(count('MarketplaceCase', 'custom.status = {0} OR custom.status = {1}', ['OPEN', 'IN_PROGRESS']))],
                ['Settlements to pay', String(count('MarketplaceSettlement', 'custom.status = {0} OR custom.status = {1}', ['OPEN', 'PAYOUT_REQUESTED']))]
            ] },
            { type: 'kv', title: 'Configuration', rows: [
                ['Marketplace enabled (and USD)', marketplaceHelpers.isMarketplaceEnabled() ? 'yes' : 'no'],
                ['Provisioning ready', require('*/cartridge/scripts/helpers/catalogImportHelpers').canPublish() ? 'yes' : 'no'],
                ['Provisioning strategy', sellerHelpers.getEnumPreference('sellerProvisioningStrategy') || ''],
                ['Identity / payout / scan providers', ['sellerKycProvider', 'sellerPayoutProvider', 'sellerDocumentScanProvider'].map(sellerHelpers.getEnumPreference).join(' / ')],
                ['Missing preferences', missing.length ? missing.join(', ') : 'none']
            ] },
            { type: 'notice', text: 'Sandbox and demo use only until the payout, identity and tax prerequisites in docs/plugin_seller/SECURITY.md are met. Not for live money.' }
        ]
    });
};
exports.Home.public = true;

exports.Audit = function () {
    if (!allowed()) return;
    var entity = param('entityId');
    var sellerId = param('sellerId');
    var query = 'custom.occurredAt != NULL';
    var args = [];
    if (entity) {
        query += ' AND custom.entityId = {' + args.length + '}';
        args.push(entity);
    }
    if (sellerId) {
        query += ' AND custom.sellerId = {' + args.length + '}';
        args.push(sellerId);
    }
    var result = pageOf('MarketplaceAuditEvent', query, args, 'custom.occurredAt desc');
    render({
        title: 'Audit trail',
        sections: [
            { type: 'form', title: 'Filter', method: 'get', action: URLUtils.url('MarketplaceAdmin-Audit').toString(), fields: [field('entityId', 'Entity ID', { value: entity }), field('sellerId', 'Seller ID', { value: sellerId })], submit: 'Filter' },
            { type: 'table', columns: ['When', 'Entity', 'Action', 'From', 'To', 'Actor', 'Reason'], rows: result.items.map(function (a) {
                var c = a.custom;
                return { cells: [when(c.occurredAt), c.entityType + ' ' + c.entityId, c.action, c.fromStatus || '', c.toStatus || '', c.actorType + ' ' + c.actorRef, c.reason || ''] };
            }) },
            pager(result, 'Audit', { entityId: entity, sellerId: sellerId })
        ]
    });
};
exports.Audit.public = true;

// ---------------------------------------------------------------- Sellers

var SELLER_STATUSES = ['DRAFT', 'PENDING_VERIFICATION', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUSPENDED', 'TERMINATED'];

exports.Sellers = function () {
    if (!allowed()) return;
    var status = allowedParam('status', SELLER_STATUSES);
    var result = status ? pageOf('MarketplaceSeller', 'custom.status = {0}', [status], 'custom.submittedAt asc') : pageOf('MarketplaceSeller', 'custom.status != {0}', ['DRAFT'], 'custom.createdAt desc');
    render({
        title: 'Sellers',
        sections: [
            filter('Sellers', 'status', SELLER_STATUSES),
            { type: 'table', columns: ['Seller', 'Name', 'Status', 'Identity', 'Payout account', 'Submitted'], rows: result.items.map(function (s) {
                var c = s.custom;
                return { link: URLUtils.url('MarketplaceAdmin-Seller', 'id', c.sellerId).toString(), cells: [c.sellerId, c.displayName, c.status, c.kycStatus, c.bankStatus, when(c.submittedAt)] };
            }) },
            pager(result, 'Sellers', { status: status })
        ]
    });
};
exports.Sellers.public = true;

exports.Seller = function () {
    if (!allowed()) return;
    var sellerHelpers = require('*/cartridge/scripts/helpers/sellerHelpers');
    var documentHelpers = require('*/cartridge/scripts/helpers/sellerDocumentHelpers');
    var id = param('id');
    var record = CustomObjectMgr.getCustomObject('MarketplaceSeller', id);
    if (!record) {
        render({ title: 'Seller not found', sections: [] });
        return;
    }
    var v = sellerHelpers.getSellerView(record);
    var members = marketplaceHelpers.queryPage('MarketplaceSellerMember', 'custom.sellerId = {0}', null, [id], 0, 100).items;
    var problems = documentHelpers.getApprovalProblems(id);
    var grants = record.custom.restrictedCategoryGrants ? Array.prototype.slice.call(record.custom.restrictedCategoryGrants).join(', ') : '';
    render({
        title: 'Seller ' + v.sellerId + ' - ' + v.displayName,
        back: URLUtils.url('MarketplaceAdmin-Sellers').toString(),
        sections: [
            { type: 'kv', title: 'Account', rows: [
                ['Status', v.status + (v.statusReason ? ' (' + v.statusReason + ')' : '')],
                ['Legal name', v.legalName], ['Business type', v.businessType], ['Registration', v.registrationNumber],
                ['Tax ID', '***' + v.taxIdLast4], ['Address', [v.address.line1, v.address.line2, v.address.city, v.address.stateCode, v.address.postalCode].filter(Boolean).join(', ')],
                ['Contact', v.contactName + ' / ' + v.contactEmail + ' / ' + v.contactPhone], ['E-mail verified', v.emailVerified ? 'yes' : 'no'],
                ['Agreement', v.agreementVersion], ['Identity verification', v.kycStatus], ['Payout account', v.bankStatus + (v.payoutAccountLast4 ? ' ***' + v.payoutAccountLast4 : '')],
                ['Tier', v.tier], ['Restricted category grants', grants],
                ['Rating', v.rating === null ? 'none' : v.rating + ' (' + v.ratingCount + ')'], ['Metrics', record.custom.metrics || ''],
                ['Approval blockers', problems.length ? problems.join(', ') : 'none']
            ] },
            { type: 'table', title: 'Documents', columns: ['Type', 'File', 'Scan', 'Review', 'Expires'], rows: documentHelpers.getDocuments(id).map(function (d) {
                return { link: URLUtils.url('MarketplaceAdmin-Document', 'id', d.documentId).toString(), cells: [d.docType, d.fileName, d.scanStatus, d.reviewStatus, d.expiresOn ? when(d.expiresOn) : ''] };
            }) },
            { type: 'form', title: 'Decision', action: URLUtils.url('MarketplaceAdmin-SellerAction', 'id', id).toString(), fields: [
                field('action', 'Action', { type: 'select', options: [option('approve', 'Approve'), option('reject', 'Reject'), option('requestChanges', 'Request changes'), option('suspend', 'Suspend'), option('reactivate', 'Reactivate'), option('terminate', 'Terminate')] }),
                field('reason', 'Reason (required except approve/reactivate)', { type: 'textarea' }),
                field('revision', '', { type: 'hidden', value: String(v.revision) })
            ], submit: 'Apply decision' },
            { type: 'form', title: 'Identity verification result (manual review)', action: URLUtils.url('MarketplaceAdmin-SellerAction', 'id', id, 'kind', 'kyc').toString(), fields: [
                field('result', 'Result', { type: 'select', options: [option('VERIFIED', 'Verified'), option('REJECTED', 'Rejected'), option('REVIEW', 'Needs more review')] })
            ], submit: 'Record result' },
            { type: 'form', title: 'Payout account result (manual verification)', action: URLUtils.url('MarketplaceAdmin-SellerAction', 'id', id, 'kind', 'bank').toString(), fields: [
                field('result', 'Result', { type: 'select', options: [option('VERIFIED', 'Verified'), option('REJECTED', 'Rejected')] }),
                field('reference', 'Payout provider / bank reference', { required: true }),
                field('last4', 'Last four digits (display only)')
            ], submit: 'Record result' },
            { type: 'form', title: 'Tier and restricted categories', action: URLUtils.url('MarketplaceAdmin-SellerAction', 'id', id, 'kind', 'tier').toString(), fields: [
                field('tier', 'Tier', { type: 'select', value: v.tier, options: sellerHelpers.TIERS.map(function (t) { return option(t, t); }) }),
                field('grants', 'Restricted category IDs (comma separated)', { value: grants })
            ], submit: 'Save' },
            { type: 'table', title: 'Members', columns: ['Customer no', 'Role', 'Active'], rows: members.map(function (m) { return { cells: [m.custom.customerNo, m.custom.role, m.custom.active ? 'yes' : 'no'] }; }) },
            { type: 'form', title: 'Add or change member', action: URLUtils.url('MarketplaceAdmin-SellerAction', 'id', id, 'kind', 'member').toString(), fields: [
                field('customerNo', 'Customer number', { required: true }),
                field('role', 'Role (or REMOVE)', { type: 'select', options: sellerHelpers.ROLES.filter(function (r) { return r !== 'OWNER'; }).map(function (r) { return option(r, r); }).concat([option('REMOVE', 'Remove access')]) })
            ], submit: 'Save member' },
            { type: 'links', links: [
                { label: 'Offers of this seller', url: URLUtils.url('MarketplaceAdmin-Offers', 'sellerId', id).toString() },
                { label: 'Seller orders', url: URLUtils.url('MarketplaceAdmin-SellerOrders', 'sellerId', id).toString() },
                { label: 'Audit trail', url: URLUtils.url('MarketplaceAdmin-Audit', 'sellerId', id).toString() }
            ] }
        ]
    });
};
exports.Seller.public = true;

exports.SellerAction = function () {
    if (!allowed()) return;
    var id = param('id');
    var kind = param('kind');
    post(function () {
        var sellerHelpers = require('*/cartridge/scripts/helpers/sellerHelpers');
        if (kind === 'kyc') return sellerHelpers.recordIdentityResult(id, param('result'), null, actor());
        if (kind === 'bank') return sellerHelpers.recordPayoutAccountResult(id, param('result'), param('reference'), param('last4'), actor());
        if (kind === 'tier') return sellerHelpers.setTierAndGrants(id, param('tier'), param('grants').split(',').map(function (g) { return g.trim(); }).filter(Boolean), actor());
        if (kind === 'member') return sellerHelpers.setMember(id, param('customerNo'), param('role'), actor());
        return sellerHelpers.decideSeller(id, param('action'), param('reason'), revisionParam(), actor());
    }, URLUtils.url('MarketplaceAdmin-Seller', 'id', id));
};
exports.SellerAction.public = true;

exports.Document = function () {
    if (!allowed()) return;
    var id = param('id');
    var record = CustomObjectMgr.getCustomObject('MarketplaceDocument', id);
    var opened = record ? require('*/cartridge/scripts/helpers/sellerDocumentHelpers').getDocumentForAdmin(id, actor()) : null;
    render({
        title: 'Document ' + id,
        back: record ? URLUtils.url('MarketplaceAdmin-Seller', 'id', record.custom.sellerId).toString() : null,
        sections: record ? [
            { type: 'kv', rows: [['Seller', record.custom.sellerId], ['Type', record.custom.docType], ['File', record.custom.fileName], ['Scan', record.custom.scanStatus], ['Review', record.custom.reviewStatus], ['SHA-256', record.custom.sha256]] },
            opened ? { type: 'document', contentType: opened.contentType, dataUri: opened.dataUri } : { type: 'notice', text: 'The file is not available (withdrawn, quarantined or purged).' },
            { type: 'form', title: 'Review', action: URLUtils.url('MarketplaceAdmin-DocumentAction', 'id', id).toString(), fields: [
                field('decision', 'Decision', { type: 'select', options: [option('ACCEPTED', 'Accept'), option('REJECTED', 'Reject')] }),
                field('note', 'Note (required to reject)', { type: 'textarea' })
            ], submit: 'Save review' }
        ] : []
    });
};
exports.Document.public = true;

exports.DocumentAction = function () {
    if (!allowed()) return;
    var id = param('id');
    post(function () {
        return require('*/cartridge/scripts/helpers/sellerDocumentHelpers').reviewDocument(id, param('decision'), param('note'), actor());
    }, URLUtils.url('MarketplaceAdmin-Document', 'id', id));
};
exports.DocumentAction.public = true;

// ---------------------------------------------------------------- Catalog

var SUBMISSION_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'PROVISIONING', 'PROVISIONING_FAILED', 'PUBLISHED', 'SUSPENDED', 'REJECTED'];

exports.Submissions = function () {
    if (!allowed()) return;
    var status = allowedParam('status', SUBMISSION_STATUSES);
    var result = status ? pageOf('MarketplaceSubmission', 'custom.status = {0}', [status], 'custom.submittedAt asc') : pageOf('MarketplaceSubmission', 'custom.status != {0}', ['DRAFT'], 'custom.updatedAt desc');
    render({
        title: 'Product submissions',
        sections: [
            filter('Submissions', 'status', SUBMISSION_STATUSES),
            { type: 'table', columns: ['Submission', 'Seller', 'Mode', 'Product', 'Status', 'Flags', 'Submitted'], rows: result.items.map(function (s) {
                var c = s.custom;
                return { link: URLUtils.url('MarketplaceAdmin-Submission', 'id', c.submissionId).toString(), cells: [c.submissionId, c.sellerId, c.mode, c.productId || '', c.status, c.qualityFlags ? Array.prototype.slice.call(c.qualityFlags).join(', ') : '', when(c.submittedAt)] };
            }) },
            pager(result, 'Submissions', { status: status })
        ]
    });
};
exports.Submissions.public = true;

exports.Submission = function () {
    if (!allowed()) return;
    var submissionHelpers = require('*/cartridge/scripts/helpers/productSubmissionHelpers');
    var id = param('id');
    var record = CustomObjectMgr.getCustomObject('MarketplaceSubmission', id);
    if (!record) {
        render({ title: 'Submission not found', sections: [] });
        return;
    }
    var v = submissionHelpers.getSubmissionView(record);
    var p = v.payload;
    var rows = Object.keys(p).filter(function (k) { return k !== 'variants'; }).map(function (k) {
        var value = k === 'priceCents' ? usd(p[k]) : p[k];
        return [k, Array.isArray(value) ? value.join(' | ') : String(value)];
    });
    var sections = [
        { type: 'kv', title: 'Submission', rows: [['Status', v.status], ['Seller', record.custom.sellerId], ['Product ID', v.productId || ''], ['Flags', v.qualityFlags.join(', ') || 'none'], ['Images', String(v.images.length)], ['Attempts', String(record.custom.provisionAttempts || 0)], ['Last error', v.lastError || '']] },
        { type: 'kv', title: 'Payload', rows: rows }
    ];
    if (p.variants && p.variants.length) {
        sections.push({ type: 'table', title: 'Variants', columns: ['SKU', 'Color', 'Size', 'Quantity', 'Price', 'GTIN'], rows: p.variants.map(function (x) {
            return { cells: [x.sellerSku, x.values.color || '', x.values.size || '', String(x.quantity), x.priceCents ? usd(x.priceCents) : '', x.gtin || ''] };
        }) });
    }
    if (v.mode === 'UPDATE') {
        sections.push({ type: 'table', title: 'Changes against the live product', columns: ['Field', 'Current', 'Proposed'], rows: submissionHelpers.getProductChanges(id).map(function (d) {
            return { cells: [d.field, String(d.current), String(d.proposed)] };
        }) });
    }
    sections.push({ type: 'form', title: 'Decision', action: URLUtils.url('MarketplaceAdmin-SubmissionAction', 'id', id).toString(), fields: [
        field('action', 'Action', { type: 'select', options: [option('startReview', 'Start review'), option('approve', 'Approve'), option('requestChanges', 'Request changes'), option('reject', 'Reject'), option('retry', 'Retry publishing'), option('suspend', 'Suspend listing'), option('reinstate', 'Reinstate listing')] }),
        field('reason', 'Reason / notes for the seller', { type: 'textarea' }),
        field('revision', '', { type: 'hidden', value: String(v.revision) })
    ], submit: 'Apply' });
    render({ title: 'Submission ' + id, back: URLUtils.url('MarketplaceAdmin-Submissions').toString(), sections: sections });
};
exports.Submission.public = true;

exports.SubmissionAction = function () {
    if (!allowed()) return;
    var id = param('id');
    post(function () {
        return require('*/cartridge/scripts/helpers/productSubmissionHelpers').decideSubmission(id, param('action'), param('reason'), revisionParam(), actor());
    }, URLUtils.url('MarketplaceAdmin-Submission', 'id', id));
};
exports.SubmissionAction.public = true;

exports.Offers = function () {
    if (!allowed()) return;
    var sellerId = param('sellerId');
    var productId = param('productId');
    var result;
    var title = 'Offers waiting for review';
    if (sellerId) {
        result = pageOf('MarketplaceOffer', 'custom.sellerId = {0}', [sellerId], 'custom.updatedAt desc');
        title = 'Offers of ' + sellerId;
    } else if (productId) {
        result = pageOf('MarketplaceOffer', 'custom.productId = {0}', [productId], 'custom.priceCents asc');
        title = 'Offers for ' + productId;
    } else {
        result = pageOf('MarketplaceOffer', 'custom.reviewState = {0}', ['PENDING'], 'custom.updatedAt asc');
    }
    render({
        title: title,
        sections: [
            { type: 'form', title: 'Find', method: 'get', action: URLUtils.url('MarketplaceAdmin-Offers').toString(), fields: [field('sellerId', 'Seller ID', { value: sellerId }), field('productId', 'Product ID', { value: productId })], submit: 'Search' },
            { type: 'table', columns: ['Offer', 'Status', 'Price', 'Proposed', 'Flags', 'Stock', 'Updated', 'Action'], rows: result.items.map(function (o) {
                var c = o.custom;
                return {
                    cells: [c.offerId, c.status, usd(c.priceCents), c.proposedPriceCents ? usd(c.proposedPriceCents) : '', c.reviewFlags ? Array.prototype.slice.call(c.reviewFlags).join(', ') : '', String(c.stock), when(c.updatedAt)],
                    form: { action: URLUtils.url('MarketplaceAdmin-OfferAction', 'id', c.offerId).toString(), options: [option('approve', 'Approve'), option('reject', 'Reject'), option('suspend', 'Suspend'), option('reinstate', 'Reinstate')] }
                };
            }) },
            pager(result, 'Offers', { sellerId: sellerId, productId: productId })
        ]
    });
};
exports.Offers.public = true;

exports.OfferAction = function () {
    if (!allowed()) return;
    var id = param('id');
    post(function () {
        return require('*/cartridge/scripts/helpers/offerHelpers').decideOffer(id, param('action'), param('reason'), actor());
    }, URLUtils.url('MarketplaceAdmin-Offers'));
};
exports.OfferAction.public = true;

// ---------------------------------------------------------------- Trust and safety

var CASE_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'];

exports.Cases = function () {
    if (!allowed()) return;
    var caseTypes = require('*/cartridge/scripts/helpers/caseHelpers').CASE_TYPES;
    var status = allowedParam('status', CASE_STATUSES);
    var caseType = allowedParam('caseType', caseTypes);
    var query = status ? 'custom.status = {0}' : '(custom.status = {0} OR custom.status = {1})';
    var args = status ? [status] : ['OPEN', 'IN_PROGRESS'];
    if (caseType) {
        query += ' AND custom.caseType = {' + args.length + '}';
        args.push(caseType);
    }
    var result = pageOf('MarketplaceCase', query, args, 'custom.createdAt asc');
    render({
        title: 'Cases',
        sections: [
            filter('Cases', 'status', CASE_STATUSES),
            filter('Cases', 'caseType', caseTypes),
            { type: 'table', columns: ['Case', 'Type', 'Severity', 'Status', 'Seller', 'Entity', 'Created'], rows: result.items.map(function (r) {
                var c = r.custom;
                return { link: URLUtils.url('MarketplaceAdmin-Case', 'id', c.caseId).toString(), cells: [c.caseId, c.caseType, c.severity, c.status, c.sellerId || '', c.entityId || '', when(c.createdAt)] };
            }) },
            pager(result, 'Cases', { status: status, caseType: caseType })
        ]
    });
};
exports.Cases.public = true;

exports.Case = function () {
    if (!allowed()) return;
    var id = param('id');
    var record = CustomObjectMgr.getCustomObject('MarketplaceCase', id);
    if (!record) {
        render({ title: 'Case not found', sections: [] });
        return;
    }
    var v = require('*/cartridge/scripts/helpers/caseHelpers').getCaseView(record, false);
    render({
        title: 'Case ' + id + ' - ' + v.caseType,
        back: URLUtils.url('MarketplaceAdmin-Cases').toString(),
        sections: [
            { type: 'kv', rows: [['Status', v.status], ['Severity', v.severity], ['Seller', v.sellerId || ''], ['Entity', v.entityId || ''], ['Product', v.productId || ''], ['Order', v.orderNo || ''], ['Detail', JSON.stringify(v.detail)], ['Resolution', v.resolution || '']] },
            { type: 'table', title: 'Thread', columns: ['When', 'By', 'Message'], rows: v.thread.map(function (m) { return { cells: [m.at.slice(0, 16), m.by, m.text] }; }) },
            { type: 'form', title: 'Update', action: URLUtils.url('MarketplaceAdmin-CaseAction', 'id', id).toString(), fields: [
                field('action', 'Action', { type: 'select', options: [option('note', 'Add note'), option('progress', 'Mark in progress'), option('resolve', 'Resolve'), option('dismiss', 'Dismiss'), option('reopen', 'Reopen')] }),
                field('message', 'Message (shown to the seller for seller-visible cases)', { type: 'textarea' }),
                field('enforce', 'Enforcement', { type: 'select', options: [option('', 'None'), option('suspend-offer', 'Suspend the offer in this case'), option('suspend-product', 'Suspend all offers of the product'), option('suspend-seller', 'Suspend the seller')] }),
                field('revision', '', { type: 'hidden', value: String(v.revision) })
            ], submit: 'Apply' }
        ]
    });
};
exports.Case.public = true;

exports.CaseAction = function () {
    if (!allowed()) return;
    var id = param('id');
    post(function () {
        var offerHelpers = require('*/cartridge/scripts/helpers/offerHelpers');
        var record = CustomObjectMgr.getCustomObject('MarketplaceCase', id);
        var enforce = param('enforce');
        var reason = 'case ' + id + ': ' + (param('message') || 'enforcement');
        var enforced = null;
        if (record && enforce === 'suspend-offer' && record.custom.entityId && CustomObjectMgr.getCustomObject('MarketplaceOffer', record.custom.entityId)) {
            enforced = offerHelpers.decideOffer(record.custom.entityId, 'suspend', reason, actor());
        } else if (record && enforce === 'suspend-product' && record.custom.productId) {
            offerHelpers.suspendOffers('custom.productId = {0}', [record.custom.productId], reason, actor());
        } else if (record && enforce === 'suspend-seller' && record.custom.sellerId) {
            enforced = require('*/cartridge/scripts/helpers/sellerHelpers').decideSeller(record.custom.sellerId, 'suspend', reason, null, actor());
        }
        if (enforced && enforced.error) return enforced;
        return require('*/cartridge/scripts/helpers/caseHelpers').updateCase(id, param('action'), param('message'), revisionParam(), actor());
    }, URLUtils.url('MarketplaceAdmin-Case', 'id', id));
};
exports.CaseAction.public = true;

// ---------------------------------------------------------------- Finance

exports.Rules = function () {
    if (!allowed()) return;
    var scopes = require('*/cartridge/scripts/helpers/sellerOrderHelpers').COMMISSION_SCOPES;
    var result = pageOf('MarketplaceCommissionRule', 'custom.active = {0}', [true], 'custom.scope asc');
    render({
        title: 'Commission rules',
        sections: [
            { type: 'notice', text: 'Most specific scope wins: SELLER > PROMOTION > CATEGORY > TIER > DEFAULT, then priority. Without any matching rule, earnings are not booked and a case is opened. Keep one DEFAULT rule.' },
            { type: 'table', columns: ['Rule', 'Scope', 'Value', 'Rate (bps)', 'Fixed per unit', 'Priority', 'Valid', 'Refund reversal', 'Action'], rows: result.items.map(function (r) {
                var c = r.custom;
                return {
                    cells: [c.ruleId, c.scope, c.scopeValue || '', String(c.rateBps), usd(c.fixedCents || 0), String(c.priority || 0), (c.validFrom ? when(c.validFrom) : '-') + ' / ' + (c.validTo ? when(c.validTo) : '-'), c.refundReversal !== false ? 'yes' : 'no'],
                    form: { action: URLUtils.url('MarketplaceAdmin-RuleAction', 'id', c.ruleId).toString(), options: [option('deactivate', 'Deactivate')] }
                };
            }) },
            { type: 'form', title: 'New rule', action: URLUtils.url('MarketplaceAdmin-RuleAction').toString(), fields: [
                field('scope', 'Scope', { type: 'select', options: scopes.map(function (s) { return option(s, s); }) }),
                field('scopeValue', 'Scope value (seller ID, promotion ID, category ID or tier)'),
                field('rateBps', 'Rate in basis points (1000 = 10%)', { required: true }),
                field('fixedFee', 'Fixed fee per unit (USD)'),
                field('priority', 'Priority (higher wins)'),
                field('validFrom', 'Valid from (YYYY-MM-DD)'),
                field('validTo', 'Valid to (YYYY-MM-DD)'),
                field('refundReversal', 'Refund commission on refunds', { type: 'select', options: [option('true', 'Yes'), option('false', 'No')] }),
                field('description', 'Description'),
                field('action', '', { type: 'hidden', value: 'save' })
            ], submit: 'Create rule' },
            pager(result, 'Rules', {})
        ]
    });
};
exports.Rules.public = true;

exports.RuleAction = function () {
    if (!allowed()) return;
    post(function () {
        var orderHelpers = require('*/cartridge/scripts/helpers/sellerOrderHelpers');
        if (param('action') === 'deactivate') return orderHelpers.deactivateRule(param('id'), actor());
        return orderHelpers.createRule({
            scope: param('scope'), scopeValue: param('scopeValue'), rateBps: param('rateBps'), fixedFee: param('fixedFee'),
            priority: param('priority'), validFrom: param('validFrom'), validTo: param('validTo'), refundReversal: param('refundReversal'), description: param('description')
        }, actor());
    }, URLUtils.url('MarketplaceAdmin-Rules'));
};
exports.RuleAction.public = true;

var SETTLEMENT_STATUSES = ['OPEN', 'ON_HOLD', 'PAYOUT_REQUESTED', 'PAYOUT_FAILED', 'PAID', 'CANCELLED'];

exports.Settlements = function () {
    if (!allowed()) return;
    var status = allowedParam('status', SETTLEMENT_STATUSES);
    var result = status ? pageOf('MarketplaceSettlement', 'custom.status = {0}', [status], 'custom.createdAt asc') : pageOf('MarketplaceSettlement', 'custom.status != {0}', ['CANCELLED'], 'custom.createdAt desc');
    render({
        title: 'Settlements',
        sections: [
            filter('Settlements', 'status', SETTLEMENT_STATUSES),
            { type: 'table', columns: ['Settlement', 'Seller', 'Status', 'Net', 'Entries', 'Reconciliation', 'Created'], rows: result.items.map(function (s) {
                var c = s.custom;
                return { link: URLUtils.url('MarketplaceAdmin-Settlement', 'id', c.settlementId).toString(), cells: [c.settlementId, c.sellerId, c.status, usd(c.netCents), String(c.entryCount), c.reconciliationStatus || '', when(c.createdAt)] };
            }) },
            pager(result, 'Settlements', { status: status }),
            { type: 'form', title: 'Ledger adjustment', action: URLUtils.url('MarketplaceAdmin-SettlementAction', 'kind', 'adjust').toString(), fields: [
                field('sellerId', 'Seller ID', { required: true }),
                field('amount', 'Amount in USD (negative to debit)', { required: true }),
                field('reason', 'Reason', { type: 'textarea', required: true })
            ], submit: 'Book adjustment' }
        ]
    });
};
exports.Settlements.public = true;

exports.Settlement = function () {
    if (!allowed()) return;
    var id = param('id');
    var record = CustomObjectMgr.getCustomObject('MarketplaceSettlement', id);
    if (!record) {
        render({ title: 'Settlement not found', sections: [] });
        return;
    }
    var st = require('*/cartridge/scripts/helpers/settlementHelpers').getStatement(record.custom.sellerId, id);
    render({
        title: 'Settlement ' + id,
        back: URLUtils.url('MarketplaceAdmin-Settlements').toString(),
        sections: [
            { type: 'kv', rows: [['Seller', record.custom.sellerId], ['Status', st.status + (st.statusReason ? ' (' + st.statusReason + ')' : '')], ['Sales', usd(st.grossCents)], ['Shipping', usd(st.shippingCents)], ['Commission', usd(st.commissionCents)], ['Fees', usd(st.feeCents)], ['Refunds', usd(st.refundCents)], ['Commission refunds', usd(st.reversalCents)], ['Adjustments', usd(st.adjustmentCents)], ['Net', usd(st.netCents)], ['Payout reference', st.payoutReference || ''], ['Reconciliation', st.reconciliationStatus || 'not run']] },
            { type: 'form', title: 'Payout', action: URLUtils.url('MarketplaceAdmin-SettlementAction', 'id', id).toString(), fields: [
                field('action', 'Action', { type: 'select', options: [option('release', 'Release hold'), option('request', 'Request payout (provider)'), option('paid', 'Mark paid (manual payout)'), option('failed', 'Mark payout failed'), option('cancel', 'Cancel settlement')] }),
                field('reference', 'Payout reference (for paid / failed)'),
                field('reason', 'Reason (for cancel)', { type: 'textarea' })
            ], submit: 'Apply' },
            { type: 'table', title: 'Entries', columns: ['When', 'Type', 'Order', 'Amount'], rows: st.entries.map(function (e) { return { cells: [when(e.createdAt), e.entryType, e.orderNo || '', usd(e.amountCents)] }; }) }
        ]
    });
};
exports.Settlement.public = true;

exports.SettlementAction = function () {
    if (!allowed()) return;
    var id = param('id');
    var kind = param('kind');
    post(function () {
        if (kind === 'adjust') return require('*/cartridge/scripts/helpers/sellerOrderHelpers').addAdjustment(param('sellerId'), param('amount'), param('reason'), actor());
        var settlementHelpers = require('*/cartridge/scripts/helpers/settlementHelpers');
        var action = param('action');
        if (action === 'release') return settlementHelpers.releaseSettlement(id, actor());
        if (action === 'request') return settlementHelpers.requestPayout(id, actor());
        if (action === 'paid') return settlementHelpers.recordPayoutResult(id, 'PAID', param('reference'), actor());
        if (action === 'failed') return settlementHelpers.recordPayoutResult(id, 'FAILED', param('reference'), actor());
        if (action === 'cancel') return settlementHelpers.cancelSettlement(id, param('reason'), actor());
        return marketplaceHelpers.errorResult('invalid', { action: 'invalid' });
    }, kind === 'adjust' ? URLUtils.url('MarketplaceAdmin-Settlements') : URLUtils.url('MarketplaceAdmin-Settlement', 'id', id));
};
exports.SettlementAction.public = true;

var ORDER_STATUSES = ['AWAITING_FULFILLMENT', 'PARTIALLY_SHIPPED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'CLOSED'];

exports.SellerOrders = function () {
    if (!allowed()) return;
    var status = allowedParam('status', ORDER_STATUSES);
    var sellerId = param('sellerId');
    var query = 'custom.status != {0}';
    var args = ['PENDING_PAYMENT'];
    if (status) {
        query += ' AND custom.status = {1}';
        args.push(status);
    }
    if (sellerId) {
        query += ' AND custom.sellerId = {' + args.length + '}';
        args.push(sellerId);
    }
    var result = pageOf('MarketplaceSellerOrder', query, args, 'custom.orderCreatedAt desc');
    render({
        title: 'Seller orders',
        sections: [
            filter('SellerOrders', 'status', ORDER_STATUSES),
            { type: 'table', columns: ['Order', 'Seller', 'Status', 'Merchandise', 'Commission', 'Ship by', 'Created'], rows: result.items.map(function (r) {
                var c = r.custom;
                return { link: URLUtils.url('MarketplaceAdmin-SellerOrder', 'orderNo', c.orderNo, 'sellerId', c.sellerId).toString(), cells: [c.orderNo, c.sellerId, c.status, usd(c.merchandiseCents), usd(c.commissionCents), when(c.promisedShipBy), when(c.orderCreatedAt)] };
            }) },
            pager(result, 'SellerOrders', { status: status, sellerId: sellerId })
        ]
    });
};
exports.SellerOrders.public = true;

exports.SellerOrder = function () {
    if (!allowed()) return;
    var orderNo = param('orderNo');
    var sellerId = param('sellerId');
    var record = CustomObjectMgr.getCustomObject('MarketplaceSellerOrder', orderNo + ':' + sellerId);
    if (!record) {
        render({ title: 'Seller order not found', sections: [] });
        return;
    }
    var v = require('*/cartridge/scripts/helpers/sellerOrderHelpers').getSellerOrderView(record, false);
    render({
        title: 'Seller order ' + orderNo + ' / ' + sellerId,
        back: URLUtils.url('MarketplaceAdmin-SellerOrders').toString(),
        sections: [
            { type: 'kv', rows: [['Status', v.status], ['Merchandise', usd(v.merchandiseCents)], ['Shipping', usd(v.shippingCents)], ['Commission', usd(v.commissionCents)], ['Paid', when(v.paidAt)], ['Ship by', when(v.promisedShipBy)], ['Shipped', when(v.shippedAt)], ['Delivered', when(v.deliveredAt)]] },
            { type: 'table', title: 'Lines', columns: ['Line ID', 'Product', 'Qty', 'Net', 'Shipped', 'Cancelled', 'Cancel requested', 'Returned', 'Refunded'], rows: v.lines.map(function (l) {
                return { cells: [l.lineId, l.productName, String(l.quantity), usd(l.netCents), String(l.shippedQty), String(l.cancelledQty), String(l.cancelRequestedQty), String(l.returnedQty), usd(l.refundedCents)] };
            }) },
            { type: 'table', title: 'Shipments', columns: ['When', 'Carrier', 'Tracking'], rows: v.shipments.map(function (s) { return { cells: [s.shippedAt.slice(0, 16), s.carrier, s.trackingNumber] }; }) },
            { type: 'form', title: 'Record event (refunds are issued to the shopper by the payment or OMS process; this records the seller side)', action: URLUtils.url('MarketplaceAdmin-SellerOrderAction', 'orderNo', orderNo, 'sellerId', sellerId).toString(), fields: [
                field('type', 'Event', { type: 'select', options: [option('DELIVERED', 'Delivered'), option('CANCELLED', 'Cancelled units'), option('RETURNED', 'Returned units'), option('REFUNDED', 'Refunded amount')] }),
                field('lineId', 'Line ID (not for delivered)'),
                field('value', 'Quantity, or amount in USD for refunds')
            ], submit: 'Record' }
        ]
    });
};
exports.SellerOrder.public = true;

exports.SellerOrderAction = function () {
    if (!allowed()) return;
    var orderNo = param('orderNo');
    var sellerId = param('sellerId');
    post(function () {
        var type = param('type');
        var event = { eventId: 'BM-' + marketplaceHelpers.randomHex(12), type: type, lines: [] };
        if (type === 'REFUNDED') {
            var cents = marketplaceHelpers.toCents(param('value'));
            if (!cents) return marketplaceHelpers.errorResult('invalid', { value: 'invalid' });
            event.lines.push({ lineId: param('lineId'), amountCents: cents });
        } else if (type !== 'DELIVERED') {
            event.lines.push({ lineId: param('lineId'), quantity: Number(param('value')) });
        }
        return require('*/cartridge/scripts/helpers/sellerOrderHelpers').applyOrderEvent(orderNo, sellerId, event, actor());
    }, URLUtils.url('MarketplaceAdmin-SellerOrder', 'orderNo', orderNo, 'sellerId', sellerId));
};
exports.SellerOrderAction.public = true;
