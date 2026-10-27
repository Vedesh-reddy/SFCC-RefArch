'use strict';

var server = require('server');

server.extend(module.superModule);

// A lucky draw coupon code may only be used by its winner and before its expiry; the
// platform knows neither rule, so they are checked before the base route applies the code.
server.prepend('AddCoupon', function (req, res, next) {
    var result = require('*/cartridge/scripts/helpers/luckyDrawRewardHelpers').checkRewardCode(String(req.querystring.couponCode || ''), req.currentCustomer.raw);
    if (!result || result.ok) return next();
    var Resource = require('dw/web/Resource');
    res.json({ error: true, errorMessage: Resource.msg('coupon.' + result.reason, 'luckydraw', Resource.msg('coupon.invalid', 'luckydraw', null)) });
    this.done(req, res);
    return null;
});

module.exports = server.exports();
