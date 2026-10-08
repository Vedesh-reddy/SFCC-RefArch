'use strict';

var HookMgr = require('dw/system/HookMgr');
var OrderMgr = require('dw/order/OrderMgr');
var Status = require('dw/system/Status');
var store = require('../helpers/store');
/**
 * Ask the merchant funding integration for an idempotent fulfillment order, outside transactions.
 * @returns {dw.system.Status} Job status
 */
function execute() {
    if (!HookMgr.hasHook('app.socialGifting.fulfillment')) return new Status(Status.ERROR, 'NOT_CONFIGURED');
    var failed = false;
    store.query('GroupGift', 'custom.status = {0}', ['FUNDED'], require('../util/preferences').number('RegistryJobBatchSize'), 'lastModified asc')
        .forEach(function (gift) {
            try {
                store.transaction(function () { gift.custom.lastCheckedAt = new Date(); });
                var orderNo = HookMgr.callHook('app.socialGifting.fulfillment', 'createOrder', gift.custom.publicKey);
                var order = orderNo && OrderMgr.getOrder(orderNo);
                if (!order) throw new Error('FULFILLMENT_PENDING');
                require('../helpers/groupGiftHelper').complete(gift.custom.publicKey, order);
            } catch (e) { failed = true; }
        });
    return new Status(failed ? Status.ERROR : Status.OK);
}
module.exports = { execute: execute };
