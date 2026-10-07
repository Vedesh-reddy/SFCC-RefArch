'use strict';

/**
 * Job step: flags wishlist price drops for the login popup and emails each owner
 * one summary. Flags are committed before the email, so a mail failure still
 * leaves the popup and never re-sends the same drop.
 * @module scripts/jobs/priceDropCheck
 */

var ProductListMgr = require('dw/customer/ProductListMgr');
var ProductList = require('dw/customer/ProductList');
var Transaction = require('dw/system/Transaction');
var Status = require('dw/system/Status');
var Resource = require('dw/web/Resource');
var Site = require('dw/system/Site');
var URLUtils = require('dw/web/URLUtils');
var Logger = require('dw/system/Logger');
var wishlist = require('*/cartridge/scripts/customWishlist');
var emailHelpers = require('*/cartridge/scripts/helpers/emailHelpers');

var customLogger = Logger.getLogger('custom-wishlist', 'price-drop-job');

/**
 * @param {dw.customer.ProductList} list - Wish list
 * @returns {boolean} Whether the owner was emailed
 */
function processList(list) {
    var owner = list.owner;
    if (!owner || !owner.profile) {
        return false;
    }
    var dropped = [];
    Transaction.wrap(function () {
        wishlist.onlineItems(list).forEach(function (item) {
            if (wishlist.flagPriceDrop(item)) {
                dropped.push(wishlist.toViewModel(item));
            }
        });
    });
    var email = owner.profile.email;
    if (!dropped.length || !email) {
        return false;
    }
    emailHelpers.sendEmail({
        to: email,
        subject: Resource.msg('email.subject', 'customwishlist', null),
        from: Site.current.getCustomPreferenceValue('customerServiceEmail') || 'no-reply@testorganization.com',
        type: 'wishlistPriceDrop'
    }, 'wishlist/priceDropEmail', {
        firstName: owner.profile.firstName,
        items: dropped,
        wishlistUrl: URLUtils.https('CustomWishlist-Show').toString()
    });
    return true;
}

/**
 * @returns {dw.system.Status} OK, or ERROR when any list failed
 */
function execute() {
    var lists = ProductListMgr.queryProductLists('type = {0}', null, ProductList.TYPE_WISH_LIST);
    var emailed = 0;
    var failed = 0;
    try {
        while (lists.hasNext()) {
            var list = lists.next();
            try {
                if (processList(list)) {
                    emailed += 1;
                }
            } catch (e) {
                failed += 1;
                customLogger.error('Wishlist {0} price check failed: {1}', list.ID, e.message);
            }
        }
    } finally {
        lists.close();
    }
    customLogger.info('Wishlist price check finished: {0} emailed, {1} failed', emailed, failed);
    return failed ? new Status(Status.ERROR, 'ERROR', failed + ' wishlist(s) failed') : new Status(Status.OK, 'OK');
}

module.exports = {
    execute: execute
};
