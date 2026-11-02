'use strict';

/**
 * Who may buy a product right now, from three product attributes: minimum plan rank, public sale
 * start and launch date. Members with the matching benefit get in early by the hours on their
 * plan. Every path into a basket checks this on the server; the storefront labels only explain it.
 */

var membershipHelpers = require('*/cartridge/scripts/helpers/membershipHelpers');
var benefitHelpers = require('*/cartridge/scripts/helpers/membershipBenefitHelpers');

var HOUR = 3600000;

/**
 * @param {dw.catalog.Product} product - product
 * @param {string} name - attribute
 * @returns {*} the value on the product, or else on its master
 */
function getRule(product, name) {
    var own = product.custom[name];
    if (own !== null && own !== undefined) return own;
    return product.isVariant() && product.masterProduct ? product.masterProduct.custom[name] : null;
}

/**
 * @param {?Date} publicAt - public start
 * @param {?Object} benefit - early access benefit of the member's plan
 * @param {number} now - now
 * @returns {boolean} true when this shopper is past the start
 */
function isOpen(publicAt, benefit, now) {
    if (!publicAt) return true;
    var opensAt = publicAt.getTime() - (benefit && benefit.enabled === true ? benefit.hours * HOUR : 0);
    return now >= opensAt;
}

/**
 * @param {?string} customerNo - shopper, null for a guest
 * @param {dw.catalog.Product} product - product
 * @param {number} [nowMs] - now
 * @returns {Object} {allowed, reason, label, publicAt}; a nonmember is only limited by products set up for this
 */
function checkProductAccess(customerNo, product, nowMs) {
    var result = { allowed: true, reason: null, label: null, publicAt: null };
    if (!require('*/cartridge/scripts/helpers/membershipPlanHelpers').isEnabled()) return result;
    var minRank = getRule(product, 'primeMembershipMinRank');
    var publicAt = getRule(product, 'primeMembershipPublicAt');
    var launchAt = getRule(product, 'primeMembershipLaunchAt');
    if (!minRank && !publicAt && !launchAt) return result;
    var now = nowMs || Date.now();
    var active = customerNo ? benefitHelpers.getActiveMembership(customerNo) : null;
    var benefits = active ? active.plan.benefits : {};
    if (minRank && (!active || active.plan.planRank < minRank)) {
        result.allowed = false;
        result.reason = 'members-only';
        result.label = 'exclusive';
    } else if (!isOpen(launchAt, benefits['launch-access'], now)) {
        result.allowed = false;
        result.reason = 'not-launched';
        result.label = 'launch';
        result.publicAt = launchAt;
    } else if (!isOpen(publicAt, benefits['early-access'], now)) {
        result.allowed = false;
        result.reason = 'early-access';
        result.label = 'early-access';
        result.publicAt = publicAt;
    } else if (minRank) {
        result.label = 'exclusive';
    } else if ((publicAt && publicAt.getTime() > now) || (launchAt && launchAt.getTime() > now)) {
        result.label = 'early-access';
    }
    return result;
}

/**
 * @param {?string} customerNo - shopper
 * @param {string} productID - product
 * @returns {Object} access decision; an unknown product is left to the base route
 */
function checkProductIdAccess(customerNo, productID) {
    var product = require('dw/catalog/ProductMgr').getProduct(productID);
    return product ? checkProductAccess(customerNo, product) : { allowed: true, reason: null, label: null, publicAt: null };
}

/**
 * @param {dw.order.LineItemCtnr} basket - basket
 * @param {?string} customerNo - shopper
 * @returns {?string} the first product the shopper may not buy
 */
function findBlockedProduct(basket, customerNo) {
    var blocked = null;
    basket.getAllProductLineItems().toArray().some(function (line) {
        if (!line.catalogProduct || !line.product) return false;
        if (checkProductAccess(customerNo, line.product).allowed) return false;
        blocked = line.productID;
        return true;
    });
    return blocked;
}

/**
 * What the storefront shows on a tile or product page. Labels and offers depend on the shopper,
 * so this is served from an uncached route rather than from cached tile markup.
 * @param {?string} customerNo - shopper
 * @param {string[]} productIDs - products
 * @returns {Object} productID => {locked, label, offer}
 */
function getProductLabels(customerNo, productIDs) {
    var Resource = require('dw/web/Resource');
    var ProductMgr = require('dw/catalog/ProductMgr');
    var active = customerNo ? benefitHelpers.getActiveMembership(customerNo) : null;
    var discount = active ? active.plan.benefits['member-discount'] : null;
    var labels = {};
    productIDs.forEach(function (id) {
        var product = ProductMgr.getProduct(id);
        if (!product) return;
        var access = checkProductAccess(customerNo, product);
        var entry = { locked: !access.allowed, label: access.label ? Resource.msg('label.' + access.label, membershipHelpers.BUNDLE, null) : '', offer: '' };
        if (active && discount && discount.enabled === true && benefitHelpers.isProductEligible(discount, product)) {
            entry.offer = Resource.msgf('label.member-offer', membershipHelpers.BUNDLE, null, String(discount.percent));
        }
        if (entry.locked || entry.label || entry.offer) labels[id] = entry;
    });
    return labels;
}

module.exports = {
    checkProductAccess: checkProductAccess,
    checkProductIdAccess: checkProductIdAccess,
    findBlockedProduct: findBlockedProduct,
    getProductLabels: getProductLabels
};
