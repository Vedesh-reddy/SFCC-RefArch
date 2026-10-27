'use strict';

/**
 * Seller offers: one MarketplaceOffer per seller and catalog product (key
 * "<sellerId>:<productId>") with the seller's price, stock and terms, so many sellers can
 * sell the same product without duplicating it. Stock lives in a per-seller inventory list
 * that the sync job writes; basket lines are bound to that list, so the platform reserves
 * the seller's stock when the order is created.
 *
 * Also holds the listing checks shared with product submissions (GTIN, duplicates, price,
 * category permissions).
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Resource = require('dw/web/Resource');
var Logger = require('dw/system/Logger');
var marketplaceHelpers = require('*/cartridge/scripts/helpers/marketplaceHelpers');
var sellerHelpers = require('*/cartridge/scripts/helpers/sellerHelpers');

var log = Logger.getLogger('plugin-seller', 'seller-marketplace');

var SKU = /^[A-Z0-9][A-Z0-9._-]{0,38}[A-Z0-9]$/;
var OFFER_FLOW = {
    DRAFT: ['PENDING_REVIEW', 'ACTIVE'],
    PENDING_REVIEW: ['ACTIVE', 'REJECTED'],
    ACTIVE: ['INACTIVE', 'SUSPENDED', 'PENDING_REVIEW'],
    INACTIVE: ['ACTIVE', 'PENDING_REVIEW', 'SUSPENDED'],
    SUSPENDED: ['INACTIVE', 'ACTIVE'],
    REJECTED: ['PENDING_REVIEW']
};

/**
 * @param {string} gtin - 8, 12, 13 or 14 digits
 * @returns {boolean} true when the GS1 check digit is correct
 */
function isValidGtin(gtin) {
    var digits = String(gtin || '');
    if (!/^(\d{8}|\d{12,14})$/.test(digits)) return false;
    var sum = 0;
    for (var i = digits.length - 2, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) sum += Number(digits.charAt(i)) * weight;
    return (10 - (sum % 10)) % 10 === Number(digits.charAt(digits.length - 1));
}

/**
 * @param {string} brand - brand
 * @param {string} name - product name
 * @returns {string} hash of the normalized brand and title, to find duplicate listings
 */
function getTitleHash(brand, name) {
    return marketplaceHelpers.sha256((String(brand || '') + ' ' + String(name || '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()).slice(0, 40);
}

/**
 * @param {string} sellerId - seller
 * @param {Object} payload - {sellerSku, gtin, brand, name}
 * @param {?string} ignoreSubmissionId - submission being checked
 * @returns {string[]} DUPLICATE_SKU | DUPLICATE_GTIN | DUPLICATE_TITLE
 */
function findDuplicates(sellerId, payload, ignoreSubmissionId) {
    var flags = [];
    var live = ' AND custom.status != {2} AND custom.submissionId != {3}';
    var ignore = ignoreSubmissionId || '';
    if (payload.sellerSku && (marketplaceHelpers.queryCount('MarketplaceSubmission', 'custom.sellerId = {0} AND custom.sellerSku = {1}' + live, [sellerId, payload.sellerSku, 'REJECTED', ignore]) > 0
        || marketplaceHelpers.queryCount('MarketplaceOffer', 'custom.sellerId = {0} AND custom.sellerSku = {1}', [sellerId, payload.sellerSku]) > 0)) {
        flags.push('DUPLICATE_SKU');
    }
    if (payload.gtin && marketplaceHelpers.queryCount('MarketplaceSubmission', 'custom.gtin = {0} AND custom.sellerId != {1}' + live, [payload.gtin, sellerId, 'REJECTED', ignore]) > 0) flags.push('DUPLICATE_GTIN');
    if (payload.name && marketplaceHelpers.queryCount('MarketplaceSubmission', 'custom.titleHash = {0} AND custom.sellerId != {1}' + live, [getTitleHash(payload.brand, payload.name), sellerId, 'REJECTED', ignore]) > 0) flags.push('DUPLICATE_TITLE');
    return flags;
}

/**
 * @param {string} productId - product
 * @param {?string} ignoreOfferId - offer being priced
 * @returns {?number} reference price in cents: the marketplace price book, else the lowest active offer
 */
function getReferencePrice(productId, ignoreOfferId) {
    var product = productId ? require('dw/catalog/ProductMgr').getProduct(productId) : null;
    var priceBookId = sellerHelpers.getPreference('sellerPriceBookId');
    if (product && priceBookId) {
        var bookPrice = product.priceModel.getPriceBookPrice(priceBookId);
        if (bookPrice && bookPrice.available) return marketplaceHelpers.centsOf(bookPrice);
    }
    var lowest = null;
    marketplaceHelpers.queryPage('MarketplaceOffer', 'custom.productId = {0} AND custom.status = {1}', null, [productId, 'ACTIVE'], 0, 200).items.forEach(function (offer) {
        if (offer.custom.offerId !== ignoreOfferId && (lowest === null || offer.custom.priceCents < lowest)) lowest = offer.custom.priceCents;
    });
    return lowest;
}

/**
 * @param {number} priceCents - proposed price
 * @param {?number} reference - reference price
 * @returns {{invalid: ?string, suspicious: boolean}} out of range is invalid; a large deviation is suspicious
 */
function checkPrice(priceCents, reference) {
    if (priceCents < sellerHelpers.getPreference('sellerMinPriceCents') || priceCents > sellerHelpers.getPreference('sellerMaxPriceCents')) return { invalid: 'price-out-of-range', suspicious: false };
    var suspicious = !!reference && Math.abs(priceCents - reference) * 100 > reference * sellerHelpers.getPreference('sellerPriceDeviationPercent');
    return { invalid: null, suspicious: suspicious };
}

/**
 * @param {dw.catalog.Category} category - category
 * @param {string[]} ids - category IDs
 * @returns {boolean} true when the category or a parent is in ids
 */
function isWithin(category, ids) {
    var current = category;
    while (current) {
        if (ids.indexOf(current.ID) >= 0) return true;
        current = current.root ? null : current.parent;
    }
    return false;
}

/**
 * @param {string} categoryId - site catalog category
 * @param {dw.object.CustomObject} seller - seller
 * @returns {{invalid: ?string, restricted: boolean}} whether the seller may list there
 */
function checkCategory(categoryId, seller) {
    var category = require('dw/catalog/CatalogMgr').getCategory(categoryId);
    if (!category || !category.online) return { invalid: 'category-unknown', restricted: false };
    if (!isWithin(category, sellerHelpers.getListPreference('sellerAllowedCategoryIds'))) return { invalid: 'category-not-allowed', restricted: false };
    var restricted = isWithin(category, sellerHelpers.getListPreference('sellerRestrictedCategoryIds'));
    var grants = seller.custom.restrictedCategoryGrants ? Array.prototype.slice.call(seller.custom.restrictedCategoryGrants) : [];
    if (restricted && !isWithin(category, grants)) return { invalid: 'category-restricted', restricted: true };
    return { invalid: null, restricted: restricted };
}

/**
 * @param {dw.catalog.Product} product - existing catalog product
 * @param {dw.object.CustomObject} seller - seller
 * @returns {{invalid: ?string, restricted: boolean}} result for the product's online categories
 */
function checkProductCategory(product, seller) {
    var categories = product.isVariant() ? product.masterProduct.onlineCategories : product.onlineCategories;
    var last = { invalid: 'category-not-allowed', restricted: false };
    var list = categories ? categories.toArray() : [];
    for (var i = 0; i < list.length; i++) {
        var result = checkCategory(list[i].ID, seller);
        if (!result.invalid) return result;
        last = result;
    }
    return last;
}

/**
 * @param {dw.object.CustomObject} offer - offer
 * @param {dw.object.CustomObject} seller - its seller
 * @returns {number} units the seller can still sell (never more than the platform's ATS)
 */
function getAvailableQuantity(offer, seller) {
    var listId = seller && seller.custom.inventoryListId;
    var list = listId ? require('dw/catalog/ProductInventoryMgr').getInventoryList(listId) : null;
    var record = list ? list.getRecord(offer.custom.productId) : null;
    var ats = record ? Math.max(0, Math.floor(record.ATS.value)) : 0;
    // A lower stock entered since the last sync applies at once; a higher one waits for the sync.
    return offer.custom.stockDirty ? Math.min(ats, offer.custom.stock || 0) : ats;
}

/**
 * Orders offers for the featured ("buy box") position.
 * @param {Object[]} candidates - {offerId, priceCents, rating, handlingDays, available}
 * @returns {Object[]} sellable candidates, best first
 */
function rankOffers(candidates) {
    var strategy = sellerHelpers.getEnumPreference('sellerFeaturedOfferStrategy') || 'LOWEST_PRICE';
    var weights = marketplaceHelpers.parseJson(sellerHelpers.getPreference('sellerFeaturedOfferWeights'), null);
    if (!weights || weights.price + weights.rating + weights.handling !== 100) weights = { price: 100, rating: 0, handling: 0 };
    var sellable = candidates.filter(function (c) { return c.available > 0 && c.priceCents > 0; });
    if (!sellable.length) return [];
    var minPrice = Math.min.apply(null, sellable.map(function (c) { return c.priceCents; }));
    var minHandling = Math.min.apply(null, sellable.map(function (c) { return c.handlingDays; }));
    sellable.forEach(function (c) {
        var ratingTenths = c.rating ? Math.round(c.rating * 10) : 0;
        c.score = strategy === 'WEIGHTED'
            ? Math.floor((weights.price * minPrice * 10000) / c.priceCents) + Math.floor((weights.rating * ratingTenths * 10000) / 50) + Math.floor((weights.handling * (minHandling + 1) * 10000) / (c.handlingDays + 1))
            : -c.priceCents;
    });
    return sellable.sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        if (a.priceCents !== b.priceCents) return a.priceCents - b.priceCents;
        if ((b.rating || 0) !== (a.rating || 0)) return (b.rating || 0) - (a.rating || 0);
        if (a.handlingDays !== b.handlingDays) return a.handlingDays - b.handlingDays;
        return a.offerId < b.offerId ? -1 : 1;
    });
}

/**
 * @param {dw.object.CustomObject} offer - offer
 * @returns {Object} seller-facing offer view
 */
function getOfferView(offer) {
    var c = offer.custom;
    return {
        offerId: c.offerId,
        productId: c.productId,
        sellerSku: c.sellerSku,
        status: c.status,
        statusReason: c.statusReason || null,
        priceCents: c.priceCents,
        proposedPriceCents: c.proposedPriceCents || null,
        reviewState: c.reviewState || 'NONE',
        reviewFlags: c.reviewFlags ? Array.prototype.slice.call(c.reviewFlags) : [],
        quantity: c.stock,
        stockPendingSync: !!c.stockDirty,
        condition: c.condition,
        handlingDays: c.handlingDays,
        returnable: c.returnable,
        returnDays: c.returnDays,
        warranty: c.warranty || null,
        revision: c.revision || 0,
        updatedAt: c.updatedAt
    };
}

/**
 * Public offers of a product, best first; the first one is featured.
 * @param {string} productId - product
 * @returns {Object[]} offers for the PDP and the API
 */
function getProductOffers(productId) {
    var candidates = [];
    marketplaceHelpers.queryPage('MarketplaceOffer', 'custom.productId = {0} AND custom.status = {1}', null, [productId, 'ACTIVE'], 0, 100).items.forEach(function (offer) {
        var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', offer.custom.sellerId);
        if (!seller || seller.custom.status !== 'APPROVED') return;
        var terms = sellerHelpers.getSellerTerms(seller);
        var profile = sellerHelpers.getSellerView(seller);
        candidates.push({
            offerId: offer.custom.offerId,
            sellerId: seller.custom.sellerId,
            sellerName: seller.custom.displayName,
            rating: profile.rating,
            ratingCount: profile.ratingCount,
            priceCents: offer.custom.priceCents,
            available: getAvailableQuantity(offer, seller),
            handlingDays: typeof offer.custom.handlingDays === 'number' ? offer.custom.handlingDays : terms.handlingDays,
            condition: offer.custom.condition || 'NEW',
            returnable: offer.custom.returnable !== false && terms.returnsAccepted,
            returnDays: typeof offer.custom.returnDays === 'number' ? offer.custom.returnDays : terms.returnDays,
            shippingFeeCents: terms.shippingFeeCents,
            freeShippingOverCents: terms.freeShippingOverCents
        });
    });
    var ranked = rankOffers(candidates);
    ranked.forEach(function (c, index) { c.featured = index === 0; });
    return ranked;
}

/**
 * Cart and checkout check of one offer.
 * @param {string} offerId - offer key
 * @param {string} productId - product of the line
 * @param {number} quantity - total quantity wanted from this offer
 * @returns {{ok: boolean, reason: ?string, offer: ?Object, seller: ?Object, available: number}} verdict
 */
function checkOfferBuyable(offerId, productId, quantity) {
    var verdict = { ok: false, reason: null, offer: null, seller: null, available: 0 };
    var offer = CustomObjectMgr.getCustomObject('MarketplaceOffer', String(offerId));
    var seller = offer ? CustomObjectMgr.getCustomObject('MarketplaceSeller', offer.custom.sellerId) : null;
    var product = require('dw/catalog/ProductMgr').getProduct(productId);
    if (!marketplaceHelpers.isMarketplaceEnabled()) verdict.reason = 'marketplace-disabled';
    else if (!offer || offer.custom.productId !== productId || offer.custom.status !== 'ACTIVE') verdict.reason = 'offer-unavailable';
    else if (!seller || seller.custom.status !== 'APPROVED') verdict.reason = 'seller-unavailable';
    else if (!product || !product.online) verdict.reason = 'product-offline';
    if (verdict.reason) return verdict;
    verdict.offer = offer;
    verdict.seller = seller;
    verdict.available = getAvailableQuantity(offer, seller);
    if (!(quantity > 0) || verdict.available < quantity) {
        verdict.reason = 'insufficient-stock';
        return verdict;
    }
    verdict.ok = true;
    return verdict;
}

/**
 * Checks offer fields from the seller portal or the API.
 * @param {Object} data - {price, quantity, sellerSku, condition, handlingDays, returnable, returnDays, warranty}
 * @param {boolean} partial - true for changes (missing fields allowed)
 * @returns {{value: Object, invalid: Object}} clean values and problems
 */
function checkOfferFields(data, partial) {
    var value = {};
    var invalid = {};
    var has = function (name) { return data[name] !== undefined && data[name] !== null && data[name] !== ''; };
    if (has('price')) {
        value.priceCents = marketplaceHelpers.toCents(data.price);
        if (!value.priceCents) invalid.price = 'invalid';
    } else if (!partial) {
        invalid.price = 'required';
    }
    if (has('quantity')) {
        value.quantity = Number(data.quantity);
        if (Math.floor(value.quantity) !== value.quantity || value.quantity < 0 || value.quantity > 100000) invalid.quantity = 'invalid';
    } else if (!partial) {
        invalid.quantity = 'required';
    }
    if (has('sellerSku')) {
        value.sellerSku = marketplaceHelpers.cleanText(data.sellerSku).toUpperCase();
        if (!SKU.test(value.sellerSku)) invalid.sellerSku = 'invalid';
    } else if (!partial) {
        invalid.sellerSku = 'required';
    }
    if (has('condition')) {
        value.condition = String(data.condition).toUpperCase();
        if (['NEW', 'REFURBISHED'].indexOf(value.condition) < 0) invalid.condition = 'invalid';
    }
    ['handlingDays', 'returnDays'].forEach(function (name) {
        if (!has(name)) return;
        value[name] = Number(data[name]);
        var max = sellerHelpers.getPreference(name === 'handlingDays' ? 'sellerMaxHandlingDays' : 'sellerMaxReturnDays');
        if (Math.floor(value[name]) !== value[name] || value[name] < 0 || value[name] > max) invalid[name] = 'out-of-range';
    });
    if (data.returnable !== undefined) value.returnable = [true, 'true', 'on'].indexOf(data.returnable) >= 0;
    if (has('warranty')) {
        value.warranty = marketplaceHelpers.cleanText(data.warranty);
        if (value.warranty.length > 500) invalid.warranty = 'too-long';
    }
    return { value: value, invalid: invalid };
}

/**
 * Inside a transaction: opens a suspicious-price case.
 * @param {string} sellerId - seller
 * @param {string} offerId - offer
 * @param {string} productId - product
 * @param {number} priceCents - price
 */
function flagSuspiciousPrice(sellerId, offerId, productId, priceCents) {
    require('*/cartridge/scripts/helpers/caseHelpers').openCase({ caseType: 'SUSPICIOUS_PRICE', sellerId: sellerId, entityId: offerId, productId: productId, severity: 'MEDIUM', detail: { priceCents: priceCents }, dedupeKey: 'price:' + offerId });
}

/**
 * Lists the seller on an existing catalog product.
 * @param {Object} context - seller context (catalog.write)
 * @param {string} productId - product
 * @param {Object} data - offer fields
 * @returns {Object} result with offerView
 */
function createOffer(context, productId, data) {
    var check = checkOfferFields(data || {}, false);
    if (Object.keys(check.invalid).length) return marketplaceHelpers.errorResult('invalid', check.invalid);
    var v = check.value;
    var product = require('dw/catalog/ProductMgr').getProduct(String(productId));
    if (!product || !product.online) return marketplaceHelpers.errorResult('invalid', { productId: 'unknown' });
    if (product.master || product.variationGroup || product.productSet || product.bundle) return marketplaceHelpers.errorResult('invalid', { productId: 'not-sellable' });
    var category = checkProductCategory(product, context.seller);
    if (category.invalid) return marketplaceHelpers.errorResult('invalid', { productId: category.invalid });
    var price = checkPrice(v.priceCents, getReferencePrice(productId, null));
    if (price.invalid) return marketplaceHelpers.errorResult('invalid', { price: price.invalid });
    var maximum = sellerHelpers.getPreference('sellerMaximumProducts');
    if (marketplaceHelpers.queryCount('MarketplaceOffer', 'custom.sellerId = {0} AND custom.status != {1}', [context.sellerId, 'REJECTED']) >= maximum) return marketplaceHelpers.errorResult('limit-reached');
    if (marketplaceHelpers.queryCount('MarketplaceOffer', 'custom.sellerId = {0} AND custom.sellerSku = {1}', [context.sellerId, v.sellerSku]) > 0) return marketplaceHelpers.errorResult('invalid', { sellerSku: 'duplicate' });
    var key = context.sellerId + ':' + productId;
    if (CustomObjectMgr.getCustomObject('MarketplaceOffer', key)) return marketplaceHelpers.errorResult('conflict');
    var review = sellerHelpers.getPreference('sellerOfferApprovalRequired') !== false || price.suspicious;
    var offer;
    try {
        Transaction.wrap(function () {
            var now = new Date();
            offer = CustomObjectMgr.createCustomObject('MarketplaceOffer', key);
            var c = offer.custom;
            c.sellerId = context.sellerId;
            c.productId = productId;
            c.sellerSku = v.sellerSku;
            c.status = review ? 'PENDING_REVIEW' : 'ACTIVE';
            c.priceCents = v.priceCents;
            c.reviewState = review ? 'PENDING' : 'NONE';
            c.reviewFlags = price.suspicious ? ['SUSPICIOUS_PRICE'] : [];
            c.stock = v.quantity;
            c.stockUpdatedAt = now;
            c.stockDirty = true;
            c.priceDirty = true;
            c.condition = v.condition || 'NEW';
            c.handlingDays = v.handlingDays !== undefined ? v.handlingDays : null;
            c.returnable = v.returnable !== false;
            c.returnDays = v.returnDays !== undefined ? v.returnDays : null;
            c.warranty = v.warranty || null;
            c.createdAt = now;
            c.updatedAt = now;
            c.revision = 0;
            marketplaceHelpers.logAudit({ entityType: 'OFFER', entityId: key, sellerId: context.sellerId, action: 'CREATE', actor: context.actor, to: c.status, detail: { priceCents: v.priceCents, quantity: v.quantity } });
            if (price.suspicious) flagSuspiciousPrice(context.sellerId, key, productId, v.priceCents);
            if (review) marketplaceHelpers.notify(marketplaceHelpers.ADMIN, 'ADMIN_OFFER_PENDING', { offerId: key });
        });
    } catch (e) {
        return marketplaceHelpers.errorResult('conflict');
    }
    log.info('Offer {0} created with status {1}', key, offer.custom.status);
    return { error: false, offerView: getOfferView(offer) };
}

/**
 * Seller changes to price, terms or listing state. A price change that needs review stays a
 * proposal; the live price applies until a reviewer accepts it.
 * @param {Object} context - seller context (catalog.write)
 * @param {string} productId - product
 * @param {Object} data - changed fields, optionally {active: true|false}
 * @param {?number} revision - revision the form was rendered from
 * @returns {Object} result with offerView
 */
function updateOffer(context, productId, data, revision) {
    var offer = CustomObjectMgr.getCustomObject('MarketplaceOffer', context.sellerId + ':' + productId);
    if (!offer) return marketplaceHelpers.errorResult('not-found');
    var c = offer.custom;
    if (revision !== null && revision !== undefined && revision !== (c.revision || 0)) return marketplaceHelpers.errorResult('stale');
    var input = Object.assign({}, data || {});
    delete input.quantity;
    var check = checkOfferFields(input, true);
    if (Object.keys(check.invalid).length) return marketplaceHelpers.errorResult('invalid', check.invalid);
    var v = check.value;
    var price = null;
    if (v.priceCents !== undefined && v.priceCents !== c.priceCents) {
        price = checkPrice(v.priceCents, getReferencePrice(productId, c.offerId));
        if (price.invalid) return marketplaceHelpers.errorResult('invalid', { price: price.invalid });
    }
    var active = data && data.active !== undefined ? [true, 'true', 'on'].indexOf(data.active) >= 0 : null;
    var target = null;
    if (active === true && c.status === 'INACTIVE') target = 'ACTIVE';
    if (active === false && c.status === 'ACTIVE') target = 'INACTIVE';
    Transaction.wrap(function () {
        ['sellerSku', 'condition', 'handlingDays', 'returnable', 'returnDays', 'warranty'].forEach(function (name) {
            if (v[name] !== undefined) c[name] = v[name];
        });
        if (price) {
            if (c.status === 'ACTIVE' && (sellerHelpers.getPreference('sellerOfferApprovalRequired') !== false || price.suspicious)) {
                c.proposedPriceCents = v.priceCents;
                c.reviewState = 'PENDING';
                c.reviewFlags = price.suspicious ? ['SUSPICIOUS_PRICE'] : [];
                marketplaceHelpers.notify(marketplaceHelpers.ADMIN, 'ADMIN_OFFER_PENDING', { offerId: c.offerId });
            } else {
                c.priceCents = v.priceCents;
            }
            if (price.suspicious) flagSuspiciousPrice(context.sellerId, c.offerId, productId, v.priceCents);
        }
        if (target) c.status = target;
        c.priceDirty = true;
        c.updatedAt = new Date();
        c.revision = (c.revision || 0) + 1;
        marketplaceHelpers.logAudit({ entityType: 'OFFER', entityId: c.offerId, sellerId: context.sellerId, action: 'UPDATE', actor: context.actor, to: target, detail: { priceCents: v.priceCents === undefined ? null : v.priceCents } });
    });
    return { error: false, offerView: getOfferView(offer) };
}

/**
 * @param {Object} context - seller context (catalog.write)
 * @param {string} productId - product
 * @param {*} quantity - new absolute stock
 * @returns {Object} result with offerView
 */
function setOfferStock(context, productId, quantity) {
    var offer = CustomObjectMgr.getCustomObject('MarketplaceOffer', context.sellerId + ':' + productId);
    if (!offer) return marketplaceHelpers.errorResult('not-found');
    var check = checkOfferFields({ quantity: quantity }, true);
    if (check.invalid.quantity || check.value.quantity === undefined) return marketplaceHelpers.errorResult('invalid', { quantity: 'invalid' });
    if (['SUSPENDED', 'REJECTED'].indexOf(offer.custom.status) >= 0) return marketplaceHelpers.errorResult('not-allowed-now');
    Transaction.wrap(function () {
        var c = offer.custom;
        c.stock = check.value.quantity;
        c.stockUpdatedAt = new Date();
        c.stockDirty = true;
        c.priceDirty = true;
        c.updatedAt = new Date();
        c.revision = (c.revision || 0) + 1;
        marketplaceHelpers.logAudit({ entityType: 'OFFER', entityId: c.offerId, sellerId: context.sellerId, action: 'SET_STOCK', actor: context.actor, detail: { quantity: c.stock } });
    });
    return { error: false, offerView: getOfferView(offer) };
}

/**
 * @param {Object} context - seller context (catalog.read)
 * @param {?string} status - filter
 * @param {number} offset - rows to skip
 * @param {number} limit - page size
 * @returns {{items: Object[], total: number}} the seller's offers
 */
function getSellerOffers(context, status, offset, limit) {
    var page = marketplaceHelpers.queryPage('MarketplaceOffer', 'custom.sellerId = {0}' + (status ? ' AND custom.status = {1}' : ''), 'custom.updatedAt desc', status ? [context.sellerId, status] : [context.sellerId], offset, limit);
    return {
        items: page.items.map(function (o) {
            var view = getOfferView(o);
            view.available = getAvailableQuantity(o, context.seller);
            return view;
        }),
        total: page.total
    };
}

/**
 * Business Manager decision on an offer or its proposed price.
 * @param {string} offerId - offer key
 * @param {string} action - approve | reject | suspend | reinstate
 * @param {string} reason - reason (required to reject or suspend)
 * @param {Object} by - admin actor
 * @returns {Object} result
 */
function decideOffer(offerId, action, reason, by) {
    var offer = CustomObjectMgr.getCustomObject('MarketplaceOffer', String(offerId));
    if (!offer) return marketplaceHelpers.errorResult('not-found');
    var c = offer.custom;
    var text = marketplaceHelpers.cleanText(reason).slice(0, 1000);
    if ((action === 'reject' || action === 'suspend') && text.length < 3) return marketplaceHelpers.errorResult('invalid', { reason: 'required' });
    var from = c.status;
    var to = from;
    var notice;
    if (action === 'approve' || action === 'reject') {
        if (c.reviewState !== 'PENDING') return marketplaceHelpers.errorResult('not-allowed-now');
        if (from === 'PENDING_REVIEW') to = action === 'approve' ? 'ACTIVE' : 'REJECTED';
        notice = action === 'approve' ? 'OFFER_APPROVED' : 'OFFER_REJECTED';
    } else if (action === 'suspend') {
        to = 'SUSPENDED';
        notice = 'OFFER_SUSPENDED';
    } else if (action === 'reinstate') {
        if (from !== 'SUSPENDED') return marketplaceHelpers.errorResult('not-allowed-now');
        to = 'INACTIVE';
        notice = 'OFFER_REINSTATED';
    } else {
        return marketplaceHelpers.errorResult('invalid', { action: 'invalid' });
    }
    if (to !== from && !marketplaceHelpers.canMove(OFFER_FLOW, from, to)) return marketplaceHelpers.errorResult('not-allowed-now');
    Transaction.wrap(function () {
        if (action === 'approve' && c.proposedPriceCents) c.priceCents = c.proposedPriceCents;
        if (action === 'approve' || action === 'reject') {
            c.proposedPriceCents = null;
            c.reviewState = 'NONE';
            c.reviewFlags = [];
        }
        c.status = to;
        c.statusReason = text || null;
        c.priceDirty = true;
        c.updatedAt = new Date();
        c.revision = (c.revision || 0) + 1;
        marketplaceHelpers.logAudit({ entityType: 'OFFER', entityId: offerId, sellerId: c.sellerId, action: 'ADMIN_' + action.toUpperCase(), actor: by, from: from, to: to, reason: text });
        marketplaceHelpers.notify(c.sellerId, notice, { productId: c.productId });
    });
    return { error: false };
}

/**
 * Suspends every active or inactive offer that matches (counterfeit enforcement).
 * @param {string} query - offer query
 * @param {Array} args - arguments
 * @param {string} reason - reason
 * @param {Object} by - admin actor
 * @returns {number} offers suspended
 */
function suspendOffers(query, args, reason, by) {
    var targets = marketplaceHelpers.queryPage('MarketplaceOffer', query, null, args, 0, 1000).items.filter(function (o) { return ['ACTIVE', 'INACTIVE'].indexOf(o.custom.status) >= 0; });
    targets.forEach(function (o) { decideOffer(o.custom.offerId, 'suspend', reason, by); });
    return targets.length;
}

// ---------------------------------------------------------------- basket

/**
 * @param {dw.catalog.Product} product - product
 * @returns {boolean} true for a product created through a seller submission
 */
function isSellerProduct(product) {
    return !!(product && product.custom.mktOwnerSellerId);
}

/**
 * @param {string} reason - checkOfferBuyable reason
 * @param {number} available - units available
 * @returns {string} shopper message
 */
function getBasketMessage(reason, available) {
    if (reason === 'insufficient-stock') return Resource.msgf('error.offer.stock', 'seller', null, String(available));
    return Resource.msg('error.offer.' + (reason || 'offer-unavailable'), 'seller', null);
}

/**
 * @param {dw.order.Basket} basket - basket
 * @param {string} offerId - offer
 * @param {?string} skipUuid - line to leave out
 * @returns {number} quantity of the offer already in the basket
 */
function getQuantityInBasket(basket, offerId, skipUuid) {
    return basket.productLineItems.toArray().reduce(function (total, pli) {
        return pli.custom.mktOfferId === offerId && pli.UUID !== skipUuid ? total + pli.quantityValue : total;
    }, 0);
}

/**
 * Adds an offer line, or more units of the same offer. Called from the cartHelpers override
 * inside the Cart-AddProduct transaction. Seller-created products have no stock of their
 * own, so without an offer the featured offer is used.
 * @param {dw.order.Basket} basket - basket
 * @param {string} productId - product
 * @param {number} quantity - units to add
 * @param {?string} offerId - requested offer, or null
 * @param {Function} addLineItem - base cartHelpers.addLineItem
 * @param {dw.catalog.ProductOptionModel} optionModel - selected options
 * @returns {?Object} result in the base helper's shape, or null for a normal first-party line
 */
function addOfferToBasket(basket, productId, quantity, offerId, addLineItem, optionModel) {
    if (!marketplaceHelpers.isMarketplaceEnabled()) return null;
    var product = require('dw/catalog/ProductMgr').getProduct(productId);
    var chosen = offerId;
    if (!chosen) {
        if (!isSellerProduct(product)) return null;
        var ranked = getProductOffers(productId);
        chosen = ranked.length ? ranked[0].offerId : null;
        if (!chosen) return { error: true, message: getBasketMessage('offer-unavailable') };
    }
    var sameProduct = basket.productLineItems.toArray().filter(function (pli) { return pli.productID === productId && !pli.bonusProductLineItem; });
    if (sameProduct.some(function (pli) { return pli.custom.mktOfferId !== chosen; })) return { error: true, message: Resource.msg('error.offer.one-seller', 'seller', null) };
    var verdict = checkOfferBuyable(chosen, productId, quantity + getQuantityInBasket(basket, chosen, null));
    if (!verdict.ok) return { error: true, message: getBasketMessage(verdict.reason, verdict.available) };
    var pli = sameProduct[0];
    if (pli) pli.setQuantityValue(pli.quantityValue + quantity);
    else pli = addLineItem(basket, product, quantity, [], optionModel, basket.defaultShipment);
    pli.custom.mktOfferId = verdict.offer.custom.offerId;
    pli.custom.mktSellerId = verdict.seller.custom.sellerId;
    pli.custom.mktOfferValid = true;
    pli.setProductInventoryListID(verdict.seller.custom.inventoryListId);
    return { error: false, message: Resource.msg('text.alert.addedtobasket', 'product', null), uuid: pli.UUID };
}

/**
 * @param {dw.order.ProductLineItem} pli - offer line
 * @param {number} quantity - requested quantity
 * @returns {boolean} true when the seller can supply it
 */
function canChangeQuantity(pli, quantity) {
    return checkOfferBuyable(pli.custom.mktOfferId, pli.productID, quantity + getQuantityInBasket(pli.lineItemCtnr, pli.custom.mktOfferId, pli.UUID)).ok;
}

/**
 * Checkout check of all offer lines; seller-created products without an offer are refused.
 * @param {dw.order.Basket} basket - basket
 * @returns {{error: boolean, problems: Array<{uuid: string, reason: string}>}} result
 */
function validateOfferLines(basket) {
    var problems = [];
    var totals = {};
    var lines = basket.productLineItems.toArray();
    lines.forEach(function (pli) {
        if (pli.custom.mktOfferId) totals[pli.custom.mktOfferId] = (totals[pli.custom.mktOfferId] || 0) + pli.quantityValue;
    });
    lines.forEach(function (pli) {
        if (!pli.custom.mktOfferId) {
            if (marketplaceHelpers.isMarketplaceEnabled() && isSellerProduct(pli.product)) problems.push({ uuid: pli.UUID, reason: 'offer-unavailable' });
            return;
        }
        var verdict = checkOfferBuyable(pli.custom.mktOfferId, pli.productID, totals[pli.custom.mktOfferId]);
        if (!verdict.ok) {
            problems.push({ uuid: pli.UUID, reason: verdict.reason });
        } else if (pli.custom.mktSellerId !== verdict.offer.custom.sellerId || pli.productInventoryListID !== verdict.seller.custom.inventoryListId
            || pli.custom.mktOfferValid === false || pli.custom.mktUnitPriceCents !== verdict.offer.custom.priceCents) {
            // The price or the seller changed after the basket was last calculated.
            problems.push({ uuid: pli.UUID, reason: 'offer-changed' });
        }
    });
    return { error: problems.length > 0, problems: problems };
}

module.exports = {
    SKU: SKU,
    isValidGtin: isValidGtin,
    getTitleHash: getTitleHash,
    findDuplicates: findDuplicates,
    getReferencePrice: getReferencePrice,
    checkPrice: checkPrice,
    checkCategory: checkCategory,
    getAvailableQuantity: getAvailableQuantity,
    rankOffers: rankOffers,
    getOfferView: getOfferView,
    getProductOffers: getProductOffers,
    checkOfferBuyable: checkOfferBuyable,
    createOffer: createOffer,
    updateOffer: updateOffer,
    setOfferStock: setOfferStock,
    getSellerOffers: getSellerOffers,
    decideOffer: decideOffer,
    suspendOffers: suspendOffers,
    isSellerProduct: isSellerProduct,
    getBasketMessage: getBasketMessage,
    addOfferToBasket: addOfferToBasket,
    canChangeQuantity: canChangeQuantity,
    validateOfferLines: validateOfferLines
};
