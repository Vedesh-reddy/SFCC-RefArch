'use strict';

/**
 * Product submissions. A seller's new product (or a change to a product the seller owns) is
 * a MarketplaceSubmission first; nothing reaches the catalog until a reviewer approves it
 * and the publishing job has created and verified the product (catalogImportHelpers).
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');
var marketplaceHelpers = require('*/cartridge/scripts/helpers/marketplaceHelpers');
var sellerHelpers = require('*/cartridge/scripts/helpers/sellerHelpers');
var offerHelpers = require('*/cartridge/scripts/helpers/offerHelpers');

var log = Logger.getLogger('plugin-seller', 'seller-catalog');

var MAX_VARIANTS = 50;
var EDITABLE = ['DRAFT', 'CHANGES_REQUESTED'];
var SUBMISSION_FLOW = {
    DRAFT: ['SUBMITTED'],
    SUBMITTED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED'],
    UNDER_REVIEW: ['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'],
    CHANGES_REQUESTED: ['SUBMITTED'],
    APPROVED: ['PROVISIONING'],
    PROVISIONING: ['PUBLISHED', 'PROVISIONING_FAILED'],
    PROVISIONING_FAILED: ['PROVISIONING', 'PROVISIONING_FAILED', 'REJECTED'],
    PUBLISHED: ['SUSPENDED'],
    SUSPENDED: ['PUBLISHED'],
    REJECTED: []
};
var ID = /^[A-Za-z0-9._-]+$/;

/**
 * Checks submission fields. Saving a draft allows missing fields; submitting does not.
 * @param {Object} data - untrusted fields (price in dollars; variants as [{sellerSku, color, size, quantity, price, gtin}])
 * @param {boolean} partial - true for a draft save
 * @returns {{value: Object, invalid: Object}} clean payload (amounts in cents) and problems
 */
function checkSubmission(data, partial) {
    var value = {};
    var invalid = {};
    var has = function (name) { return data[name] !== undefined && data[name] !== null && data[name] !== ''; };
    var text = function (name, min, max, pattern, multiline) {
        if (!has(name)) {
            if (!partial && min > 0) invalid[name] = 'required';
            return;
        }
        var v = marketplaceHelpers.cleanText(data[name]);
        if (v.length < min || v.length > max || (!multiline && /[\r\n]/.test(v)) || (pattern && !pattern.test(v))) invalid[name] = 'invalid';
        else value[name] = v;
    };
    var number = function (name, max, required) {
        if (!has(name)) {
            if (!partial && required) invalid[name] = 'required';
            return;
        }
        var n = Number(data[name]);
        if (Math.floor(n) !== n || n < 0 || n > max) invalid[name] = 'invalid';
        else value[name] = n;
    };
    var mode = String(data.mode || '').toUpperCase();
    if (['NEW', 'UPDATE'].indexOf(mode) >= 0) value.mode = mode;
    else if (has('mode') || !partial) invalid.mode = 'invalid';
    if (has('sellerSku')) {
        value.sellerSku = marketplaceHelpers.cleanText(data.sellerSku).toUpperCase();
        if (!offerHelpers.SKU.test(value.sellerSku)) invalid.sellerSku = 'invalid';
    } else if (!partial) {
        invalid.sellerSku = 'required';
    }
    text('productId', 0, 100, ID);
    text('name', 3, 200);
    text('shortDescription', 10, 1000, null, true);
    text('longDescription', 0, 8000, null, true);
    text('brand', 1, 80);
    text('categoryId', 1, 256, ID);
    text('gtin', 0, 14, /^\d{8}$|^\d{12,14}$/);
    text('taxClassId', 0, 60, ID);
    text('warranty', 0, 500, null, true);
    var type = String(data.productType || '').toUpperCase();
    if (['SIMPLE', 'MASTER'].indexOf(type) >= 0) value.productType = type;
    else if (has('productType') || !partial) invalid.productType = 'invalid';
    if (has('price')) {
        value.priceCents = marketplaceHelpers.toCents(data.price);
        if (!value.priceCents) invalid.price = 'invalid';
    } else if (!partial) {
        invalid.price = 'required';
    }
    number('quantity', 100000, true);
    number('weightOz', 16000);
    number('lengthIn', 200);
    number('widthIn', 200);
    number('heightIn', 200);
    number('returnDays', 365);
    if (data.returnable !== undefined) value.returnable = [true, 'true', 'on'].indexOf(data.returnable) >= 0;
    if (data.specifications !== undefined) {
        var specs = (Array.isArray(data.specifications) ? data.specifications : String(data.specifications).split(/\r?\n/)).map(marketplaceHelpers.cleanText).filter(Boolean);
        if (specs.length > 30 || specs.some(function (s) { return !/^[^:]{1,60}:.{1,138}$/.test(s); })) invalid.specifications = 'invalid';
        else value.specifications = specs;
    }
    if (data.complianceDocumentIds !== undefined) {
        var docs = (Array.isArray(data.complianceDocumentIds) ? data.complianceDocumentIds : String(data.complianceDocumentIds).split(/[\s,]+/)).filter(Boolean);
        if (docs.length > 5 || docs.some(function (d) { return !/^DOC-[A-F0-9]{24}$/.test(d); })) invalid.complianceDocumentIds = 'invalid';
        else value.complianceDocumentIds = docs;
    }
    if (value.gtin && !offerHelpers.isValidGtin(value.gtin)) invalid.gtin = 'check-digit';
    if (value.mode === 'UPDATE' && !value.productId) invalid.productId = 'required';
    if (value.taxClassId && sellerHelpers.getListPreference('sellerAllowedTaxClassIds').indexOf(value.taxClassId) < 0) invalid.taxClassId = 'invalid';
    if (data.variants !== undefined) {
        var list = Array.isArray(data.variants) ? data.variants : [];
        var seen = {};
        value.variants = [];
        if (list.length > MAX_VARIANTS) invalid.variants = 'too-many';
        list.slice(0, MAX_VARIANTS).forEach(function (item, index) {
            var variant = {
                sellerSku: marketplaceHelpers.cleanText(item.sellerSku).toUpperCase(),
                values: { color: marketplaceHelpers.cleanText(item.color || (item.values && item.values.color)) || undefined, size: marketplaceHelpers.cleanText(item.size || (item.values && item.values.size)) || undefined },
                quantity: Number(item.quantity),
                priceCents: item.price !== undefined && item.price !== '' ? marketplaceHelpers.toCents(item.price) : undefined,
                gtin: item.gtin ? String(item.gtin) : undefined
            };
            var combination = (variant.values.color || '') + '|' + (variant.values.size || '');
            var ok = offerHelpers.SKU.test(variant.sellerSku) && combination !== '|' && !seen[combination] && !seen[variant.sellerSku]
                && Math.floor(variant.quantity) === variant.quantity && variant.quantity >= 0 && variant.quantity <= 100000
                && variant.priceCents !== null && (!variant.values.color || /^[A-Za-z0-9 -]{1,40}$/.test(variant.values.color))
                && (!variant.values.size || /^[A-Za-z0-9 ./-]{1,20}$/.test(variant.values.size)) && (!variant.gtin || offerHelpers.isValidGtin(variant.gtin));
            if (!ok) {
                invalid['variants.' + index] = 'invalid';
                return;
            }
            seen[combination] = true;
            seen[variant.sellerSku] = true;
            value.variants.push(variant);
        });
    }
    if (!partial && value.productType === 'MASTER' && !(value.variants && value.variants.length)) invalid.variants = 'required';
    return { value: value, invalid: invalid };
}

/**
 * @param {Object} payload - stored payload (cents)
 * @returns {Object} the payload as form fields again (dollars), for a full check on submit
 */
function toFields(payload) {
    var dollars = function (cents) { return typeof cents === 'number' ? (cents / 100).toFixed(2) : cents; };
    var fields = Object.assign({}, payload, { price: dollars(payload.priceCents) });
    if (payload.variants) {
        fields.variants = payload.variants.map(function (v) { return { sellerSku: v.sellerSku, color: v.values.color, size: v.values.size, quantity: v.quantity, price: dollars(v.priceCents), gtin: v.gtin }; });
    }
    return fields;
}

/**
 * @param {dw.object.CustomObject} submission - submission
 * @returns {Object} view
 */
function getSubmissionView(submission) {
    var c = submission.custom;
    return {
        submissionId: c.submissionId,
        status: c.status,
        mode: c.mode,
        productId: c.productId || null,
        sellerSku: c.sellerSku,
        payload: marketplaceHelpers.parseJson(c.payload, {}),
        images: marketplaceHelpers.parseJson(c.images, []).map(function (image, index) { return { index: index, type: image.type, size: image.size }; }),
        qualityFlags: c.qualityFlags ? Array.prototype.slice.call(c.qualityFlags) : [],
        reviewNotes: c.reviewNotes || null,
        lastError: c.lastError || null,
        submittedAt: c.submittedAt || null,
        publishedAt: c.publishedAt || null,
        revision: c.revision || 0,
        updatedAt: c.updatedAt
    };
}

/**
 * @param {Object} context - seller context
 * @param {string} submissionId - submission
 * @returns {?dw.object.CustomObject} the submission, only when it is the seller's own
 */
function getOwnSubmission(context, submissionId) {
    var submission = CustomObjectMgr.getCustomObject('MarketplaceSubmission', String(submissionId));
    return submission && submission.custom.sellerId === context.sellerId ? submission : null;
}

/**
 * @param {Object} context - seller context
 * @param {Object} payload - checked payload
 * @returns {boolean} true unless it changes a product another seller (or the merchant) owns
 */
function canChangeProduct(context, payload) {
    if (payload.mode !== 'UPDATE') return true;
    var product = require('dw/catalog/ProductMgr').getProduct(payload.productId);
    return !!product && product.custom.mktOwnerSellerId === context.sellerId;
}

/**
 * @param {Object} context - seller context (catalog.write)
 * @param {Object} data - draft fields
 * @returns {Object} result with submissionView
 */
function createDraft(context, data) {
    var check = checkSubmission(data || {}, true);
    var payload = check.value;
    if (!payload.mode) check.invalid.mode = 'required';
    if (!payload.sellerSku) check.invalid.sellerSku = 'required';
    if (Object.keys(check.invalid).length) return marketplaceHelpers.errorResult('invalid', check.invalid);
    if (!canChangeProduct(context, payload)) return marketplaceHelpers.errorResult('invalid', { productId: 'not-owned' });
    var open = marketplaceHelpers.queryCount('MarketplaceSubmission', 'custom.sellerId = {0} AND custom.status != {1} AND custom.status != {2}', [context.sellerId, 'REJECTED', 'PUBLISHED']);
    if (open >= sellerHelpers.getPreference('sellerMaximumProducts')) return marketplaceHelpers.errorResult('limit-reached');
    var submission;
    Transaction.wrap(function () {
        submission = CustomObjectMgr.createCustomObject('MarketplaceSubmission', marketplaceHelpers.createId('SUB'));
        var c = submission.custom;
        c.sellerId = context.sellerId;
        c.status = 'DRAFT';
        c.mode = payload.mode;
        c.productId = payload.mode === 'UPDATE' ? payload.productId : null;
        c.sellerSku = payload.sellerSku;
        c.gtin = payload.gtin || null;
        c.titleHash = payload.name ? offerHelpers.getTitleHash(payload.brand, payload.name) : null;
        c.payload = JSON.stringify(payload);
        c.images = '[]';
        c.provisionAttempts = 0;
        c.createdAt = new Date();
        c.updatedAt = new Date();
        c.revision = 0;
        marketplaceHelpers.logAudit({ entityType: 'SUBMISSION', entityId: c.submissionId, sellerId: context.sellerId, action: 'CREATE', actor: context.actor, to: 'DRAFT' });
    });
    return { error: false, submissionView: getSubmissionView(submission) };
}

/**
 * @param {Object} context - seller context (catalog.write)
 * @param {string} submissionId - submission
 * @param {Object} data - changed fields
 * @param {?number} revision - revision the form was rendered from
 * @returns {Object} result with submissionView
 */
function updateDraft(context, submissionId, data, revision) {
    var submission = getOwnSubmission(context, submissionId);
    if (!submission) return marketplaceHelpers.errorResult('not-found');
    var c = submission.custom;
    if (EDITABLE.indexOf(c.status) < 0) return marketplaceHelpers.errorResult('not-allowed-now');
    if (revision !== null && revision !== undefined && revision !== (c.revision || 0)) return marketplaceHelpers.errorResult('stale');
    var check = checkSubmission(data || {}, true);
    if (Object.keys(check.invalid).length) return marketplaceHelpers.errorResult('invalid', check.invalid);
    var payload = Object.assign(marketplaceHelpers.parseJson(c.payload, {}), check.value);
    payload.mode = c.mode;
    if (c.mode === 'UPDATE') payload.productId = c.productId;
    Transaction.wrap(function () {
        c.payload = JSON.stringify(payload);
        c.sellerSku = payload.sellerSku;
        c.gtin = payload.gtin || null;
        c.titleHash = payload.name ? offerHelpers.getTitleHash(payload.brand, payload.name) : null;
        c.updatedAt = new Date();
        c.revision = (c.revision || 0) + 1;
        marketplaceHelpers.logAudit({ entityType: 'SUBMISSION', entityId: c.submissionId, sellerId: context.sellerId, action: 'UPDATE', actor: context.actor, detail: { fields: Object.keys(check.value).join(',') } });
    });
    return { error: false, submissionView: getSubmissionView(submission) };
}

/**
 * @param {Object} context - seller context (catalog.write)
 * @param {string} submissionId - submission
 * @param {dw.web.HttpParameterMap} params - multipart request with "images" files
 * @returns {Object} result with submissionView
 */
function addImages(context, submissionId, params) {
    var submission = getOwnSubmission(context, submissionId);
    if (!submission) return marketplaceHelpers.errorResult('not-found');
    if (EDITABLE.indexOf(submission.custom.status) < 0) return marketplaceHelpers.errorResult('not-allowed-now');
    var images = marketplaceHelpers.parseJson(submission.custom.images, []);
    var room = sellerHelpers.getPreference('sellerMaxImagesPerProduct') - images.length;
    if (room <= 0) return marketplaceHelpers.errorResult('limit-reached');
    var files = require('*/cartridge/scripts/helpers/sellerDocumentHelpers').saveUploads(params, {
        field: 'images',
        folder: 'images',
        allowedTypes: ['image/png', 'image/jpeg', 'image/webp'],
        maxBytes: sellerHelpers.getPreference('sellerImageMaxBytes'),
        maxFiles: room
    });
    if (!files) return marketplaceHelpers.errorResult('unavailable');
    if (!files.length) return marketplaceHelpers.errorResult('invalid', { images: 'rejected' });
    Transaction.wrap(function () {
        files.forEach(function (file) { images.push({ path: file.path, type: file.type, extension: file.extension, size: file.size, sha256: file.sha256 }); });
        submission.custom.images = JSON.stringify(images);
        submission.custom.updatedAt = new Date();
        marketplaceHelpers.logAudit({ entityType: 'SUBMISSION', entityId: submission.custom.submissionId, sellerId: context.sellerId, action: 'ADD_IMAGES', actor: context.actor, detail: { count: files.length } });
    });
    return { error: false, submissionView: getSubmissionView(submission) };
}

/**
 * @param {Object} context - seller context (catalog.write)
 * @param {string} submissionId - submission
 * @param {number} index - image position
 * @returns {Object} result with submissionView
 */
function removeImage(context, submissionId, index) {
    var submission = getOwnSubmission(context, submissionId);
    if (!submission) return marketplaceHelpers.errorResult('not-found');
    if (EDITABLE.indexOf(submission.custom.status) < 0) return marketplaceHelpers.errorResult('not-allowed-now');
    var images = marketplaceHelpers.parseJson(submission.custom.images, []);
    if (!(index >= 0 && index < images.length)) return marketplaceHelpers.errorResult('not-found');
    var removed = images.splice(index, 1)[0];
    require('*/cartridge/scripts/helpers/sellerDocumentHelpers').deleteStoredFile(removed.path);
    Transaction.wrap(function () {
        submission.custom.images = JSON.stringify(images);
        submission.custom.updatedAt = new Date();
    });
    return { error: false, submissionView: getSubmissionView(submission) };
}

/**
 * Inside a transaction: creates (or reprices) the seller's not yet active offers for an
 * approved submission. They become active when the product is published.
 * @param {string} sellerId - seller
 * @param {dw.object.CustomObject} submission - approved submission
 * @param {Object} payload - payload
 */
function prepareOffers(sellerId, submission, payload) {
    var productId = submission.custom.productId;
    var targets = payload.productType === 'MASTER'
        ? payload.variants.map(function (v) { return { productId: productId + '-' + v.sellerSku, sku: v.sellerSku, priceCents: v.priceCents || payload.priceCents, quantity: v.quantity }; })
        : [{ productId: productId, sku: payload.sellerSku, priceCents: payload.priceCents, quantity: payload.quantity }];
    targets.forEach(function (target) {
        var key = sellerId + ':' + target.productId;
        var offer = CustomObjectMgr.getCustomObject('MarketplaceOffer', key);
        var now = new Date();
        if (!offer) {
            offer = CustomObjectMgr.createCustomObject('MarketplaceOffer', key);
            offer.custom.sellerId = sellerId;
            offer.custom.productId = target.productId;
            offer.custom.sellerSku = target.sku;
            offer.custom.status = 'DRAFT';
            offer.custom.reviewState = 'NONE';
            offer.custom.condition = 'NEW';
            offer.custom.returnable = payload.returnable !== false;
            offer.custom.returnDays = payload.returnDays !== undefined ? payload.returnDays : null;
            offer.custom.warranty = payload.warranty || null;
            offer.custom.createdAt = now;
            offer.custom.revision = 0;
        }
        offer.custom.priceCents = target.priceCents;
        offer.custom.stock = target.quantity;
        offer.custom.stockUpdatedAt = now;
        offer.custom.stockDirty = true;
        offer.custom.priceDirty = true;
        offer.custom.submissionId = submission.custom.submissionId;
        offer.custom.updatedAt = now;
    });
}

/**
 * Checks the whole submission, runs the listing checks and sends it to review. With review
 * switched off and no flag raised, it is approved at once.
 * @param {Object} context - seller context (catalog.write)
 * @param {string} submissionId - submission
 * @returns {Object} result with submissionView
 */
function submitProduct(context, submissionId) {
    var submission = getOwnSubmission(context, submissionId);
    if (!submission) return marketplaceHelpers.errorResult('not-found');
    var c = submission.custom;
    var from = c.status;
    if (EDITABLE.indexOf(from) < 0) return marketplaceHelpers.errorResult('not-allowed-now');
    var check = checkSubmission(toFields(marketplaceHelpers.parseJson(c.payload, {})), false);
    if (Object.keys(check.invalid).length) return marketplaceHelpers.errorResult('invalid', check.invalid);
    var payload = check.value;
    if (!canChangeProduct(context, payload)) return marketplaceHelpers.errorResult('invalid', { productId: 'not-owned' });
    var images = marketplaceHelpers.parseJson(c.images, []);
    if (!images.length) return marketplaceHelpers.errorResult('invalid', { images: 'required' });
    var category = offerHelpers.checkCategory(payload.categoryId, context.seller);
    if (category.invalid) return marketplaceHelpers.errorResult('invalid', { categoryId: category.invalid });
    if (category.restricted) {
        var compliant = (payload.complianceDocumentIds || []).length > 0 && payload.complianceDocumentIds.every(function (docId) {
            var d = CustomObjectMgr.getCustomObject('MarketplaceDocument', docId);
            return d && d.custom.sellerId === context.sellerId && d.custom.docType === 'COMPLIANCE' && d.custom.state === 'ACTIVE' && d.custom.reviewStatus !== 'REJECTED';
        });
        if (!compliant) return marketplaceHelpers.errorResult('invalid', { complianceDocumentIds: 'required' });
    }
    var price = offerHelpers.checkPrice(payload.priceCents, payload.mode === 'UPDATE' ? offerHelpers.getReferencePrice(payload.productId, null) : null);
    if (price.invalid) return marketplaceHelpers.errorResult('invalid', { price: price.invalid });
    var flags = offerHelpers.findDuplicates(context.sellerId, payload, c.submissionId);
    if (flags.indexOf('DUPLICATE_SKU') >= 0) return marketplaceHelpers.errorResult('invalid', { sellerSku: 'duplicate' });
    if (price.suspicious) flags.push('SUSPICIOUS_PRICE');
    if (category.restricted) flags.push('RESTRICTED_CATEGORY');
    var autoApprove = sellerHelpers.getPreference('sellerProductApprovalRequired') === false && flags.length === 0;
    var to = autoApprove ? 'APPROVED' : 'SUBMITTED';
    Transaction.wrap(function () {
        c.status = to;
        c.payload = JSON.stringify(payload);
        c.payloadHash = marketplaceHelpers.sha256(JSON.stringify(payload) + JSON.stringify(images));
        c.productId = payload.mode === 'UPDATE' ? payload.productId : sellerHelpers.getPreference('sellerProductIdPattern').replace('{sellerId}', context.sellerId).replace('{sku}', payload.sellerSku);
        c.qualityFlags = flags;
        c.submittedAt = new Date();
        c.updatedAt = new Date();
        c.nextAttemptAt = autoApprove ? new Date() : null;
        c.revision = (c.revision || 0) + 1;
        marketplaceHelpers.logAudit({ entityType: 'SUBMISSION', entityId: c.submissionId, sellerId: context.sellerId, action: 'SUBMIT', actor: context.actor, from: from, to: to, detail: { flags: flags.join(',') } });
        var caseTypes = { DUPLICATE_GTIN: 'DUPLICATE_LISTING', DUPLICATE_TITLE: 'DUPLICATE_LISTING', SUSPICIOUS_PRICE: 'SUSPICIOUS_PRICE', RESTRICTED_CATEGORY: 'RESTRICTED_CATEGORY' };
        flags.forEach(function (flag) {
            require('*/cartridge/scripts/helpers/caseHelpers').openCase({ caseType: caseTypes[flag], sellerId: context.sellerId, entityId: c.submissionId, severity: 'MEDIUM', detail: { flag: flag }, dedupeKey: flag + ':' + c.submissionId });
        });
        if (to === 'SUBMITTED') marketplaceHelpers.notify(marketplaceHelpers.ADMIN, 'ADMIN_SUBMISSION_PENDING', { submissionId: c.submissionId });
        if (autoApprove) prepareOffers(context.sellerId, submission, payload);
    });
    return { error: false, submissionView: getSubmissionView(submission) };
}

var DECISIONS = {
    startReview: { from: ['SUBMITTED'], to: 'UNDER_REVIEW' },
    approve: { from: ['SUBMITTED', 'UNDER_REVIEW'], to: 'APPROVED', notice: 'SUBMISSION_APPROVED' },
    reject: { from: ['SUBMITTED', 'UNDER_REVIEW', 'PROVISIONING_FAILED'], to: 'REJECTED', notice: 'SUBMISSION_REJECTED', reason: true },
    requestChanges: { from: ['SUBMITTED', 'UNDER_REVIEW'], to: 'CHANGES_REQUESTED', notice: 'SUBMISSION_CHANGES_REQUESTED', reason: true },
    retry: { from: ['PROVISIONING_FAILED'], to: 'PROVISIONING_FAILED' },
    suspend: { from: ['PUBLISHED'], to: 'SUSPENDED', notice: 'LISTING_SUSPENDED', reason: true },
    reinstate: { from: ['SUSPENDED'], to: 'PUBLISHED', notice: 'LISTING_REINSTATED' }
};

/**
 * Business Manager decision on a submission.
 * @param {string} submissionId - submission
 * @param {string} action - key of DECISIONS
 * @param {string} reason - notes for the seller (required to reject, request changes or suspend)
 * @param {?number} revision - revision the page showed
 * @param {Object} by - admin actor
 * @returns {Object} result
 */
function decideSubmission(submissionId, action, reason, revision, by) {
    var rule = DECISIONS[action];
    var submission = CustomObjectMgr.getCustomObject('MarketplaceSubmission', String(submissionId));
    if (!rule) return marketplaceHelpers.errorResult('invalid', { action: 'invalid' });
    if (!submission) return marketplaceHelpers.errorResult('not-found');
    var c = submission.custom;
    var from = c.status;
    if (rule.from.indexOf(from) < 0 || !marketplaceHelpers.canMove(SUBMISSION_FLOW, from, rule.to)) return marketplaceHelpers.errorResult('not-allowed-now');
    if (revision !== null && revision !== undefined && revision !== (c.revision || 0)) return marketplaceHelpers.errorResult('stale');
    var text = marketplaceHelpers.cleanText(reason).slice(0, 2000);
    if (rule.reason && text.length < 3) return marketplaceHelpers.errorResult('invalid', { reason: 'required' });
    var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', c.sellerId);
    if (action === 'approve' && (!seller || seller.custom.status !== 'APPROVED')) return marketplaceHelpers.errorResult('invalid', { seller: 'not-approved' });
    Transaction.wrap(function () {
        c.status = rule.to;
        if (text) c.reviewNotes = text;
        c.decidedBy = by.ref;
        c.decidedAt = new Date();
        c.updatedAt = new Date();
        if (action === 'approve' || action === 'retry') {
            c.nextAttemptAt = new Date();
            c.provisionAttempts = 0;
            c.lastError = null;
        }
        c.revision = (c.revision || 0) + 1;
        if (action === 'approve') prepareOffers(c.sellerId, submission, marketplaceHelpers.parseJson(c.payload, {}));
        if (action === 'suspend' || action === 'reinstate') {
            marketplaceHelpers.queryPage('MarketplaceOffer', 'custom.submissionId = {0}', null, [c.submissionId], 0, 100).items.forEach(function (offer) {
                if (action === 'suspend' && ['ACTIVE', 'INACTIVE'].indexOf(offer.custom.status) >= 0) {
                    offer.custom.status = 'SUSPENDED';
                    offer.custom.statusReason = text;
                    offer.custom.priceDirty = true;
                } else if (action === 'reinstate' && offer.custom.status === 'SUSPENDED') {
                    offer.custom.status = 'ACTIVE';
                    offer.custom.statusReason = null;
                    offer.custom.priceDirty = true;
                }
            });
        }
        marketplaceHelpers.logAudit({ entityType: 'SUBMISSION', entityId: c.submissionId, sellerId: c.sellerId, action: 'ADMIN_' + action.toUpperCase(), actor: by, from: from, to: rule.to, reason: text });
        if (rule.notice) marketplaceHelpers.notify(c.sellerId, rule.notice, { submissionId: c.submissionId });
    });
    log.info('Submission {0} moved {1} -> {2} by {3}', c.submissionId, from, rule.to, by.ref);
    return { error: false };
}

/**
 * Business Manager: field-by-field changes of an update submission against the live product.
 * @param {string} submissionId - submission
 * @returns {Array<{field: string, current: *, proposed: *}>} differences
 */
function getProductChanges(submissionId) {
    var submission = CustomObjectMgr.getCustomObject('MarketplaceSubmission', String(submissionId));
    if (!submission) return [];
    var payload = marketplaceHelpers.parseJson(submission.custom.payload, {});
    var product = submission.custom.productId ? require('dw/catalog/ProductMgr').getProduct(submission.custom.productId) : null;
    var priceBookId = sellerHelpers.getPreference('sellerPriceBookId');
    var current = product ? {
        name: product.name,
        shortDescription: product.shortDescription ? product.shortDescription.markup : null,
        longDescription: product.longDescription ? product.longDescription.markup : null,
        brand: product.brand,
        categoryId: product.primaryCategory ? product.primaryCategory.ID : null,
        gtin: product.UPC,
        priceCents: priceBookId ? marketplaceHelpers.centsOf(product.priceModel.getPriceBookPrice(priceBookId)) : null
    } : {};
    return ['name', 'shortDescription', 'longDescription', 'brand', 'categoryId', 'gtin', 'priceCents'].map(function (field) {
        return { field: field, current: current[field] === undefined ? null : current[field], proposed: payload[field] === undefined ? null : payload[field] };
    }).filter(function (row) { return String(row.current) !== String(row.proposed); });
}

/**
 * @param {Object} context - seller context (catalog.read)
 * @param {?string} status - filter
 * @param {number} offset - rows to skip
 * @param {number} limit - page size
 * @returns {{items: Object[], total: number}} the seller's submissions
 */
function getSellerSubmissions(context, status, offset, limit) {
    var page = marketplaceHelpers.queryPage('MarketplaceSubmission', 'custom.sellerId = {0}' + (status ? ' AND custom.status = {1}' : ''), 'custom.updatedAt desc', status ? [context.sellerId, status] : [context.sellerId], offset, limit);
    return { items: page.items.map(getSubmissionView), total: page.total };
}

module.exports = {
    SUBMISSION_FLOW: SUBMISSION_FLOW,
    checkSubmission: checkSubmission,
    getSubmissionView: getSubmissionView,
    getOwnSubmission: getOwnSubmission,
    createDraft: createDraft,
    updateDraft: updateDraft,
    addImages: addImages,
    removeImage: removeImage,
    submitProduct: submitProduct,
    decideSubmission: decideSubmission,
    getProductChanges: getProductChanges,
    getSellerSubmissions: getSellerSubmissions
};
