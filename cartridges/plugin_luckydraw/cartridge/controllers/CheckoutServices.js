'use strict';

var server = require('server');

server.extend(module.superModule);

// Re-checks lucky draw codes in the basket (owner, status, expiry) before the order is
// created, removing any that are no longer valid.
server.prepend('PlaceOrder', function (req, res, next) {
    var basket = require('dw/order/BasketMgr').getCurrentBasket();
    if (!basket) return next();
    var rewardHelpers = require('*/cartridge/scripts/helpers/luckyDrawRewardHelpers');
    var invalid = basket.couponLineItems.toArray().filter(function (cli) {
        var result = rewardHelpers.checkRewardCode(cli.couponCode, req.currentCustomer.raw);
        return result && !result.ok;
    });
    if (!invalid.length) return next();
    require('dw/system/Transaction').wrap(function () {
        invalid.forEach(function (cli) { basket.removeCouponLineItem(cli); });
        require('*/cartridge/scripts/helpers/basketCalculationHelpers').calculateTotals(basket);
    });
    var Resource = require('dw/web/Resource');
    res.json({ error: true, errorMessage: Resource.msg('coupon.removed', 'luckydraw', null) });
    this.done(req, res);
    return null;
});

// Records the redemption of lucky draw codes used by the placed order.
server.append('PlaceOrder', function (req, res, next) {
    var data = res.getViewData();
    if (data.error || !data.orderID) return next();
    var order = require('dw/order/OrderMgr').getOrder(data.orderID, data.orderToken);
    if (!order) return next();
    var rewardHelpers = require('*/cartridge/scripts/helpers/luckyDrawRewardHelpers');
    try {
        order.couponLineItems.toArray().forEach(function (cli) {
            var reward = rewardHelpers.findRewardByCode(cli.couponCode);
            if (reward && reward.custom.status === 'ISSUED') {
                require('dw/system/Transaction').wrap(function () { rewardHelpers.markRewardRedeemed(reward, order.orderNo); });
            }
        });
    } catch (e) {
        // The reward job syncs redemptions from the platform, so a failure here is recovered.
        require('dw/system/Logger').getLogger('plugin-luckydraw', 'luckydraw-reward').error('Recording reward redemption for order {0} failed: {1}', order.orderNo, e.message);
    }
    return next();
});

module.exports = server.exports();
