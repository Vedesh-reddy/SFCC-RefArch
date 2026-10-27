'use strict';

/**
 * Seller verification documents and product image uploads. Files are stored in a private
 * IMPEX folder (only reachable with Business Manager WebDAV access, never through a
 * storefront URL) under generated names. The file type is read from the file's first
 * bytes; the browser's name and declared type are not trusted.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var File = require('dw/io/File');
var Logger = require('dw/system/Logger');
var marketplaceHelpers = require('*/cartridge/scripts/helpers/marketplaceHelpers');
var sellerHelpers = require('*/cartridge/scripts/helpers/sellerHelpers');

var log = Logger.getLogger('plugin-seller', 'seller-security');

var ROOT = File.IMPEX + '/plugin-seller-private';
var DOCUMENT_TYPES = ['BUSINESS_REGISTRATION', 'TAX_CERTIFICATE', 'IDENTITY', 'BANK_PROOF', 'COMPLIANCE', 'OTHER'];
var MAX_DOCUMENTS = 30;
var DAY = 86400000;
var SIGNATURES = [
    { type: 'application/pdf', extension: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2D] },
    { type: 'image/png', extension: 'png', bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
    { type: 'image/jpeg', extension: 'jpg', bytes: [0xFF, 0xD8, 0xFF] },
    { type: 'image/webp', extension: 'webp', bytes: [0x52, 0x49, 0x46, 0x46], extra: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] } }
];

/**
 * @param {number[]} head - first bytes of a file
 * @returns {?{type: string, extension: string}} detected file type
 */
function detectFileType(head) {
    var matches = function (bytes, offset) { return bytes.every(function (b, i) { return head[offset + i] === b; }); };
    var found = SIGNATURES.filter(function (sig) { return matches(sig.bytes, 0) && (!sig.extra || matches(sig.extra.bytes, sig.extra.offset)); })[0];
    return found ? { type: found.type, extension: found.extension } : null;
}

/**
 * Reads a stored upload once: first bytes for the type, and a SHA-256 of the whole file.
 * @param {dw.io.File} file - upload
 * @returns {{head: number[], sha256: string}} file facts
 */
function inspectFile(file) {
    var RandomAccessFileReader = require('dw/io/RandomAccessFileReader');
    var MessageDigest = require('dw/crypto/MessageDigest');
    var Encoding = require('dw/crypto/Encoding');
    var digest = new MessageDigest(MessageDigest.DIGEST_SHA_256);
    var reader = new RandomAccessFileReader(file);
    var head = [];
    try {
        var chunk = reader.readBytes(RandomAccessFileReader.MAX_READ_BYTES);
        while (chunk && chunk.length > 0) {
            for (var i = 0; head.length < 16 && i < chunk.length; i++) head.push((chunk.byteAt(i) + 256) % 256);
            digest.updateBytes(chunk);
            chunk = reader.readBytes(RandomAccessFileReader.MAX_READ_BYTES);
        }
    } finally {
        reader.close();
    }
    return { head: head, sha256: Encoding.toHex(digest.digest()) };
}

/**
 * Saves the files of a multipart request into a private folder, keeping only allowed types.
 * @param {dw.web.HttpParameterMap} params - request parameters
 * @param {Object} options - {field, folder, allowedTypes, maxBytes, maxFiles}
 * @returns {Object[]|null} accepted files: {path, name, type, extension, size, sha256, originalName}; null when the folder is missing
 */
function saveUploads(params, options) {
    if (!/^[A-Za-z0-9/_-]{1,200}$/.test(options.folder) || options.folder.indexOf('..') >= 0) return [];
    var dir = new File(ROOT + '/' + options.folder);
    // storefront requests may not create folders (quota api.dw.io.File.mkdirs()@SF is 0); they are created at deployment
    if (!dir.exists()) {
        log.error('Upload folder {0} is missing; create it as described in DEPLOYMENT.md', options.folder);
        return null;
    }
    var pending = [];
    params.processMultipart(function (field, contentType, originalName) {
        if (field !== options.field || pending.length >= options.maxFiles) return null;
        // final name up front: storefront requests may not rename files (renameTo@SF quota is 0)
        var target = new File(dir, marketplaceHelpers.randomHex(16) + '.bin');
        pending.push({ file: target, originalName: String(originalName || '').replace(/[^A-Za-z0-9._ -]/g, '_').slice(-120) });
        return target;
    });
    var accepted = [];
    pending.forEach(function (item) {
        var file = item.file;
        if (!file.exists()) return;
        var size = file.length();
        var facts = size > 0 && size <= options.maxBytes ? inspectFile(file) : null;
        var kind = facts ? detectFileType(facts.head) : null;
        if (!kind || options.allowedTypes.indexOf(kind.type) < 0) {
            file.remove();
            return;
        }
        accepted.push({ path: options.folder + '/' + file.name, name: file.name, type: kind.type, extension: kind.extension, size: size, sha256: facts.sha256, originalName: item.originalName });
    });
    return accepted;
}

/**
 * @param {string} path - stored path below the private folder
 * @returns {?dw.io.File} the file, when it exists and the path is well formed
 */
function getStoredFile(path) {
    if (!/^[A-Za-z0-9/_.-]{1,240}$/.test(String(path)) || String(path).indexOf('..') >= 0) return null;
    var file = new File(ROOT + '/' + path);
    return file.exists() && file.isFile() ? file : null;
}

/**
 * @param {string} path - stored path
 */
function deleteStoredFile(path) {
    var file = getStoredFile(path);
    if (file) file.remove();
}

/**
 * @param {dw.object.CustomObject} doc - document record
 * @returns {Object} view without storage path or hash
 */
function getDocumentView(doc) {
    var c = doc.custom;
    return { documentId: c.documentId, docType: c.docType, fileName: c.fileName, contentType: c.contentType, sizeBytes: c.sizeBytes, scanStatus: c.scanStatus, reviewStatus: c.reviewStatus, reviewNote: c.reviewNote || null, expiresOn: c.expiresOn || null, uploadedAt: c.uploadedAt };
}

/**
 * @param {string} sellerId - seller
 * @returns {dw.object.CustomObject[]} the seller's live documents
 */
function getLiveDocuments(sellerId) {
    return marketplaceHelpers.queryPage('MarketplaceDocument', 'custom.sellerId = {0} AND custom.state = {1}', 'custom.uploadedAt desc', [sellerId, 'ACTIVE'], 0, MAX_DOCUMENTS).items;
}

/**
 * @param {string} sellerId - seller
 * @returns {Object[]} document views
 */
function getDocuments(sellerId) {
    return getLiveDocuments(sellerId).map(getDocumentView);
}

/**
 * Inside or outside a transaction: deletes the file of an infected document and keeps the record.
 * @param {dw.object.CustomObject} doc - document
 */
function quarantineDocument(doc) {
    deleteStoredFile(doc.custom.storagePath);
    Transaction.wrap(function () {
        doc.custom.state = 'QUARANTINED';
        doc.custom.reviewStatus = 'REJECTED';
        doc.custom.reviewNote = 'malware-detected';
        marketplaceHelpers.logAudit({ entityType: 'DOCUMENT', entityId: doc.custom.documentId, sellerId: doc.custom.sellerId, action: 'QUARANTINE', actor: marketplaceHelpers.actor('PROVIDER', 'scan') });
    });
    log.warn('Document {0} of seller {1} quarantined after scan', doc.custom.documentId, doc.custom.sellerId);
}

/**
 * Stores an uploaded verification document, then sends it to the scan provider.
 * @param {Object} context - seller context
 * @param {dw.web.HttpParameterMap} params - multipart request with "document", "docType" and optional "expiresOn"
 * @returns {Object} result with documentView
 */
function uploadDocument(context, params) {
    if (context.role !== 'OWNER') return marketplaceHelpers.errorResult('forbidden');
    if (['DRAFT', 'REJECTED', 'APPROVED', 'SUSPENDED'].indexOf(context.seller.custom.status) < 0) return marketplaceHelpers.errorResult('not-allowed-now');
    var docType = String(params.get('docType').stringValue || '');
    var expiresText = String(params.get('expiresOn').stringValue || '');
    if (DOCUMENT_TYPES.indexOf(docType) < 0) return marketplaceHelpers.errorResult('invalid', { docType: 'invalid' });
    var expiresOn = null;
    if (expiresText) {
        expiresOn = new Date(expiresText + 'T00:00:00.000Z');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresText) || Number.isNaN(expiresOn.getTime()) || expiresOn.getTime() < Date.now()) return marketplaceHelpers.errorResult('invalid', { expiresOn: 'invalid' });
    }
    if (getLiveDocuments(context.sellerId).length >= MAX_DOCUMENTS) return marketplaceHelpers.errorResult('limit-reached');
    // Set preferences have no metadata default.
    var allowedTypes = sellerHelpers.getListPreference('sellerDocumentAllowedTypes');
    var files = saveUploads(params, {
        field: 'document',
        folder: 'documents',
        allowedTypes: allowedTypes.length ? allowedTypes : ['application/pdf', 'image/png', 'image/jpeg'],
        maxBytes: sellerHelpers.getPreference('sellerDocumentMaxBytes'),
        maxFiles: 1
    });
    if (!files) return marketplaceHelpers.errorResult('unavailable');
    if (!files.length) return marketplaceHelpers.errorResult('invalid', { document: 'rejected' });
    var file = files[0];
    var doc;
    Transaction.wrap(function () {
        doc = CustomObjectMgr.createCustomObject('MarketplaceDocument', marketplaceHelpers.createId('DOC'));
        var c = doc.custom;
        c.sellerId = context.sellerId;
        c.docType = docType;
        c.fileName = file.originalName || file.name;
        c.storagePath = file.path;
        c.contentType = file.type;
        c.sizeBytes = file.size;
        c.sha256 = file.sha256;
        c.scanStatus = 'PENDING';
        c.reviewStatus = 'PENDING';
        c.state = 'ACTIVE';
        c.expiresOn = expiresOn;
        c.uploadedAt = new Date();
        c.retainUntil = new Date(Date.now() + sellerHelpers.getPreference('sellerDocumentRetentionDays') * DAY);
        marketplaceHelpers.logAudit({ entityType: 'DOCUMENT', entityId: c.documentId, sellerId: context.sellerId, action: 'UPLOAD', actor: context.actor, detail: { docType: docType } });
    });
    var answer = sellerHelpers.callProvider('scan', [{ documentId: doc.custom.documentId, contentType: doc.custom.contentType, sha256: doc.custom.sha256 }, getStoredFile(doc.custom.storagePath)]);
    Transaction.wrap(function () {
        doc.custom.scanStatus = ['UNSCANNED', 'PENDING', 'CLEAN', 'INFECTED'].indexOf(answer.status) >= 0 ? answer.status : 'ERROR';
        doc.custom.scanReference = answer.reference;
    });
    if (doc.custom.scanStatus === 'INFECTED') quarantineDocument(doc);
    return { error: false, documentView: getDocumentView(doc) };
}

/**
 * Applies a scan result from the provider webhook.
 * @param {string} documentId - document
 * @param {string} outcome - CLEAN | INFECTED
 * @param {string} reference - provider reference (must match)
 * @returns {Object} result
 */
function recordScanResult(documentId, outcome, reference) {
    var doc = CustomObjectMgr.getCustomObject('MarketplaceDocument', String(documentId));
    if (!doc) return marketplaceHelpers.errorResult('not-found');
    if (!doc.custom.scanReference || doc.custom.scanReference !== reference) return marketplaceHelpers.errorResult('conflict');
    if (outcome === 'INFECTED') {
        quarantineDocument(doc);
    } else if (outcome === 'CLEAN') {
        Transaction.wrap(function () { doc.custom.scanStatus = 'CLEAN'; });
    } else {
        return marketplaceHelpers.errorResult('invalid', { result: 'invalid' });
    }
    return { error: false };
}

/**
 * A seller may withdraw a document that has not been reviewed yet.
 * @param {Object} context - seller context (application.write)
 * @param {string} documentId - document
 * @returns {Object} result
 */
function withdrawDocument(context, documentId) {
    var doc = CustomObjectMgr.getCustomObject('MarketplaceDocument', String(documentId));
    if (!doc || doc.custom.sellerId !== context.sellerId || doc.custom.state !== 'ACTIVE') return marketplaceHelpers.errorResult('not-found');
    if (doc.custom.reviewStatus !== 'PENDING') return marketplaceHelpers.errorResult('not-allowed-now');
    deleteStoredFile(doc.custom.storagePath);
    Transaction.wrap(function () {
        doc.custom.state = 'WITHDRAWN';
        marketplaceHelpers.logAudit({ entityType: 'DOCUMENT', entityId: documentId, sellerId: context.sellerId, action: 'WITHDRAW', actor: context.actor });
    });
    return { error: false };
}

/**
 * Business Manager review of one document.
 * @param {string} documentId - document
 * @param {string} decision - ACCEPTED | REJECTED
 * @param {string} note - reason, required to reject
 * @param {Object} by - admin actor
 * @returns {Object} result
 */
function reviewDocument(documentId, decision, note, by) {
    var doc = CustomObjectMgr.getCustomObject('MarketplaceDocument', String(documentId));
    if (!doc || doc.custom.state !== 'ACTIVE') return marketplaceHelpers.errorResult('not-found');
    if (['ACCEPTED', 'REJECTED'].indexOf(decision) < 0) return marketplaceHelpers.errorResult('invalid', { decision: 'invalid' });
    var text = marketplaceHelpers.cleanText(note).slice(0, 500);
    if (decision === 'REJECTED' && text.length < 3) return marketplaceHelpers.errorResult('invalid', { note: 'required' });
    if (decision === 'ACCEPTED' && sellerHelpers.getPreference('sellerRequireCleanDocumentScan') !== false && doc.custom.scanStatus !== 'CLEAN') {
        return marketplaceHelpers.errorResult('invalid', { scan: 'not-clean' });
    }
    Transaction.wrap(function () {
        doc.custom.reviewStatus = decision;
        doc.custom.reviewNote = text || null;
        doc.custom.reviewedBy = by.ref;
        doc.custom.reviewedAt = new Date();
        marketplaceHelpers.logAudit({ entityType: 'DOCUMENT', entityId: documentId, sellerId: doc.custom.sellerId, action: 'REVIEW_' + decision, actor: by });
    });
    return { error: false };
}

/**
 * @param {dw.object.CustomObject[]} docs - live documents
 * @param {string} docType - type
 * @returns {dw.object.CustomObject[]} usable documents of that type (not rejected, expired or infected)
 */
function getUsable(docs, docType) {
    var now = Date.now();
    return docs.filter(function (d) {
        return d.custom.docType === docType && d.custom.reviewStatus !== 'REJECTED'
            && (!d.custom.expiresOn || d.custom.expiresOn.getTime() > now)
            && ['INFECTED', 'ERROR'].indexOf(d.custom.scanStatus) < 0;
    });
}

/**
 * @param {string} sellerId - seller
 * @returns {string[]} why the application cannot be submitted yet
 */
function getApplicationProblems(sellerId) {
    var docs = getLiveDocuments(sellerId);
    return sellerHelpers.getListPreference('sellerRequiredDocumentTypes').filter(function (type) {
        return getUsable(docs, type).length === 0;
    }).map(function (type) { return 'missing-document:' + type; });
}

/**
 * @param {string} sellerId - seller
 * @returns {string[]} why the seller cannot be approved yet
 */
function getApprovalProblems(sellerId) {
    var docs = getLiveDocuments(sellerId);
    var problems = [];
    sellerHelpers.getListPreference('sellerRequiredDocumentTypes').forEach(function (type) {
        var candidates = getUsable(docs, type);
        if (!candidates.length) problems.push('missing-document:' + type);
        else if (!candidates.some(function (d) { return d.custom.reviewStatus === 'ACCEPTED'; })) problems.push('unreviewed-document:' + type);
    });
    if (sellerHelpers.getPreference('sellerRequireCleanDocumentScan') !== false && docs.some(function (d) { return d.custom.scanStatus !== 'CLEAN' && d.custom.reviewStatus !== 'REJECTED'; })) {
        problems.push('scan-not-clean');
    }
    return problems;
}

/**
 * Business Manager: the document as a data URI (the response object has no binary stream),
 * only for a live document. Opening it is audited.
 * @param {string} documentId - document
 * @param {Object} by - admin actor
 * @returns {?{dataUri: string, contentType: string}} file
 */
function getDocumentForAdmin(documentId, by) {
    var doc = CustomObjectMgr.getCustomObject('MarketplaceDocument', String(documentId));
    var file = doc && doc.custom.state === 'ACTIVE' ? getStoredFile(doc.custom.storagePath) : null;
    if (!file) return null;
    var RandomAccessFileReader = require('dw/io/RandomAccessFileReader');
    var Encoding = require('dw/crypto/Encoding');
    var reader = new RandomAccessFileReader(file);
    var parts = [];
    try {
        // Chunks are a multiple of three bytes, so the base64 pieces join without padding.
        var chunk = reader.readBytes(10239);
        while (chunk && chunk.length > 0) {
            parts.push(Encoding.toBase64(chunk));
            chunk = reader.readBytes(10239);
        }
    } finally {
        reader.close();
    }
    Transaction.wrap(function () {
        marketplaceHelpers.logAudit({ entityType: 'DOCUMENT', entityId: documentId, sellerId: doc.custom.sellerId, action: 'VIEW', actor: by });
    });
    return { dataUri: 'data:' + doc.custom.contentType + ';base64,' + parts.join(''), contentType: doc.custom.contentType };
}

/**
 * Job helper: warns before documents expire, handles expired ones (case, optional suspension).
 * @param {number} limit - maximum documents
 * @returns {{warned: number, expired: number}} counts
 */
function processExpiringDocuments(limit) {
    var now = Date.now();
    var warnBefore = new Date(now + sellerHelpers.getPreference('sellerDocumentExpiryWarningDays') * DAY);
    var counts = { warned: 0, expired: 0 };
    var required = sellerHelpers.getListPreference('sellerRequiredDocumentTypes');
    var docs = marketplaceHelpers.queryPage('MarketplaceDocument', 'custom.state = {0} AND custom.expiresOn != NULL AND custom.expiresOn <= {1}', 'custom.expiresOn asc', ['ACTIVE', warnBefore], 0, limit).items;
    docs.forEach(function (doc) {
        var c = doc.custom;
        var expired = c.expiresOn.getTime() <= now;
        Transaction.wrap(function () {
            if (expired && c.expiryNotice !== 'EXPIRED') {
                c.expiryNotice = 'EXPIRED';
                marketplaceHelpers.notify(c.sellerId, 'DOCUMENT_EXPIRED', { docType: c.docType });
                require('*/cartridge/scripts/helpers/caseHelpers').openCase({ caseType: 'DOCUMENT_EXPIRED', sellerId: c.sellerId, entityId: c.documentId, severity: 'MEDIUM', detail: { docType: c.docType }, dedupeKey: 'doc-expired:' + c.documentId });
                counts.expired += 1;
                var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', c.sellerId);
                if (seller && sellerHelpers.getPreference('sellerSuspendOnExpiredDocuments') === true && required.indexOf(c.docType) >= 0 && getUsable(getLiveDocuments(c.sellerId), c.docType).length === 0) {
                    sellerHelpers.suspendSeller(seller, 'document-expired', marketplaceHelpers.actor('SYSTEM', 'document-expiry'));
                }
            } else if (!expired && !c.expiryNotice) {
                c.expiryNotice = 'WARNED';
                marketplaceHelpers.notify(c.sellerId, 'DOCUMENT_EXPIRING', { docType: c.docType });
                counts.warned += 1;
            }
        });
    });
    return counts;
}

/**
 * Job helper: deletes files whose retention period ended and marks the records purged.
 * @param {number} limit - maximum documents
 * @returns {number} purged documents
 */
function purgeExpiredFiles(limit) {
    var docs = marketplaceHelpers.queryPage('MarketplaceDocument', 'custom.retainUntil <= {0} AND custom.state != {1}', 'custom.retainUntil asc', [new Date(), 'PURGED'], 0, limit).items;
    docs.forEach(function (doc) {
        deleteStoredFile(doc.custom.storagePath);
        Transaction.wrap(function () {
            doc.custom.state = 'PURGED';
            doc.custom.storagePath = null;
            marketplaceHelpers.logAudit({ entityType: 'DOCUMENT', entityId: doc.custom.documentId, sellerId: doc.custom.sellerId, action: 'PURGE', actor: marketplaceHelpers.actor('SYSTEM', 'retention') });
        });
    });
    return docs.length;
}

module.exports = {
    DOCUMENT_TYPES: DOCUMENT_TYPES,
    detectFileType: detectFileType,
    saveUploads: saveUploads,
    getStoredFile: getStoredFile,
    deleteStoredFile: deleteStoredFile,
    getDocuments: getDocuments,
    uploadDocument: uploadDocument,
    recordScanResult: recordScanResult,
    withdrawDocument: withdrawDocument,
    reviewDocument: reviewDocument,
    getApplicationProblems: getApplicationProblems,
    getApprovalProblems: getApprovalProblems,
    getDocumentForAdmin: getDocumentForAdmin,
    processExpiringDocuments: processExpiringDocuments,
    purgeExpiredFiles: purgeExpiredFiles
};
