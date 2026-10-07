'use strict';

/**
 * Customer-journey audit trail for the shopping assistant.
 *
 * One ChatWidgetJourney custom object exists per browser session journey and
 * ChatWidgetActivity objects are appended to it. Only non-sensitive
 * identifiers are stored: never passwords, card data, CVV, CSRF tokens or
 * address/e-mail values. Storage failures are logged and swallowed so that
 * tracking can never interrupt shopping.
 * @module scripts/helpers/journey
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Logger = require('dw/system/Logger');
var Site = require('dw/system/Site');
var Transaction = require('dw/system/Transaction');
var UUIDUtils = require('dw/util/UUIDUtils');

var JOURNEY_TYPE = 'ChatWidgetJourney';
var ACTIVITY_TYPE = 'ChatWidgetActivity';
var SESSION_KEY = 'chatWidgetJourneyKey';
var WIDGET_HEADER = 'x-chat-widget';

var journeyLogger = Logger.getLogger('chat-widget', 'journey-tracking');

/**
 * Flatten and trim an untrusted value before it is persisted.
 * @param {*} value input value
 * @param {number} limit maximum length
 * @returns {string} safe value
 */
function text(value, limit) {
    return String(value === null || value === undefined ? '' : value).replace(/[\r\n\t]/g, ' ').substring(0, limit);
}

/**
 * Whether the request was sent by the assistant widget (it adds a custom header).
 * @param {Object} req SFRA request
 * @returns {boolean} true for widget-originated requests
 */
function isWidgetRequest(req) {
    return !!req.httpHeaders && String(req.httpHeaders.get(WIDGET_HEADER)) === '1';
}

/**
 * Current customer number for authenticated shoppers.
 * @param {Object} req SFRA request
 * @returns {string} customer number or empty string
 */
function customerNo(req) {
    var customer = req.currentCustomer.raw;
    return customer.authenticated && customer.profile ? customer.profile.customerNo : '';
}

/**
 * Journey key stored on the session. session.custom survives login so the
 * guest-to-customer path stays in one journey; it is cleared on logout.
 * @param {Object} req SFRA request
 * @param {boolean} create create a key when none exists
 * @returns {string|null} journey key
 */
function journeyKey(req, create) {
    var key = req.session.raw.custom[SESSION_KEY] || null;
    if (!key && create) {
        key = UUIDUtils.createUUID();
        req.session.raw.custom[SESSION_KEY] = key; // eslint-disable-line no-param-reassign
    }
    return key;
}

/**
 * Get or create the journey object and refresh its activity timestamp.
 * Must run inside a transaction.
 * @param {Object} req SFRA request
 * @param {string} key journey key
 * @returns {dw.object.CustomObject} journey
 */
function touchJourney(req, key) {
    var number = customerNo(req);
    var journey = CustomObjectMgr.getCustomObject(JOURNEY_TYPE, key);
    if (!journey) {
        journey = CustomObjectMgr.createCustomObject(JOURNEY_TYPE, key);
        journey.custom.startedAt = new Date();
        journey.custom.siteID = Site.current.ID;
        journey.custom.locale = req.locale.id;
        journey.custom.status = 'active';
    }
    if (number) {
        journey.custom.customerNo = number;
    }
    journey.custom.lastActivityAt = new Date();
    return journey;
}

/**
 * Create an activity record. Must run inside a transaction.
 * @param {Object} req SFRA request
 * @param {string} key journey key
 * @param {string} action activity name
 * @param {Object} details non-sensitive details
 */
function createActivity(req, key, action, details) {
    var activity = CustomObjectMgr.createCustomObject(ACTIVITY_TYPE, UUIDUtils.createUUID());
    activity.custom.journeyKey = key;
    activity.custom.action = text(action, 100);
    activity.custom.result = text(details.result, 20);
    activity.custom.entityID = text(details.entityID, 256);
    activity.custom.context = text(details.context, 1000);
    activity.custom.customerNo = customerNo(req);
    activity.custom.occurredAt = new Date();
}

/**
 * Append a non-sensitive activity to the current journey. Skipped when the
 * shopper has not allowed tracking for the session.
 * @param {Object} req SFRA request
 * @param {string} action activity name, snake_case event identifier
 * @param {Object} [details] entityID, context and result values
 */
function track(req, action, details) {
    var info = details || {};
    var key;

    if (!req.session.raw.trackingAllowed) {
        return;
    }
    key = journeyKey(req, true);
    try {
        Transaction.wrap(function () {
            touchJourney(req, key);
            createActivity(req, key, action, info);
        });
    } catch (error) {
        journeyLogger.error('Activity "{0}" was not stored: {1}', action, error.message);
    }
}

/**
 * Link a placed or confirmed order to the current journey.
 * @param {Object} req SFRA request
 * @param {string} orderNo order number
 */
function recordOrder(req, orderNo) {
    var key = journeyKey(req, false);
    if (!key || !orderNo) {
        return;
    }
    try {
        Transaction.wrap(function () {
            var journey = touchJourney(req, key);
            if (!journey.custom.reviewSubmittedAt) {
                journey.custom.orderNo = text(orderNo, 256);
                journey.custom.status = 'ordered';
            }
        });
    } catch (error) {
        journeyLogger.error('Order {0} was not linked to journey: {1}', orderNo, error.message);
    }
}

/**
 * Order number of the current journey that still awaits a review.
 * @param {Object} req SFRA request
 * @returns {string|null} order number
 */
function pendingReviewOrder(req) {
    var key = journeyKey(req, false);
    var journey;
    try {
        journey = key ? CustomObjectMgr.getCustomObject(JOURNEY_TYPE, key) : null;
    } catch (error) {
        journeyLogger.error('Journey {0} could not be read: {1}', key, error.message);
        return null;
    }
    return journey && journey.custom.orderNo && !journey.custom.reviewSubmittedAt ? journey.custom.orderNo : null;
}

/**
 * Whether any journey already holds a review for the order.
 * @param {string} orderNo order number
 * @returns {boolean} true when reviewed
 */
function hasReview(orderNo) {
    try {
        return !!CustomObjectMgr.queryCustomObject(JOURNEY_TYPE, 'custom.orderNo = {0} AND custom.reviewSubmittedAt != NULL', orderNo);
    } catch (error) {
        // Fails mainly when the type is not imported yet; saveReview then fails too, so nothing is stored.
        journeyLogger.error('Review lookup for order {0} failed: {1}', orderNo, error.message);
        return false;
    }
}

/**
 * Save one review on the journey, record its submission and start a fresh
 * journey so a later order gets its own review record.
 * @param {Object} req SFRA request
 * @param {Object} review orderNo, rating, comment and commentConsent values
 * @returns {boolean} true when stored
 */
function saveReview(req, review) {
    var key = journeyKey(req, true);
    var stored = false;

    try {
        Transaction.wrap(function () {
            var journey = touchJourney(req, key);
            if (journey.custom.reviewSubmittedAt) {
                // one review per journey record | upgrade path: multi-review history per journey
                key = UUIDUtils.createUUID();
                journey = touchJourney(req, key);
            }
            journey.custom.status = 'reviewed';
            journey.custom.orderNo = text(review.orderNo, 256);
            journey.custom.reviewRating = review.rating;
            journey.custom.reviewComment = review.commentConsent ? text(review.comment, 1000) : '';
            journey.custom.reviewCommentConsent = !!review.commentConsent;
            journey.custom.reviewSubmittedAt = new Date();
            createActivity(req, key, 'review_submitted', { entityID: review.orderNo, context: 'rating=' + review.rating, result: 'success' });
        });
        stored = true;
        req.session.raw.custom[SESSION_KEY] = null; // eslint-disable-line no-param-reassign
    } catch (error) {
        journeyLogger.error('Review for order {0} was not stored: {1}', review.orderNo, error.message);
    }
    return stored;
}

/**
 * Close the current journey, e.g. at logout, and forget its session key.
 * @param {Object} req SFRA request
 */
function endJourney(req) {
    var key = journeyKey(req, false);
    if (!key) {
        return;
    }
    try {
        Transaction.wrap(function () {
            var journey = CustomObjectMgr.getCustomObject(JOURNEY_TYPE, key);
            if (journey && journey.custom.status !== 'reviewed') {
                journey.custom.status = 'closed';
                journey.custom.lastActivityAt = new Date();
            }
        });
    } catch (error) {
        journeyLogger.error('Journey {0} was not closed: {1}', key, error.message);
    }
    req.session.raw.custom[SESSION_KEY] = null; // eslint-disable-line no-param-reassign
}

/**
 * Whether an SFRA JSON response describes a failure.
 * @param {Object} data response view data
 * @returns {boolean} true on failure
 */
function failed(data) {
    var fieldErrors = data.fields && Object.keys(data.fields).length;
    return !!(data.error || data.errorMessage || data.csrfError || data.success === false || data.loggedin === false || fieldErrors);
}

/**
 * Middleware for server.prepend on inherited SFRA JSON routes. For widget
 * requests it records the final route outcome after every BeforeComplete
 * handler has run.
 * @param {string} action activity name
 * @param {Function} [describe] returns non-sensitive {entityID, context} for (req, data)
 * @param {Function} [onSuccess] called with (req, data) on success
 * @returns {Function} SFRA middleware
 */
function observe(action, describe, onSuccess) {
    return function (req, res, next) {
        if (isWidgetRequest(req)) {
            this.on('route:Complete', function (request, response) {
                var data = response.getViewData();
                var details = describe ? describe(request, data) : {};
                details.result = failed(data) ? 'error' : 'success';
                if (details.result === 'success' && onSuccess) {
                    onSuccess(request, data);
                }
                track(request, action, details);
            });
            this.on('route:Redirect', function (request) {
                track(request, action, { result: 'redirect' });
            });
        }
        next();
    };
}

module.exports = {
    endJourney: endJourney,
    hasReview: hasReview,
    isWidgetRequest: isWidgetRequest,
    journeyKey: journeyKey,
    observe: observe,
    pendingReviewOrder: pendingReviewOrder,
    recordOrder: recordOrder,
    saveReview: saveReview,
    track: track
};
