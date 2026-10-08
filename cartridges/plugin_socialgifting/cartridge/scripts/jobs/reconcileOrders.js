'use strict';

var store = require('../helpers/store');
var prefs = require('../util/preferences');
var OrderMgr = require('dw/order/OrderMgr');
var Status = require('dw/system/Status');
var Logger = require('dw/system/Logger');
/**
 * Process a bounded job batch and report partial failures.
 * @returns {*} Domain result
 */
function execute() {
    var failed = false;
    var size = prefs.number('RegistryJobBatchSize');
    // Continue accounting even if the feature is switched off after taking orders.
    [['Contribution', 'PENDING'], ['RegistryReservation', 'ORDER_PENDING'], ['RegistryPurchase', 'PURCHASED']].forEach(function (spec) {
        store.query(spec[0], 'custom.status = {0}', [spec[1]], size, 'lastModified asc').forEach(function (record) {
            try {
                store.transaction(function () { record.custom.lastCheckedAt = new Date(); });
                var order = record.custom.orderNo && OrderMgr.getOrder(record.custom.orderNo);
                if (!order) return;
                if (spec[0] === 'Contribution') require('../helpers/contributionCheckoutHelper').reconcile(order);
                else if (spec[0] === 'RegistryPurchase') {
                    require('../helpers/purchaseHelper').cancel(order);
                    if (order.status.value === require('dw/order/Order').ORDER_STATUS_COMPLETED) store.transaction(function () { record.custom.status = 'COMPLETED'; });
                } else require('../helpers/purchaseHelper').record(order);
            } catch (e) { failed = true; Logger.getLogger('social-gifting', 'registry').error('Order reconciliation failed for {0}', record.custom.orderNo || 'unassigned'); }
        });
    });
    return new Status(failed ? Status.ERROR : Status.OK);
}
module.exports = { execute: execute };
