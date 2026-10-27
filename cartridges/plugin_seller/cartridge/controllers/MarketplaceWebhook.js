'use strict';

/**
 * Provider callbacks (identity check, payout account, payout, document scan). Server to
 * server: no session or CSRF. Every request needs a fresh HMAC-SHA256 signature over the raw
 * body (secret in service plugin-seller.webhook), and each event ID is accepted once.
 *
 * Body: {"id": "...", "type": "kyc.completed|bank.completed|payout.completed|document.scanned", "data": {...}}
 */

var server = require('server');
var Logger = require('dw/system/Logger');

var log = Logger.getLogger('plugin-seller', 'seller-integration');
var STATUS_CODES = { invalid: 400, 'not-found': 404, conflict: 409, 'not-allowed-now': 409 };

/**
 * @param {Object} res - response
 * @param {number} status - HTTP status
 * @param {string} result - result text
 */
function answer(res, status, result) {
    res.setStatusCode(status);
    res.json({ result: result });
}

server.post('Receive', server.middleware.https, function (req, res, next) {
    var CustomObjectMgr = require('dw/object/CustomObjectMgr');
    var Transaction = require('dw/system/Transaction');
    var marketplaceHelpers = require('*/cartridge/scripts/helpers/marketplaceHelpers');
    var body = request.httpParameterMap.requestBodyAsString || '';
    if (!marketplaceHelpers.isMarketplaceEnabled()) {
        answer(res, 503, 'disabled');
        return next();
    }
    if (!body.length || body.length >= 65536 || !marketplaceHelpers.isValidWebhookSignature(request.httpHeaders.get('x-marketplace-signature'), body)) {
        log.warn('Rejected webhook with an invalid signature');
        answer(res, 401, 'invalid-signature');
        return next();
    }
    var event = marketplaceHelpers.parseJson(body, null);
    if (!event || !/^[A-Za-z0-9_-]{8,64}$/.test(String(event.id || '')) || !event.data || typeof event.data !== 'object') {
        answer(res, 400, 'invalid-event');
        return next();
    }
    var replayKey = 'webhook:' + event.id;
    if (CustomObjectMgr.getCustomObject('MarketplaceRequestKey', replayKey)) {
        answer(res, 200, 'duplicate');
        return next();
    }
    var by = marketplaceHelpers.actor('PROVIDER', String(event.type || '').split('.')[0]);
    var data = event.data;
    var result;
    if (event.type === 'kyc.completed') result = require('*/cartridge/scripts/helpers/sellerHelpers').recordIdentityResult(String(data.sellerId), String(data.result), String(data.reference), by);
    else if (event.type === 'bank.completed') result = require('*/cartridge/scripts/helpers/sellerHelpers').recordPayoutAccountResult(String(data.sellerId), String(data.result), String(data.reference), data.last4, by);
    else if (event.type === 'payout.completed') result = require('*/cartridge/scripts/helpers/settlementHelpers').recordPayoutResult(String(data.settlementId), String(data.result), String(data.reference), by);
    else if (event.type === 'document.scanned') result = require('*/cartridge/scripts/helpers/sellerDocumentHelpers').recordScanResult(String(data.documentId), String(data.result), String(data.reference));
    else {
        answer(res, 400, 'unknown-type');
        return next();
    }
    if (result.error) {
        log.warn('Webhook {0} not applied: {1}', event.type, result.errorCode);
        answer(res, STATUS_CODES[result.errorCode] || 500, result.errorCode);
        return next();
    }
    Transaction.wrap(function () {
        var record = CustomObjectMgr.createCustomObject('MarketplaceRequestKey', replayKey);
        record.custom.requestHash = marketplaceHelpers.sha256(body);
        record.custom.createdAt = new Date();
    });
    answer(res, 200, 'accepted');
    return next();
});

module.exports = server.exports();
