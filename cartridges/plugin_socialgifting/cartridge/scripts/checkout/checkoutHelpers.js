'use strict';

var base = module.superModule;
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');
var registry = require('../helpers/registryCheckoutHelper');
var contributions = require('../helpers/contributionCheckoutHelper');
module.exports = Object.assign({}, base, {
    createOrder: function (basket) {
        try {
            return Transaction.wrap(function () {
                registry.validate(basket);
                var contribution = contributions.validate(basket);
                var registryKey = basket.custom.sgRegistryKey;
                var snapshot = null;
                if (registryKey) {
                    var source = basket.productLineItems[0];
                    snapshot = { pid: source.productID, quantity: source.quantityValue, registryKey: source.custom.sgRegistryKey,
                        itemKey: source.custom.sgRegistryItemKey, reservationKey: source.custom.sgReservationKey, anonymous: source.custom.sgAnonymousGift };
                }
                if (!contribution && basket.productLineItems.toArray().some(function (line) { return line.product && line.product.custom.sgContributionProduct; })) return null;
                var order = base.createOrder(basket);
                if (!order) throw new Error('ORDER_CREATION_FAILED');
                // Copy explicitly instead of assuming Basket metadata is copied to Order.
                if (contribution) contributions.attach(order, contribution.custom.publicKey);
                if (snapshot) {
                    var lines = order.productLineItems;
                    if (lines.length !== 1 || lines[0].productID !== snapshot.pid || lines[0].quantityValue !== snapshot.quantity) throw new Error('ORDER_CONTEXT_MISMATCH');
                    lines[0].custom.sgRegistryKey = snapshot.registryKey;
                    lines[0].custom.sgRegistryItemKey = snapshot.itemKey;
                    lines[0].custom.sgReservationKey = snapshot.reservationKey;
                    lines[0].custom.sgAnonymousGift = snapshot.anonymous;
                    registry.attach(order);
                }
                return order;
            });
        } catch (e) {
            Logger.getLogger('social-gifting', 'registry').warn('Order creation rejected; code={0}', e.code || 'CREATE_ORDER');
            return null;
        }
    },
    placeOrder: function (order, fraud) {
        var result = base.placeOrder(order, fraud); // Contains email in the existing overlay: no outer transaction.
        if (!result.error) {
            try {
                if (order.custom.sgHasRegistryGifts) require('../helpers/purchaseHelper').record(order);
                contributions.reconcile(order);
            } catch (e) {
                Logger.getLogger('social-gifting', 'registry').error('Reconciliation required for order {0}', order.orderNo);
            }
        }
        return result;
    }
});
