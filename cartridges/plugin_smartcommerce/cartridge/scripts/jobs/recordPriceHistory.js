'use strict';

/**
 * Job step: records a price change point for every online product whose price
 * differs from the last one recorded. One small transaction per changed product.
 * @module scripts/jobs/recordPriceHistory
 */

var ProductMgr = require('dw/catalog/ProductMgr');
var Status = require('dw/system/Status');
var Logger = require('dw/system/Logger');
var priceHistory = require('*/cartridge/scripts/priceHistory');

var customLogger = Logger.getLogger('smart-commerce', 'price-history-job');

/**
 * @returns {dw.system.Status} OK, or ERROR when any product failed
 */
function execute() {
    var now = Date.now();
    var products = ProductMgr.queryAllSiteProducts();
    var changed = 0;
    var failed = 0;
    try {
        while (products.hasNext()) {
            var product = products.next();
            try {
                if (product.online && priceHistory.record(product, now)) {
                    changed += 1;
                }
            } catch (e) {
                failed += 1;
                customLogger.error('Price history failed for product {0}: {1}', product.ID, e.message);
            }
        }
    } finally {
        products.close();
    }
    customLogger.info('Price history recorded: {0} changed, {1} failed', changed, failed);
    return failed ? new Status(Status.ERROR, 'ERROR', failed + ' product(s) failed') : new Status(Status.OK, 'OK');
}

module.exports = {
    execute: execute
};
