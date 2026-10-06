'use strict';

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var ProductMgr = require('dw/catalog/ProductMgr');
var Site = require('dw/system/Site');
var Transaction = require('dw/system/Transaction');
var MessageDigest = require('dw/crypto/MessageDigest');
var Encoding = require('dw/crypto/Encoding');
var Bytes = require('dw/util/Bytes');

var TYPE = 'ProductReview';
var PAGE_SIZE = 5;

/** @returns {Object} Site configuration, with moderation enabled by default. */
function getSettings() {
    var site = Site.getCurrent();
    return {
        enabled: site.getCustomPreferenceValue('productReviewsEnabled') !== false,
        moderation: site.getCustomPreferenceValue('productReviewsModeration') !== false
    };
}

/**
 * Resolve variants and variation groups to their online master product.
 * @param {string} pid - Requested product ID
 * @returns {dw.catalog.Product|null} Canonical product
 */
function getProduct(pid) {
    if (typeof pid !== 'string' || !pid || pid.length > 256) return null;
    var product = ProductMgr.getProduct(pid);
    if (!product || !product.online) return null;
    if (product.variant || product.variationGroup) product = product.masterProduct;
    return product && product.online ? product : null;
}

/**
 * Fixed-length, unambiguous key enforces one review per customer/product/site.
 * @param {string} pid - Canonical product ID
 * @param {string} customerNo - Authenticated customer number
 * @returns {string} Custom object key
 */
function getKey(pid, customerNo) {
    var input = JSON.stringify([Site.getCurrent().ID, pid, customerNo]);
    return Encoding.toHex(new MessageDigest(MessageDigest.DIGEST_SHA_256)
        .digestBytes(new Bytes(input, 'UTF-8')));
}

/**
 * @param {string} pid - Canonical product ID
 * @param {string} customerNo - Authenticated customer number
 * @returns {dw.object.CustomObject|null} Customer's existing review
 */
function getOwnReview(pid, customerNo) {
    return customerNo ? CustomObjectMgr.getCustomObject(TYPE, getKey(pid, customerNo)) : null;
}

/**
 * Validate on the server; the client never supplies identity or approval status.
 * @param {Object} form - Submitted fields
 * @returns {Object} Normalized values and field error resource keys
 */
function validate(form) {
    var values = {};
    var errors = {};
    var limits = { displayName: [2, 40], title: [3, 100], body: [10, 2000] };
    Object.keys(limits).forEach(function (field) {
        var value = typeof form[field] === 'string' ? form[field].trim() : '';
        values[field] = value;
        if (value.length < limits[field][0] || value.length > limits[field][1]) {
            errors[field] = 'error.' + field;
        }
    });
    // Accept whole-number decimal representations too (for example SFCC's 4.0).
    var rating = String(form.rating || '').trim();
    values.rating = /^[1-5](?:\.0+)?$/.test(rating) ? Number(rating) : 0;
    if (!values.rating) errors.rating = 'error.rating';
    return { values: values, errors: errors, valid: Object.keys(errors).length === 0 };
}

/**
 * Only this projection is exposed publicly. Never expose customer numbers or keys.
 * @param {dw.object.CustomObject} object - Review object
 * @returns {Object} Public review
 */
function toPublic(object) {
    return {
        displayName: object.custom.displayName,
        title: object.custom.title,
        body: object.custom.body,
        rating: object.custom.rating,
        submittedAt: object.custom.submittedAt || object.creationDate
    };
}

/**
 * Count one star bucket without materializing every review in memory.
 * @param {string} pid - Canonical product ID
 * @param {number} rating - Star bucket
 * @returns {number} Approved review count
 */
function countRating(pid, rating) {
    var iterator = CustomObjectMgr.queryCustomObjects(TYPE,
        'custom.productID = {0} AND custom.status = {1} AND custom.rating = {2}',
        null, pid, 'approved', rating);
    try {
        var count = iterator.getCount();
        if (count >= 0) return count;
        count = 0;
        while (iterator.hasNext()) {
            iterator.next();
            count++;
        }
        return count;
    } finally {
        iterator.close();
    }
}

/**
 * Read approved reviews only, with bounded page size and deterministic ordering.
 * @param {string} pid - Canonical product ID
 * @param {string|number} requestedPage - One-based page
 * @returns {Object} Summary, histogram and a single page
 */
function getReviews(pid, requestedPage) {
    var total = 0;
    var sum = 0;
    var distribution = [];
    for (var rating = 5; rating >= 1; rating--) {
        var count = countRating(pid, rating);
        total += count;
        sum += count * rating;
        distribution.push({ rating: rating, count: count });
    }
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    var parsedPage = /^\d{1,6}$/.test(String(requestedPage || '1')) ? Number(requestedPage || 1) : 1;
    var page = Math.max(1, Math.min(pages, parsedPage));
    var items = [];
    var iterator = CustomObjectMgr.queryCustomObjects(TYPE,
        'custom.productID = {0} AND custom.status = {1}',
        'custom.submittedAt desc, creationDate desc', pid, 'approved');
    try {
        iterator.forward((page - 1) * PAGE_SIZE, PAGE_SIZE);
        while (iterator.hasNext()) items.push(toPublic(iterator.next()));
    } finally {
        iterator.close();
    }
    return {
        total: total,
        average: total ? (sum / total).toFixed(1) : '0.0',
        distribution: distribution,
        items: items,
        page: page,
        pages: pages
    };
}

/**
 * Create/update atomically; editing an approved review sends it for approval again.
 * @param {string} pid - Canonical product ID
 * @param {string} customerNo - Server-derived authenticated identity
 * @param {Object} values - Validated fields
 * @param {boolean} moderation - Whether approval is required
 * @returns {Object} Saved status or rate-limit error
 */
function save(pid, customerNo, values, moderation) {
    if (!customerNo) throw new Error('An authenticated customer is required');
    var result;
    Transaction.wrap(function () {
        var object = getOwnReview(pid, customerNo);
        var now = new Date();
        if (object && object.custom.submittedAt && now.getTime() - object.custom.submittedAt.getTime() < 60000) {
            result = { error: 'rate' };
            return;
        }
        if (!object) object = CustomObjectMgr.createCustomObject(TYPE, getKey(pid, customerNo));
        object.custom.productID = pid;
        object.custom.customerNo = customerNo;
        object.custom.displayName = values.displayName;
        object.custom.title = values.title;
        object.custom.body = values.body;
        object.custom.rating = values.rating;
        object.custom.status = moderation ? 'pending' : 'approved';
        object.custom.submittedAt = now;
        result = { status: moderation ? 'pending' : 'approved' };
    });
    return result;
}

module.exports = {
    getSettings: getSettings,
    getProduct: getProduct,
    getOwnReview: getOwnReview,
    validate: validate,
    getReviews: getReviews,
    save: save
};
