'use strict';

/**
 * Payment provider callbacks for top-ups. Server to server: no session or CSRF; each request
 * needs a fresh HMAC-SHA256 signature (secret in service plugin-wallet.webhook), and each
 * event ID is accepted once. A payment event never credits by itself: it makes the plugin ask
 * the gateway for the verified payment state.
 *
 * Body: {"id": "...", "type": "payment.updated" | "chargeback.created", "data": {"topUpId", "reference", "amountCents"}}
 */

var server = require('server');
var Logger = require('dw/system/Logger');

var log = Logger.getLogger('plugin-wallet', 'wallet-gateway');
var STATUS_CODES = { invalid: 400, 'not-found': 404, conflict: 409, 'not-allowed-now': 409, disabled: 503, unavailable: 503 };

/**
 * @param {Object} res - response
 * @param {number} status - HTTP status
 * @param {string} code - result
 */
function answer(res, status, code) {
    res.setStatusCode(status);
    res.json({ result: code });
}

server.post('Receive', server.middleware.https, function (req, res, next) {
    var CustomObjectMgr = require('dw/object/CustomObjectMgr');
    var walletHelpers = require('*/cartridge/scripts/helpers/walletHelpers');
    var topUpHelpers = require('*/cartridge/scripts/helpers/walletTopUpHelpers');
    var body = request.httpParameterMap.requestBodyAsString || '';
    if (!walletHelpers.isWalletEnabled() || walletHelpers.isSandbox()) {
        answer(res, 503, 'disabled');
        return next();
    }
    if (!(body.length > 0 && body.length < 65536 && walletHelpers.isValidWebhookSignature(request.httpHeaders.get('x-wallet-signature'), body))) {
        log.warn('Rejected wallet webhook with an invalid signature');
        answer(res, 401, 'invalid-signature');
        return next();
    }
    var event = walletHelpers.parseJson(body, null);
    var data = event && event.data;
    if (!event || !/^[A-Za-z0-9_-]{8,64}$/.test(String(event.id || '')) || !data || !/^TOP-[A-F0-9]{24}$/.test(String(data.topUpId || ''))) {
        answer(res, 400, 'invalid-event');
        return next();
    }
    var replayKey = 'webhook:' + event.id;
    if (CustomObjectMgr.getCustomObject('WalletRequestKey', replayKey)) {
        answer(res, 200, 'duplicate');
        return next();
    }
    var by = walletHelpers.actor('PROVIDER', 'gateway');
    var topUp = CustomObjectMgr.getCustomObject('WalletTopUp', data.topUpId);
    var result;
    if (!topUp || topUp.custom.providerReference !== String(data.reference || '')) result = walletHelpers.errorResult('conflict');
    else if (event.type === 'payment.updated') result = topUpHelpers.completeTopUp(data.topUpId, by);
    else if (event.type === 'chargeback.created') result = topUpHelpers.reverseTopUp(data.topUpId, Number(data.amountCents), String(data.reference), by);
    else result = walletHelpers.errorResult('invalid');
    if (result.error) {
        log.warn('Wallet webhook {0} not applied: {1}', event.type, result.errorCode);
        answer(res, STATUS_CODES[result.errorCode] || 500, result.errorCode);
        return next();
    }
    require('dw/system/Transaction').wrap(function () {
        var key = CustomObjectMgr.createCustomObject('WalletRequestKey', replayKey);
        key.custom.requestHash = walletHelpers.sha256(body);
        key.custom.createdAt = new Date();
    });
    answer(res, 200, 'accepted');
    return next();
});

module.exports = server.exports();
