'use strict';

var server = require('server');

server.extend(module.superModule);

// Access can end after a product went into the basket, and reward codes belong to one customer.
// Checked before the base route creates the order, so a refusal never leaves a failed order behind.
server.prepend('PlaceOrder', function (req, res, next) {
    var basket = require('dw/order/BasketMgr').getCurrentBasket();
    if (!basket) return next();
    var accessHelpers = require('*/cartridge/scripts/helpers/membershipAccessHelpers');
    var rewardHelpers = require('*/cartridge/scripts/helpers/membershipRewardHelpers');
    var Resource = require('dw/web/Resource');
    var customerNo = req.currentCustomer.profile && req.currentCustomer.raw.authenticated ? req.currentCustomer.profile.customerNo : null;
    var message = null;
    if (accessHelpers.findBlockedProduct(basket, customerNo)) {
        message = Resource.msg('access.basket', 'primemembership', null);
    } else if (basket.couponLineItems.toArray().some(function (coupon) { return rewardHelpers.isForeignRewardCode(coupon.couponCode, customerNo); })) {
        message = Resource.msg('error.reward-not-yours', 'primemembership', null);
    }
    if (!message) return next();
    res.json({ error: true, errorMessage: message });
    this.done(req, res);
    return null;
});

module.exports = server.exports();
