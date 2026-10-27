'use strict';

/**
 * Adds the signed-in customer's wallet balance to the header include (Account-Header), which
 * SFRA renders uncached on every page, so the amount is always current.
 */

var server = require('server');

server.extend(module.superModule);

server.append('Header', function (req, res, next) {
    if (req.currentCustomer.profile) {
        var walletHelpers = require('*/cartridge/scripts/helpers/walletHelpers');
        var context = require('*/cartridge/scripts/helpers/walletAccountHelpers').getWalletContext(req.currentCustomer.raw, false);
        // a customer without a wallet yet sees $0.00 and can open it from the header
        if (!context.error || context.errorCode === 'not-found') {
            res.setViewData({ walletHeader: { balance: walletHelpers.formatCents(context.error ? 0 : context.wallet.custom.availableCents || 0) } });
        }
    }
    next();
});

module.exports = server.exports();
