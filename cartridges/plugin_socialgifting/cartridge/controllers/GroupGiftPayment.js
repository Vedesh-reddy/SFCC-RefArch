'use strict';

var server = require('server');
var security = require('*/cartridge/scripts/middleware/socialGifting');
server.post('Callback', server.middleware.https, function (req, res, next) {
    security.noCache(res);
    try {
        var event = require('*/cartridge/scripts/services/paymentAdapter').callback(request);
        var helper = require('*/cartridge/scripts/helpers/contributionHelper');
        var expected = helper.get(event.contributionKey);
        if (expected.custom.orderNo !== event.orderNo) require('*/cartridge/scripts/util/validation').fail('PAYMENT_MISMATCH', 409);
        if (event.type === 'REFUND') helper.refund(event.contributionKey, event.cumulativeAmount, event.eventID);
        else if (event.type === 'FAILED') {
            var store = require('*/cartridge/scripts/helpers/store');
            store.transaction(function () { helper.fail(helper.get(event.contributionKey)); });
        } else if (event.type === 'CAPTURED') {
            // Existing order is the source of amount/currency and paid state.
            var record = helper.get(event.contributionKey);
            var order = require('dw/order/OrderMgr').getOrder(record.custom.orderNo);
            if (!order) require('*/cartridge/scripts/util/validation').fail('PAYMENT_MISMATCH', 409);
            require('*/cartridge/scripts/helpers/contributionCheckoutHelper').reconcile(order);
            if (helper.get(event.contributionKey).custom.status !== 'PAID') require('*/cartridge/scripts/util/validation').fail('PAYMENT_PENDING', 409);
        } else require('*/cartridge/scripts/util/validation').fail('INVALID_EVENT');
        res.json({ success: true });
    } catch (e) { security.error(res, e); }
    return next();
});
module.exports = server.exports();
