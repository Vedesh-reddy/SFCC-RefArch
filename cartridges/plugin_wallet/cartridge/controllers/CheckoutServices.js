'use strict';

var server = require('server');

server.extend(module.superModule);

// Re-checks the wallet payment (payer, balance, limits, step-up approval) before the base
// route creates the order, so a refusal never leaves a failed order behind.
server.prepend('PlaceOrder', function (req, res, next) {
    var basket = require('dw/order/BasketMgr').getCurrentBasket();
    if (!basket) return next();
    var result = require('*/cartridge/scripts/helpers/walletPaymentHelpers').checkBeforePlaceOrder(req.currentCustomer.raw, basket, String(req.session.raw.sessionID));
    if (!result.error) return next();
    res.json({
        error: true,
        errorStage: { stage: 'payment', step: 'paymentInstrument' },
        errorMessage: result.errorMessage
    });
    this.done(req, res);
    return null;
});

// Captures the wallet holds of a placed order, or releases them when placement failed.
server.append('PlaceOrder', function (req, res, next) {
    var holds = request.custom.walletHoldIds ? String(request.custom.walletHoldIds).split(',').filter(Boolean) : [];
    if (holds.length) {
        try {
            require('*/cartridge/scripts/helpers/walletPaymentHelpers').settleAfterPlaceOrder(holds, res.getViewData());
        } catch (e) {
            // The hold job settles anything left here by the order's status.
            require('dw/system/Logger').getLogger('plugin-wallet', 'wallet-transaction').error('Settling wallet holds after PlaceOrder failed: {0}', e.message);
        }
    }
    return next();
});

module.exports = server.exports();
