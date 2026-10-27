'use strict';

/**
 * @param {Object} overrides - fields to change
 * @returns {Object} complete, valid seller application input
 */
function application(overrides) {
    return Object.assign({
        sellerId: 'SELLERA',
        displayName: 'Seller A Audio',
        legalName: 'Seller A LLC',
        businessType: 'LLC',
        registrationNumber: 'REG-1001',
        taxId: '12-3456789',
        address: { line1: '1 Market St', city: 'San Francisco', stateCode: 'CA', postalCode: '94105', countryCode: 'US' },
        contactName: 'Ada Seller',
        contactEmail: 'ada@example.com',
        contactPhone: '+1 415 555 0100',
        agreementAccepted: true,
        agreementVersion: '2026-10'
    }, overrides || {});
}

/**
 * @param {Object} h - harness
 * @param {string} customerNo - signed-in customer
 * @param {string} permission - permission
 * @returns {Object} seller context or error result
 */
function context(h, customerNo, permission) {
    return h.require('scripts/helpers/sellerHelpers').getSellerContext(h.customer(customerNo), permission);
}

/**
 * Creates an approved seller directly (bypassing the approval flow) for tests of later stages.
 * @param {Object} h - harness
 * @param {string} sellerId - seller
 * @param {string} customerNo - owner
 * @param {Object} [fields] - extra seller fields
 * @returns {Object} seller context from sellerHelpers.getSellerContext
 */
function approvedSeller(h, sellerId, customerNo, fields) {
    h.create('MarketplaceSeller', sellerId, Object.assign({
        status: 'APPROVED', displayName: sellerId + ' Store', contactEmail: sellerId.toLowerCase() + '@example.com', emailVerified: true,
        tier: 'STANDARD', ratingSum: 0, ratingCount: 0, inventoryListId: 'marketplace-' + sellerId.toLowerCase(), bankStatus: 'VERIFIED',
        kycStatus: 'VERIFIED', revision: 0, settings: '{}'
    }, fields || {}));
    h.create('MarketplaceSellerMember', customerNo, { sellerId: sellerId, role: 'OWNER', active: true });
    return context(h, customerNo, 'profile.read');
}

/**
 * Registers a sellable product in the catalog double.
 * @param {Object} h - harness
 * @param {string} id - product ID
 * @param {Object} [extra] - {categories, custom, bookPriceCents}
 * @returns {Object} product double
 */
function product(h, id, extra) {
    var opts = extra || {};
    var category = { ID: 'electronics', online: true, root: false, parent: { ID: 'root', root: true } };
    h.state.categories.electronics = category;
    var p = {
        ID: id,
        name: 'Product ' + id,
        online: true,
        master: false,
        variationGroup: false,
        productSet: false,
        bundle: false,
        custom: opts.custom || {},
        isVariant: function () { return false; },
        onlineCategories: { toArray: function () { return [category]; } },
        categories: { toArray: function () { return [category]; } },
        isAssignedToCategory: function () { return true; },
        priceModel: { getPriceBookPrice: function () { return opts.bookPriceCents ? new h.Money(opts.bookPriceCents / 100, 'USD') : null; } }
    };
    h.state.products[id] = p;
    return p;
}

module.exports = {
    application: application,
    approvedSeller: approvedSeller,
    context: context,
    product: product
};
