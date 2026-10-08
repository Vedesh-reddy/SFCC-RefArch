'use strict';

/**
 * Job step: emails pending back-in-stock and price-drop alerts that triggered,
 * and expires the ones past their expiry date. Each alert is sent at most once:
 * its status leaves pending as soon as the send is attempted.
 * @module scripts/jobs/sendProductAlerts
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var ProductMgr = require('dw/catalog/ProductMgr');
var Status = require('dw/system/Status');
var URLUtils = require('dw/web/URLUtils');
var Logger = require('dw/system/Logger');
var productAlerts = require('*/cartridge/scripts/productAlerts');
var priceHistory = require('*/cartridge/scripts/priceHistory');
var smartMail = require('*/cartridge/scripts/smartMail');

var customLogger = Logger.getLogger('smart-commerce', 'product-alerts-job');

/**
 * @param {dw.object.CustomObject} alert - Pending alert
 * @param {number} now - Current time in ms
 * @returns {string|null} Resulting status, null when still waiting
 */
function processAlert(alert, now) {
    if (alert.custom.expiresAt && alert.custom.expiresAt.getTime() < now) {
        productAlerts.setStatus(alert, 'expired');
        return 'expired';
    }
    var product = ProductMgr.getProduct(alert.custom.productID);
    if (!product || !product.online || !productAlerts.isTriggered(alert, product)) {
        return null;
    }
    var price = priceHistory.currentPrice(product);
    var image = product.getImage('small', 0);
    var status = 'sent';
    try {
        smartMail.send(alert.custom.email, 'email.alert.subject.' + alert.custom.alertType, 'smart/email/product-alert', {
            alertType: alert.custom.alertType,
            name: product.name,
            url: URLUtils.https('Product-Show', 'pid', product.ID).toString(),
            image: image ? image.absURL.toString() : null,
            price: price ? price.toFormattedString() : null
        });
    } catch (e) {
        status = 'failed';
        customLogger.error('Alert {0} email failed: {1}', alert.UUID, e.message);
    }
    productAlerts.setStatus(alert, status);
    return status;
}

/**
 * @returns {dw.system.Status} OK, or ERROR when any alert failed
 */
function execute() {
    var now = Date.now();
    var counts = { sent: 0, expired: 0, failed: 0 };
    var alerts = CustomObjectMgr.queryCustomObjects(productAlerts.TYPE, 'custom.status = {0}', 'creationDate asc', 'pending');
    try {
        while (alerts.hasNext()) {
            var alert = alerts.next();
            try {
                var status = processAlert(alert, now);
                if (status) {
                    counts[status] += 1;
                }
            } catch (e) {
                counts.failed += 1;
                customLogger.error('Alert {0} failed: {1}', alert.UUID, e.message);
            }
        }
    } finally {
        alerts.close();
    }
    customLogger.info('Product alerts: {0} sent, {1} expired, {2} failed', counts.sent, counts.expired, counts.failed);
    return counts.failed ? new Status(Status.ERROR, 'ERROR', counts.failed + ' alert(s) failed') : new Status(Status.OK, 'OK');
}

module.exports = {
    execute: execute
};
