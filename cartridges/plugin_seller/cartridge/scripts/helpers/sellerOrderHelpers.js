'use strict';

/**
 * Seller orders, commission and the earnings ledger.
 *
 * SFCC keeps one order and one payment. MarketplaceSellerOrder (key "<orderNo>:<sellerId>")
 * holds one seller's lines of it: fulfillment, cancellations, returns and refunds. Seller
 * orders are created by the order sync job from placed orders, never from a browser event.
 * Earnings are booked only for paid orders, as units ship, in MarketplaceLedgerEntry records
 * keyed by a fixed idempotency key, so a repeated shipment, refund or payout is never
 * booked twice. Ledger entries are signed cents (positive = owed to the seller) and are not
 * edited; corrections are new entries.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Site = require('dw/system/Site');
var Logger = require('dw/system/Logger');
var marketplaceHelpers = require('*/cartridge/scripts/helpers/marketplaceHelpers');
var sellerHelpers = require('*/cartridge/scripts/helpers/sellerHelpers');

var log = Logger.getLogger('plugin-seller', 'seller-finance');
var DAY = 86400000;
var CARRIERS = ['UPS', 'USPS', 'FEDEX', 'DHL', 'ONTRAC', 'LASERSHIP', 'OTHER'];
var EVENT_TYPES = ['SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED'];
var ORDER_FLOW = {
    PENDING_PAYMENT: ['AWAITING_FULFILLMENT', 'CANCELLED'],
    AWAITING_FULFILLMENT: ['PARTIALLY_SHIPPED', 'SHIPPED', 'CANCELLED'],
    PARTIALLY_SHIPPED: ['SHIPPED', 'CANCELLED'],
    SHIPPED: ['DELIVERED', 'CLOSED'],
    DELIVERED: ['CLOSED'],
    CANCELLED: [],
    CLOSED: []
};
// Sign of each ledger entry type: +1 owed to the seller, -1 owed by the seller, 0 either.
var ENTRY_SIGNS = { SALE: 1, SHIPPING: 1, COMMISSION: -1, ORDER_FEE: -1, REFUND: -1, COMMISSION_REVERSAL: 1, PAYOUT: -1, ADJUSTMENT: 0 };
var COMMISSION_SCOPES = ['SELLER', 'PROMOTION', 'CATEGORY', 'TIER', 'DEFAULT'];

// ---------------------------------------------------------------- commission

/**
 * @param {Date} at - point in time
 * @returns {Object[]} active commission rules valid at that time
 */
function getActiveRules(at) {
    return marketplaceHelpers.queryPage('MarketplaceCommissionRule', 'custom.active = {0}', 'custom.ruleId asc', [true], 0, 500).items.filter(function (r) {
        return (!r.custom.validFrom || r.custom.validFrom.getTime() <= at.getTime()) && (!r.custom.validTo || r.custom.validTo.getTime() > at.getTime());
    }).map(function (r) {
        var c = r.custom;
        return { ruleId: c.ruleId, scope: c.scope, scopeValue: c.scopeValue || null, rateBps: c.rateBps, fixedCents: c.fixedCents || 0, priority: c.priority || 0, refundReversal: c.refundReversal !== false };
    });
}

/**
 * The most specific scope wins (SELLER > PROMOTION > CATEGORY > TIER > DEFAULT), then the
 * higher priority, then the rule ID.
 * @param {Object[]} rules - active rules
 * @param {Object} line - {sellerId, tier, categoryIds, promotionIds}
 * @returns {?Object} the rule for the line
 */
function findRule(rules, line) {
    var matches = rules.filter(function (rule) {
        if (rule.scope === 'SELLER') return rule.scopeValue === line.sellerId;
        if (rule.scope === 'PROMOTION') return (line.promotionIds || []).indexOf(rule.scopeValue) >= 0;
        if (rule.scope === 'CATEGORY') return (line.categoryIds || []).indexOf(rule.scopeValue) >= 0;
        if (rule.scope === 'TIER') return rule.scopeValue === line.tier;
        return rule.scope === 'DEFAULT';
    });
    matches.sort(function (a, b) {
        var scope = COMMISSION_SCOPES.indexOf(a.scope) - COMMISSION_SCOPES.indexOf(b.scope);
        if (scope !== 0) return scope;
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.ruleId < b.ruleId ? -1 : 1;
    });
    return matches[0] || null;
}

/**
 * @param {Object} rule - rule
 * @param {number} netCents - line net amount
 * @param {number} quantity - units
 * @returns {number} commission: rate of the net amount (rounded half up) plus a fixed fee per unit, at most the net amount
 */
function getCommission(rule, netCents, quantity) {
    var product = netCents * rule.rateBps;
    var rated = Math.floor(product / 10000) + ((product % 10000) * 2 >= 10000 ? 1 : 0);
    return Math.max(0, Math.min(rated + rule.fixedCents * quantity, netCents));
}

/**
 * @param {string} productId - product
 * @returns {string[]} the product's categories and their parents (variants use the master)
 */
function getCategoryIds(productId) {
    var product = require('dw/catalog/ProductMgr').getProduct(productId);
    if (!product) return [];
    var owner = product.isVariant() ? product.masterProduct : product;
    var ids = [];
    owner.categories.toArray().forEach(function (category) {
        var current = category;
        while (current && ids.indexOf(current.ID) < 0) {
            ids.push(current.ID);
            current = current.root ? null : current.parent;
        }
    });
    return ids;
}

/**
 * Business Manager: creates a commission rule. Rules are never deleted, only deactivated.
 * @param {Object} data - {scope, scopeValue, rateBps, fixedFee (USD), priority, validFrom, validTo (YYYY-MM-DD), refundReversal, description}
 * @param {Object} by - admin actor
 * @returns {Object} result with ruleId
 */
function createRule(data, by) {
    var invalid = {};
    var scope = String(data.scope || '').toUpperCase();
    var scopeValue = marketplaceHelpers.cleanText(data.scopeValue);
    var rateBps = Number(data.rateBps);
    var fixedCents = data.fixedFee ? marketplaceHelpers.toCents(data.fixedFee) : 0;
    var priority = data.priority ? Number(data.priority) : 0;
    var date = function (text) {
        if (!text) return null;
        var d = new Date(String(text) + 'T00:00:00.000Z');
        return /^\d{4}-\d{2}-\d{2}$/.test(String(text)) && !Number.isNaN(d.getTime()) ? d : undefined;
    };
    var validFrom = date(data.validFrom);
    var validTo = date(data.validTo);
    if (COMMISSION_SCOPES.indexOf(scope) < 0) invalid.scope = 'invalid';
    if (scope !== 'DEFAULT' && !/^[A-Za-z0-9._-]{1,256}$/.test(scopeValue)) invalid.scopeValue = 'required';
    if (Math.floor(rateBps) !== rateBps || rateBps < 0 || rateBps > 5000) invalid.rateBps = 'out-of-range';
    if (fixedCents === null || fixedCents > 100000) invalid.fixedFee = 'invalid';
    if (Math.floor(priority) !== priority || priority < 0 || priority > 1000) invalid.priority = 'out-of-range';
    if (validFrom === undefined) invalid.validFrom = 'invalid';
    if (validTo === undefined || (validFrom && validTo && validTo.getTime() <= validFrom.getTime())) invalid.validTo = 'invalid';
    if (Object.keys(invalid).length) return marketplaceHelpers.errorResult('invalid', invalid);
    var rule;
    Transaction.wrap(function () {
        rule = CustomObjectMgr.createCustomObject('MarketplaceCommissionRule', marketplaceHelpers.createId('RULE'));
        var c = rule.custom;
        c.scope = scope;
        c.scopeValue = scope === 'DEFAULT' ? null : scopeValue;
        c.rateBps = rateBps;
        c.fixedCents = fixedCents;
        c.priority = priority;
        c.validFrom = validFrom;
        c.validTo = validTo;
        c.refundReversal = [false, 'false'].indexOf(data.refundReversal) < 0;
        c.description = marketplaceHelpers.cleanText(data.description).slice(0, 200) || null;
        c.active = true;
        c.createdAt = new Date();
        c.updatedAt = new Date();
        c.updatedBy = by.ref;
        c.revision = 0;
        marketplaceHelpers.logAudit({ entityType: 'COMMISSION_RULE', entityId: c.ruleId, action: 'CREATE', actor: by, detail: { scope: scope, rateBps: rateBps, fixedCents: fixedCents } });
    });
    return { error: false, ruleId: rule.custom.ruleId };
}

/**
 * @param {string} ruleId - rule
 * @param {Object} by - admin actor
 * @returns {Object} result
 */
function deactivateRule(ruleId, by) {
    var rule = CustomObjectMgr.getCustomObject('MarketplaceCommissionRule', String(ruleId));
    if (!rule) return marketplaceHelpers.errorResult('not-found');
    Transaction.wrap(function () {
        rule.custom.active = false;
        rule.custom.updatedAt = new Date();
        rule.custom.updatedBy = by.ref;
        marketplaceHelpers.logAudit({ entityType: 'COMMISSION_RULE', entityId: ruleId, action: 'DEACTIVATE', actor: by });
    });
    return { error: false };
}

// ---------------------------------------------------------------- ledger

/**
 * Books ledger entries inside the caller's transaction. An entry whose key exists with the
 * same amount is skipped; the same key with another amount fails the transaction.
 * @param {Object[]} entries - {key, sellerId, entryType, amountCents, orderNo, sellerOrderKey, lineId, ruleId, availableOn, settlementId, description, sourceRef}
 * @returns {number} entries created
 */
function postLedgerEntries(entries) {
    var created = 0;
    entries.forEach(function (e) {
        var sign = ENTRY_SIGNS[e.entryType];
        if (sign === undefined || Math.floor(e.amountCents) !== e.amountCents || (sign > 0 && e.amountCents < 0) || (sign < 0 && e.amountCents > 0)) throw new Error('Invalid ledger entry ' + e.entryType);
        if (e.amountCents === 0) return;
        var existing = CustomObjectMgr.getCustomObject('MarketplaceLedgerEntry', e.key);
        if (existing) {
            if (existing.custom.amountCents !== e.amountCents || existing.custom.sellerId !== e.sellerId) {
                log.error('Ledger key {0} replayed with a different amount', e.key);
                throw new Error('ledger-conflict');
            }
            return;
        }
        var entry = CustomObjectMgr.createCustomObject('MarketplaceLedgerEntry', e.key);
        var c = entry.custom;
        c.sellerId = e.sellerId;
        c.entryType = e.entryType;
        c.amountCents = e.amountCents;
        c.currency = 'USD';
        c.orderNo = e.orderNo || null;
        c.sellerOrderKey = e.sellerOrderKey || null;
        c.lineId = e.lineId || null;
        c.ruleId = e.ruleId || null;
        c.sourceRef = e.sourceRef || null;
        c.availableOn = e.availableOn || null;
        c.settlementId = e.settlementId || null;
        c.description = e.description ? String(e.description).slice(0, 200) : null;
        c.createdAt = new Date();
        created += 1;
    });
    return created;
}

/**
 * @param {dw.object.CustomObject} entry - ledger entry
 * @returns {Object} entry view
 */
function getEntryView(entry) {
    var c = entry.custom;
    return { entryId: c.entryId, entryType: c.entryType, amountCents: c.amountCents, orderNo: c.orderNo, lineId: c.lineId, availableOn: c.availableOn, settlementId: c.settlementId, description: c.description, createdAt: c.createdAt };
}

/**
 * @param {string} sellerId - seller
 * @returns {{pendingCents: number, availableCents: number, inSettlementCents: number, paidCents: number}} balances
 */
function getBalances(sellerId) {
    var now = Date.now();
    var result = { pendingCents: 0, availableCents: 0, inSettlementCents: 0, paidCents: 0 };
    marketplaceHelpers.queryPage('MarketplaceLedgerEntry', 'custom.sellerId = {0} AND custom.settlementId = NULL', null, [sellerId], 0, 10000).items.forEach(function (e) {
        if (e.custom.availableOn && e.custom.availableOn.getTime() <= now) result.availableCents += e.custom.amountCents;
        else result.pendingCents += e.custom.amountCents;
    });
    marketplaceHelpers.queryPage('MarketplaceSettlement', 'custom.sellerId = {0}', null, [sellerId], 0, 1000).items.forEach(function (s) {
        if (s.custom.status === 'PAID') result.paidCents += s.custom.netCents;
        else if (s.custom.status !== 'CANCELLED') result.inSettlementCents += s.custom.netCents;
    });
    return result;
}

/**
 * @param {string} sellerId - seller
 * @param {?string} entryType - filter
 * @param {number} offset - rows to skip
 * @param {number} limit - page size
 * @returns {{items: Object[], total: number}} ledger page
 */
function getLedgerEntries(sellerId, entryType, offset, limit) {
    var typed = entryType && ENTRY_SIGNS[entryType] !== undefined;
    var page = marketplaceHelpers.queryPage('MarketplaceLedgerEntry', 'custom.sellerId = {0}' + (typed ? ' AND custom.entryType = {1}' : ''), 'custom.createdAt desc', typed ? [sellerId, entryType] : [sellerId], offset, limit);
    return { items: page.items.map(getEntryView), total: page.total };
}

/**
 * Business Manager correction, available at once and included in the next settlement.
 * @param {string} sellerId - seller
 * @param {string} amount - signed USD amount, e.g. "-12.50"
 * @param {string} reason - reason
 * @param {Object} by - admin actor
 * @returns {Object} result
 */
function addAdjustment(sellerId, amount, reason, by) {
    if (!CustomObjectMgr.getCustomObject('MarketplaceSeller', String(sellerId))) return marketplaceHelpers.errorResult('not-found');
    var text = String(amount || '').trim();
    var negative = text.charAt(0) === '-';
    var cents = marketplaceHelpers.toCents(negative ? text.slice(1) : text);
    var note = marketplaceHelpers.cleanText(reason);
    if (!cents) return marketplaceHelpers.errorResult('invalid', { amount: 'invalid' });
    if (note.length < 5) return marketplaceHelpers.errorResult('invalid', { reason: 'required' });
    var key = 'ADJ:' + marketplaceHelpers.randomHex(12);
    Transaction.wrap(function () {
        postLedgerEntries([{ key: key, sellerId: sellerId, entryType: 'ADJUSTMENT', amountCents: negative ? -cents : cents, availableOn: new Date(), description: note, sourceRef: by.ref }]);
        marketplaceHelpers.logAudit({ entityType: 'LEDGER', entityId: key, sellerId: sellerId, action: 'ADJUST', actor: by, reason: note, detail: { amountCents: negative ? -cents : cents } });
    });
    return { error: false };
}

// ---------------------------------------------------------------- seller orders

/**
 * @param {dw.order.ProductLineItem} pli - order line
 * @param {Object[]} rules - active commission rules
 * @param {dw.object.CustomObject} seller - seller
 * @returns {Object} frozen line snapshot
 */
function getLineSnapshot(pli, rules, seller) {
    var netCents = marketplaceHelpers.centsOf(pli.proratedPrice);
    var promotionIds = pli.priceAdjustments.toArray().map(function (a) { return a.promotionID; }).filter(Boolean);
    var rule = findRule(rules, { sellerId: seller.custom.sellerId, tier: seller.custom.tier, categoryIds: getCategoryIds(pli.productID), promotionIds: promotionIds });
    var offer = CustomObjectMgr.getCustomObject('MarketplaceOffer', pli.custom.mktOfferId);
    return {
        lineId: pli.UUID,
        productId: pli.productID,
        productName: String(pli.productName || '').slice(0, 200),
        offerId: pli.custom.mktOfferId,
        quantity: pli.quantityValue,
        unitCents: marketplaceHelpers.centsOf(pli.basePrice),
        netCents: netCents,
        taxCents: marketplaceHelpers.centsOf(pli.adjustedTax),
        shippingCents: pli.shippingLineItem ? marketplaceHelpers.centsOf(pli.shippingLineItem.adjustedPrice) : 0,
        promotionIds: promotionIds,
        ruleId: rule ? rule.ruleId : null,
        commissionCents: rule ? getCommission(rule, netCents, pli.quantityValue) : null,
        refundReversal: rule ? rule.refundReversal : true,
        handlingDays: offer && typeof offer.custom.handlingDays === 'number' ? offer.custom.handlingDays : sellerHelpers.getSellerTerms(seller).handlingDays,
        returnDays: offer && typeof offer.custom.returnDays === 'number' ? offer.custom.returnDays : 0,
        shippedQty: 0,
        cancelledQty: 0,
        cancelRequestedQty: 0,
        returnedQty: 0,
        saleBookedCents: 0,
        commissionBookedCents: 0,
        shippingBookedCents: 0,
        refundedCents: 0,
        reversedCents: 0
    };
}

/**
 * @param {Object[]} lines - line snapshots
 * @param {string} field - amount field
 * @returns {number} sum
 */
function sumOf(lines, field) {
    return lines.reduce(function (total, l) { return total + (l[field] || 0); }, 0);
}

/**
 * Creates or advances the seller orders of one placed order. Safe to repeat.
 * @param {dw.order.Order} order - order (job context)
 * @param {Object[]} rules - active commission rules
 * @returns {{created: number, updated: number, missingRule: number}} counts
 */
function syncOrder(order, rules) {
    var Order = require('dw/order/Order');
    var counts = { created: 0, updated: 0, missingRule: 0 };
    var status = order.status.value;
    if (status === Order.ORDER_STATUS_CREATED) return counts;
    var cancelled = status === Order.ORDER_STATUS_FAILED || status === Order.ORDER_STATUS_CANCELLED;
    var paid = !cancelled && order.paymentStatus.value === Order.PAYMENT_STATUS_PAID;
    var groups = {};
    order.productLineItems.toArray().forEach(function (pli) {
        if (!pli.custom.mktOfferId || !pli.custom.mktSellerId || pli.bonusProductLineItem) return;
        if (!groups[pli.custom.mktSellerId]) groups[pli.custom.mktSellerId] = [];
        groups[pli.custom.mktSellerId].push(pli);
    });
    var system = marketplaceHelpers.actor('SYSTEM', 'order-sync');
    Object.keys(groups).forEach(function (sellerId) {
        var key = order.orderNo + ':' + sellerId;
        var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', sellerId);
        var record = CustomObjectMgr.getCustomObject('MarketplaceSellerOrder', key);
        Transaction.wrap(function () {
            if (!record) {
                if (cancelled || !seller) return;
                var lines = groups[sellerId].map(function (pli) { return getLineSnapshot(pli, rules, seller); });
                var a = groups[sellerId][0].shipment ? groups[sellerId][0].shipment.shippingAddress : null;
                record = CustomObjectMgr.createCustomObject('MarketplaceSellerOrder', key);
                var r = record.custom;
                r.orderNo = order.orderNo;
                r.sellerId = sellerId;
                r.customerNo = order.customerNo || null;
                r.status = 'PENDING_PAYMENT';
                r.lines = JSON.stringify(lines);
                r.shipments = '[]';
                r.events = '[]';
                r.shipTo = a ? JSON.stringify({ fullName: a.fullName, address1: a.address1, address2: a.address2 || null, city: a.city, stateCode: a.stateCode, postalCode: a.postalCode, countryCode: a.countryCode ? a.countryCode.value : null, phone: a.phone || null }) : null;
                r.merchandiseCents = sumOf(lines, 'netCents');
                r.shippingCents = sumOf(lines, 'shippingCents');
                r.taxCents = sumOf(lines, 'taxCents');
                r.commissionCents = sumOf(lines, 'commissionCents');
                r.orderFeeCents = Site.getCurrent().getCustomPreferenceValue('sellerOrderFeeCents') || 0;
                r.currency = 'USD';
                r.orderCreatedAt = order.creationDate;
                r.revision = 0;
                counts.created += 1;
                lines.forEach(function (line) {
                    if (line.ruleId) return;
                    counts.missingRule += 1;
                    require('*/cartridge/scripts/helpers/caseHelpers').openCase({ caseType: 'COMMISSION_RULE_MISSING', sellerId: sellerId, entityId: key, orderNo: order.orderNo, severity: 'HIGH', detail: { lineId: line.lineId }, dedupeKey: 'rule:' + key });
                });
            }
            var c = record.custom;
            var current = c.status;
            if (paid && current === 'PENDING_PAYMENT') {
                var paidAt = new Date();
                var handling = Math.max.apply(null, marketplaceHelpers.parseJson(c.lines, []).map(function (l) { return l.handlingDays || 0; }));
                c.status = 'AWAITING_FULFILLMENT';
                c.paidAt = paidAt;
                c.promisedShipBy = new Date(paidAt.getTime() + handling * DAY);
                marketplaceHelpers.logAudit({ entityType: 'SELLER_ORDER', entityId: key, sellerId: sellerId, action: 'PAID', actor: system, from: current, to: 'AWAITING_FULFILLMENT' });
                marketplaceHelpers.notify(sellerId, 'NEW_ORDER', { orderNo: order.orderNo });
                counts.updated += 1;
            } else if (cancelled && ['PENDING_PAYMENT', 'AWAITING_FULFILLMENT'].indexOf(current) >= 0) {
                c.lines = JSON.stringify(marketplaceHelpers.parseJson(c.lines, []).map(function (l) {
                    l.cancelledQty = l.quantity - l.shippedQty;
                    return l;
                }));
                c.status = 'CANCELLED';
                marketplaceHelpers.logAudit({ entityType: 'SELLER_ORDER', entityId: key, sellerId: sellerId, action: 'ORDER_CANCELLED', actor: system, from: current, to: 'CANCELLED' });
                marketplaceHelpers.notify(sellerId, 'ORDER_CANCELLED', { orderNo: order.orderNo });
                counts.updated += 1;
            }
        });
    });
    return counts;
}

/**
 * Books the earnings due for the units shipped so far, inside the caller's transaction. The
 * keys include the shipped quantity, so repeated or parallel runs book each amount once.
 * @param {dw.object.CustomObject} record - paid seller order
 * @param {Object[]} lines - line snapshots (booked amounts are updated in place)
 * @returns {number} entries created
 */
function bookEarnings(record, lines) {
    var key = record.custom.sellerOrderId;
    var base = { sellerId: record.custom.sellerId, orderNo: record.custom.orderNo, sellerOrderKey: key, availableOn: new Date(Date.now() + Site.getCurrent().getCustomPreferenceValue('sellerSettlementHoldDays') * DAY) };
    var entries = [];
    lines.forEach(function (l) {
        if (!l.shippedQty || l.commissionCents === null || l.commissionCents === undefined) return;
        var saleDue = Math.round((l.netCents * l.shippedQty) / l.quantity) - l.saleBookedCents;
        var commissionDue = Math.round((l.commissionCents * l.shippedQty) / l.quantity) - l.commissionBookedCents;
        var lineBase = Object.assign({ lineId: l.lineId, ruleId: l.ruleId }, base);
        if (saleDue > 0) entries.push(Object.assign({ key: key + ':' + l.lineId + ':SALE:' + l.shippedQty, entryType: 'SALE', amountCents: saleDue }, lineBase));
        if (commissionDue > 0) entries.push(Object.assign({ key: key + ':' + l.lineId + ':COMMISSION:' + l.shippedQty, entryType: 'COMMISSION', amountCents: -commissionDue }, lineBase));
        if (l.shippedQty === l.quantity && l.shippingCents > l.shippingBookedCents) {
            entries.push(Object.assign({ key: key + ':' + l.lineId + ':SHIPPING', entryType: 'SHIPPING', amountCents: l.shippingCents - l.shippingBookedCents }, lineBase));
            l.shippingBookedCents = l.shippingCents;
        }
        if (saleDue > 0) l.saleBookedCents += saleDue;
        if (commissionDue > 0) l.commissionBookedCents += commissionDue;
    });
    if (record.custom.orderFeeCents > 0 && lines.some(function (l) { return l.shippedQty > 0; })) {
        entries.push(Object.assign({ key: key + ':ORDER_FEE', entryType: 'ORDER_FEE', amountCents: -record.custom.orderFeeCents }, base));
    }
    return postLedgerEntries(entries);
}

/**
 * @param {Object[]} lines - line snapshots
 * @param {string} current - current status
 * @returns {string} status implied by the line quantities
 */
function getFulfillmentStatus(lines, current) {
    var open = lines.some(function (l) { return l.quantity - l.shippedQty - l.cancelledQty > 0; });
    var shipped = lines.some(function (l) { return l.shippedQty > 0; });
    if (!open && !shipped) return 'CANCELLED';
    if (!open) return current === 'DELIVERED' ? 'DELIVERED' : 'SHIPPED';
    return shipped ? 'PARTIALLY_SHIPPED' : current;
}

/**
 * @param {Object[]} lines - line snapshots
 * @returns {Date} when the order may close: return window plus settlement hold
 */
function getCloseDate(lines) {
    var days = Math.max.apply(null, [0].concat(lines.map(function (l) { return l.returnDays || 0; }))) + Site.getCurrent().getCustomPreferenceValue('sellerSettlementHoldDays');
    return new Date(Date.now() + days * DAY);
}

/**
 * @param {dw.object.CustomObject} record - seller order
 * @param {boolean} [withAddress] - include the ship-to address (seller detail only)
 * @returns {Object} seller order view
 */
function getSellerOrderView(record, withAddress) {
    var c = record.custom;
    var view = {
        orderNo: c.orderNo,
        sellerId: c.sellerId,
        status: c.status,
        lines: marketplaceHelpers.parseJson(c.lines, []).map(function (l) {
            return { lineId: l.lineId, productId: l.productId, productName: l.productName, quantity: l.quantity, unitCents: l.unitCents, netCents: l.netCents, shippingCents: l.shippingCents, shippedQty: l.shippedQty, cancelledQty: l.cancelledQty, cancelRequestedQty: l.cancelRequestedQty, returnedQty: l.returnedQty, refundedCents: l.refundedCents, commissionCents: l.commissionCents };
        }),
        shipments: marketplaceHelpers.parseJson(c.shipments, []),
        merchandiseCents: c.merchandiseCents,
        shippingCents: c.shippingCents,
        taxCents: c.taxCents,
        commissionCents: c.commissionCents,
        orderCreatedAt: c.orderCreatedAt,
        paidAt: c.paidAt || null,
        promisedShipBy: c.promisedShipBy || null,
        shippedAt: c.shippedAt || null,
        deliveredAt: c.deliveredAt || null,
        rating: c.rating || null
    };
    if (withAddress) view.shipTo = marketplaceHelpers.parseJson(c.shipTo, null);
    return view;
}

/**
 * Sets the platform order to shipped once all its seller orders shipped and it has no
 * first-party lines (when sellerUpdateOrderShippingStatus is on).
 * @param {string} orderNo - order
 */
function markOrderShipped(orderNo) {
    var Order = require('dw/order/Order');
    var order;
    try {
        order = require('dw/order/OrderMgr').getOrder(orderNo);
    } catch (e) {
        return;
    }
    if (!order || order.shippingStatus.value === Order.SHIPPING_STATUS_SHIPPED) return;
    if (order.productLineItems.toArray().some(function (pli) { return !pli.custom.mktOfferId; })) return;
    var open = marketplaceHelpers.queryPage('MarketplaceSellerOrder', 'custom.orderNo = {0}', null, [orderNo], 0, 50).items.some(function (so) {
        return ['SHIPPED', 'DELIVERED', 'CLOSED', 'CANCELLED'].indexOf(so.custom.status) < 0;
    });
    if (!open) Transaction.wrap(function () { order.setShippingStatus(Order.SHIPPING_STATUS_SHIPPED); });
}

/**
 * Applies a shipment (seller portal, API or OMS event). The shipment ID makes it idempotent.
 * @param {dw.object.CustomObject} record - seller order
 * @param {Object} data - {carrier, trackingNumber, lines: [{lineId, quantity}]}
 * @param {string} shipmentId - stable shipment ID
 * @param {Object} by - who shipped
 * @returns {Object} result with sellerOrderView
 */
function applyShipment(record, data, shipmentId, by) {
    var c = record.custom;
    var carrier = String(data.carrier || '').toUpperCase();
    var tracking = marketplaceHelpers.cleanText(data.trackingNumber);
    var requested = Array.isArray(data.lines) ? data.lines : [];
    var invalid = {};
    if (CARRIERS.indexOf(carrier) < 0) invalid.carrier = 'invalid';
    if (!/^[A-Za-z0-9 -]{4,40}$/.test(tracking)) invalid.trackingNumber = 'invalid';
    if (!requested.length || requested.length > 100) invalid.lines = 'required';
    if (Object.keys(invalid).length) return marketplaceHelpers.errorResult('invalid', invalid);
    var shipments = marketplaceHelpers.parseJson(c.shipments, []);
    if (shipments.some(function (s) { return s.shipmentId === shipmentId; })) return { error: false, sellerOrderView: getSellerOrderView(record) };
    var from = c.status;
    if (['AWAITING_FULFILLMENT', 'PARTIALLY_SHIPPED'].indexOf(from) < 0) return marketplaceHelpers.errorResult('not-allowed-now');
    var lines = marketplaceHelpers.parseJson(c.lines, []);
    var shippedLines = [];
    for (var i = 0; i < requested.length; i++) {
        var line = lines.filter(function (l) { return l.lineId === String(requested[i].lineId); })[0]; // eslint-disable-line no-loop-func
        var quantity = Number(requested[i].quantity);
        if (!line || !(quantity > 0) || Math.floor(quantity) !== quantity || quantity > line.quantity - line.shippedQty - line.cancelledQty) return marketplaceHelpers.errorResult('invalid', { lines: 'quantity' });
        line.shippedQty += quantity;
        shippedLines.push({ lineId: line.lineId, quantity: quantity });
    }
    var to = getFulfillmentStatus(lines, from);
    if (to !== from && !marketplaceHelpers.canMove(ORDER_FLOW, from, to)) return marketplaceHelpers.errorResult('not-allowed-now');
    var now = new Date();
    shipments.push({ shipmentId: shipmentId, carrier: carrier, trackingNumber: tracking, lines: shippedLines, shippedAt: now.toISOString(), by: by.type });
    Transaction.wrap(function () {
        bookEarnings(record, lines);
        c.status = to;
        c.lines = JSON.stringify(lines);
        c.shipments = JSON.stringify(shipments);
        if (to === 'SHIPPED') {
            c.shippedAt = now;
            c.closeAfter = getCloseDate(lines);
        }
        c.revision = (c.revision || 0) + 1;
        marketplaceHelpers.logAudit({ entityType: 'SELLER_ORDER', entityId: c.sellerOrderId, sellerId: c.sellerId, action: 'SHIP', actor: by, from: from, to: to, detail: { shipmentId: shipmentId, carrier: carrier } });
    });
    if (to === 'SHIPPED' && Site.getCurrent().getCustomPreferenceValue('sellerUpdateOrderShippingStatus') === true) markOrderShipped(c.orderNo);
    return { error: false, sellerOrderView: getSellerOrderView(record) };
}

/**
 * @param {Object} context - seller context
 * @param {string} orderNo - order
 * @returns {?dw.object.CustomObject} the seller's own seller order
 */
function getOwnSellerOrder(context, orderNo) {
    return CustomObjectMgr.getCustomObject('MarketplaceSellerOrder', String(orderNo) + ':' + context.sellerId);
}

/**
 * @param {Object} context - seller context (orders.write)
 * @param {string} orderNo - order
 * @param {Object} data - {carrier, trackingNumber, lines}
 * @param {?string} shipmentKey - client key (8-64 safe characters); a random ID is used without one
 * @returns {Object} result with sellerOrderView
 */
function shipOrder(context, orderNo, data, shipmentKey) {
    var record = getOwnSellerOrder(context, orderNo);
    if (!record) return marketplaceHelpers.errorResult('not-found');
    var key = /^[A-Za-z0-9_-]{8,64}$/.test(String(shipmentKey || '')) ? String(shipmentKey) : null;
    var shipmentId = key ? 'SHP-' + marketplaceHelpers.sha256(context.sellerId + ':' + key).slice(0, 24).toUpperCase() : marketplaceHelpers.createId('SHP');
    return applyShipment(record, data, shipmentId, context.actor);
}

/**
 * Seller asks to cancel units it cannot ship; the marketplace or OMS confirms with a
 * CANCELLED event (which also triggers the shopper refund outside this plugin).
 * @param {Object} context - seller context (orders.write)
 * @param {string} orderNo - order
 * @param {Object} data - {lineId, quantity, reason}
 * @returns {Object} result with sellerOrderView
 */
function requestCancellation(context, orderNo, data) {
    var record = getOwnSellerOrder(context, orderNo);
    if (!record) return marketplaceHelpers.errorResult('not-found');
    var c = record.custom;
    var quantity = Number(data.quantity);
    var reason = String(data.reason || '');
    if (['OUT_OF_STOCK', 'PRICING_ERROR', 'CANNOT_SHIP_TO_ADDRESS', 'OTHER'].indexOf(reason) < 0) return marketplaceHelpers.errorResult('invalid', { reason: 'invalid' });
    if (['AWAITING_FULFILLMENT', 'PARTIALLY_SHIPPED'].indexOf(c.status) < 0) return marketplaceHelpers.errorResult('not-allowed-now');
    var lines = marketplaceHelpers.parseJson(c.lines, []);
    var line = lines.filter(function (l) { return l.lineId === String(data.lineId); })[0];
    if (!line) return marketplaceHelpers.errorResult('not-found');
    if (!(quantity > 0) || Math.floor(quantity) !== quantity || quantity > line.quantity - line.shippedQty - line.cancelledQty - line.cancelRequestedQty) return marketplaceHelpers.errorResult('invalid', { quantity: 'out-of-range' });
    line.cancelRequestedQty += quantity;
    Transaction.wrap(function () {
        c.lines = JSON.stringify(lines);
        require('*/cartridge/scripts/helpers/caseHelpers').openCase({ caseType: 'SELLER_CANCELLATION', sellerId: context.sellerId, entityId: c.sellerOrderId, orderNo: c.orderNo, severity: 'MEDIUM', detail: { lineId: line.lineId, quantity: quantity, reason: reason } });
        marketplaceHelpers.logAudit({ entityType: 'SELLER_ORDER', entityId: c.sellerOrderId, sellerId: context.sellerId, action: 'CANCEL_REQUEST', actor: context.actor, detail: { lineId: line.lineId, quantity: quantity, reason: reason } });
        marketplaceHelpers.notify(marketplaceHelpers.ADMIN, 'ADMIN_CANCEL_REQUEST', { orderNo: c.orderNo, sellerId: context.sellerId });
    });
    return { error: false, sellerOrderView: getSellerOrderView(record) };
}

/**
 * Fulfillment, return and refund events from Business Manager or the OMS (admin API).
 * Each event ID is applied once.
 * @param {string} orderNo - order
 * @param {string} sellerId - seller
 * @param {Object} event - {eventId, type, lines: [{lineId, quantity | amountCents}], carrier, trackingNumber}
 * @param {Object} by - admin or integration actor
 * @returns {Object} result with sellerOrderView
 */
function applyOrderEvent(orderNo, sellerId, event, by) {
    var record = CustomObjectMgr.getCustomObject('MarketplaceSellerOrder', String(orderNo) + ':' + String(sellerId));
    if (!record) return marketplaceHelpers.errorResult('not-found');
    var c = record.custom;
    var eventId = String((event && event.eventId) || '');
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(eventId)) return marketplaceHelpers.errorResult('invalid', { eventId: 'invalid' });
    if (EVENT_TYPES.indexOf(event.type) < 0) return marketplaceHelpers.errorResult('invalid', { type: 'invalid' });
    var seen = marketplaceHelpers.parseJson(c.events, []);
    if (seen.indexOf(eventId) >= 0) return { error: false, sellerOrderView: getSellerOrderView(record) };
    var remember = function () {
        seen.push(eventId);
        c.events = JSON.stringify(seen.slice(-200));
    };
    if (event.type === 'SHIPPED') {
        var shipped = applyShipment(record, event, 'EVT-' + eventId, by);
        if (!shipped.error) Transaction.wrap(remember);
        return shipped;
    }
    var lines = marketplaceHelpers.parseJson(c.lines, []);
    var requested = Array.isArray(event.lines) ? event.lines : [];
    var from = c.status;
    var to = from;
    var entries = [];
    var now = new Date();
    var findLine = function (item) { return lines.filter(function (l) { return l.lineId === String(item.lineId); })[0]; };
    if (event.type === 'DELIVERED') {
        if (from !== 'SHIPPED') return marketplaceHelpers.errorResult('not-allowed-now');
        to = 'DELIVERED';
    } else {
        if (!requested.length && event.type !== 'RETURNED') return marketplaceHelpers.errorResult('invalid', { lines: 'required' });
        for (var i = 0; i < requested.length; i++) {
            var line = findLine(requested[i]);
            if (!line) return marketplaceHelpers.errorResult('invalid', { lines: 'unknown-line' });
            var quantity = Number(requested[i].quantity);
            if (event.type === 'CANCELLED') {
                if (!(quantity > 0) || quantity > line.quantity - line.shippedQty - line.cancelledQty) return marketplaceHelpers.errorResult('invalid', { lines: 'quantity' });
                line.cancelledQty += quantity;
                line.cancelRequestedQty = Math.max(0, line.cancelRequestedQty - quantity);
            } else if (event.type === 'RETURNED') {
                if (!(quantity > 0) || quantity > line.shippedQty - line.returnedQty) return marketplaceHelpers.errorResult('invalid', { lines: 'quantity' });
                line.returnedQty += quantity;
            } else {
                var amount = Number(requested[i].amountCents);
                var refundable = line.saleBookedCents + line.shippingBookedCents - line.refundedCents;
                if (Math.floor(amount) !== amount || amount <= 0 || amount > refundable) return marketplaceHelpers.errorResult('invalid', { lines: 'amount' });
                var reversal = line.refundReversal && line.saleBookedCents > 0
                    ? Math.min(line.commissionBookedCents - line.reversedCents, Math.round((line.commissionBookedCents * Math.min(amount, line.saleBookedCents)) / line.saleBookedCents))
                    : 0;
                var entryBase = { sellerId: c.sellerId, orderNo: c.orderNo, sellerOrderKey: c.sellerOrderId, lineId: line.lineId, availableOn: now, sourceRef: eventId };
                entries.push(Object.assign({ key: c.sellerOrderId + ':' + eventId + ':' + line.lineId + ':REFUND', entryType: 'REFUND', amountCents: -amount }, entryBase));
                if (reversal > 0) entries.push(Object.assign({ key: c.sellerOrderId + ':' + eventId + ':' + line.lineId + ':REVERSAL', entryType: 'COMMISSION_REVERSAL', amountCents: reversal }, entryBase));
                line.refundedCents += amount;
                line.reversedCents += reversal;
            }
        }
        if (event.type === 'CANCELLED') to = getFulfillmentStatus(lines, from);
    }
    if (to !== from && !marketplaceHelpers.canMove(ORDER_FLOW, from, to)) return marketplaceHelpers.errorResult('not-allowed-now');
    Transaction.wrap(function () {
        postLedgerEntries(entries);
        c.status = to;
        c.lines = JSON.stringify(lines);
        if (to === 'DELIVERED') {
            c.deliveredAt = now;
            c.closeAfter = getCloseDate(lines);
        }
        c.revision = (c.revision || 0) + 1;
        remember();
        marketplaceHelpers.logAudit({ entityType: 'SELLER_ORDER', entityId: c.sellerOrderId, sellerId: c.sellerId, action: 'EVENT_' + event.type, actor: by, from: from, to: to, detail: { eventId: eventId } });
        if (event.type === 'REFUNDED') marketplaceHelpers.notify(c.sellerId, 'REFUND_RECORDED', { orderNo: c.orderNo });
        if (event.type === 'CANCELLED') marketplaceHelpers.notify(c.sellerId, 'ORDER_CANCELLED', { orderNo: c.orderNo });
    });
    log.info('Seller order {0} event {1} applied', c.sellerOrderId, event.type);
    return { error: false, sellerOrderView: getSellerOrderView(record) };
}

/**
 * A buyer rates the seller once per shipped seller order.
 * @param {dw.customer.Customer} customer - current customer
 * @param {string} orderNo - order
 * @param {string} sellerId - seller
 * @param {*} rating - 1 to 5
 * @returns {Object} result
 */
function rateSeller(customer, orderNo, sellerId, rating) {
    if (!customer || !customer.authenticated || !customer.registered) return marketplaceHelpers.errorResult('unauthenticated');
    var value = Number(rating);
    if ([1, 2, 3, 4, 5].indexOf(value) < 0) return marketplaceHelpers.errorResult('invalid', { rating: 'invalid' });
    var record = CustomObjectMgr.getCustomObject('MarketplaceSellerOrder', String(orderNo) + ':' + String(sellerId));
    if (!record || record.custom.customerNo !== customer.profile.customerNo) return marketplaceHelpers.errorResult('not-found');
    if (['SHIPPED', 'DELIVERED', 'CLOSED'].indexOf(record.custom.status) < 0) return marketplaceHelpers.errorResult('not-allowed-now');
    if (record.custom.rating) return marketplaceHelpers.errorResult('conflict');
    Transaction.wrap(function () {
        record.custom.rating = value;
        record.custom.ratedAt = new Date();
        var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', record.custom.sellerId);
        if (seller) {
            seller.custom.ratingSum = (seller.custom.ratingSum || 0) + value;
            seller.custom.ratingCount = (seller.custom.ratingCount || 0) + 1;
        }
        marketplaceHelpers.logAudit({ entityType: 'SELLER_ORDER', entityId: record.custom.sellerOrderId, sellerId: record.custom.sellerId, action: 'RATED', actor: marketplaceHelpers.actor('SHOPPER', customer.profile.customerNo), detail: { rating: value } });
    });
    return { error: false };
}

/**
 * @param {Object} context - seller context (orders.read)
 * @param {?string} status - filter
 * @param {number} offset - rows to skip
 * @param {number} limit - page size
 * @returns {{items: Object[], total: number}} the seller's paid orders
 */
function getSellerOrders(context, status, offset, limit) {
    var args = status ? [context.sellerId, 'PENDING_PAYMENT', status] : [context.sellerId, 'PENDING_PAYMENT'];
    var page = marketplaceHelpers.queryPage('MarketplaceSellerOrder', 'custom.sellerId = {0} AND custom.status != {1}' + (status ? ' AND custom.status = {2}' : ''), 'custom.orderCreatedAt desc', args, offset, limit);
    return { items: page.items.map(function (r) { return getSellerOrderView(r, false); }), total: page.total };
}

/**
 * @param {Object} context - seller context (orders.read)
 * @param {string} orderNo - order
 * @returns {?Object} detail, with the ship-to address while it still needs shipping; null for unpaid or foreign orders
 */
function getSellerOrderDetail(context, orderNo) {
    var record = getOwnSellerOrder(context, orderNo);
    if (!record || record.custom.status === 'PENDING_PAYMENT') return null;
    return getSellerOrderView(record, ['AWAITING_FULFILLMENT', 'PARTIALLY_SHIPPED'].indexOf(record.custom.status) >= 0);
}

/**
 * @param {dw.customer.Customer} customer - signed-in customer
 * @param {number} offset - rows to skip
 * @param {number} limit - page size
 * @returns {{items: Object[], total: number}} the shopper's marketplace purchases (no commission)
 */
function getCustomerPurchases(customer, offset, limit) {
    var page = marketplaceHelpers.queryPage('MarketplaceSellerOrder', 'custom.customerNo = {0} AND custom.status != {1}', 'custom.orderCreatedAt desc', [customer.profile.customerNo, 'PENDING_PAYMENT'], offset, limit);
    return {
        items: page.items.map(function (r) {
            var view = getSellerOrderView(r, false);
            var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', r.custom.sellerId);
            view.sellerName = seller ? seller.custom.displayName : r.custom.sellerId;
            delete view.commissionCents;
            view.lines.forEach(function (l) { delete l.commissionCents; });
            return view;
        }),
        total: page.total
    };
}

/**
 * Job helper: closes seller orders past their return window and drops the ship-to address.
 * @param {number} limit - maximum records
 * @returns {number} closed
 */
function closeFinishedOrders(limit) {
    var due = marketplaceHelpers.queryPage('MarketplaceSellerOrder', '(custom.status = {0} OR custom.status = {1}) AND custom.closeAfter <= {2}', 'custom.closeAfter asc', ['SHIPPED', 'DELIVERED', new Date()], 0, limit).items;
    due.forEach(function (r) {
        Transaction.wrap(function () {
            var from = r.custom.status;
            r.custom.status = 'CLOSED';
            r.custom.closedAt = new Date();
            r.custom.shipTo = null;
            marketplaceHelpers.logAudit({ entityType: 'SELLER_ORDER', entityId: r.custom.sellerOrderId, sellerId: r.custom.sellerId, action: 'CLOSE', actor: marketplaceHelpers.actor('SYSTEM', 'order-sync'), from: from, to: 'CLOSED' });
        });
    });
    return due.length;
}

/**
 * Job helper: books earnings that could not be booked before (a commission rule was added later).
 * @param {number} limit - maximum records
 * @returns {number} entries created
 */
function bookMissedEarnings(limit) {
    var created = 0;
    var rules = getActiveRules(new Date());
    marketplaceHelpers.queryPage('MarketplaceSellerOrder', 'custom.status = {0} OR custom.status = {1} OR custom.status = {2}', null, ['PARTIALLY_SHIPPED', 'SHIPPED', 'DELIVERED'], 0, limit).items.forEach(function (r) {
        var lines = marketplaceHelpers.parseJson(r.custom.lines, []);
        var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', r.custom.sellerId);
        var changed = false;
        lines.forEach(function (l) {
            if (l.ruleId || !seller) return;
            var rule = findRule(rules, { sellerId: seller.custom.sellerId, tier: seller.custom.tier, categoryIds: getCategoryIds(l.productId), promotionIds: l.promotionIds });
            if (!rule) return;
            l.ruleId = rule.ruleId;
            l.commissionCents = getCommission(rule, l.netCents, l.quantity);
            l.refundReversal = rule.refundReversal;
            changed = true;
        });
        var due = lines.some(function (l) { return l.ruleId && Math.round((l.netCents * l.shippedQty) / l.quantity) > l.saleBookedCents; });
        if (!changed && !due) return;
        Transaction.wrap(function () {
            created += bookEarnings(r, lines);
            r.custom.lines = JSON.stringify(lines);
            r.custom.commissionCents = sumOf(lines, 'commissionCents');
        });
    });
    return created;
}

// ---------------------------------------------------------------- performance

/**
 * @param {Object[]} orders - {status, lines, promisedShipBy, shippedAt, rating}
 * @param {number} complaints - shopper cases in the window
 * @param {number} now - current time in ms
 * @returns {Object} rates in basis points, and counts
 */
function getPerformanceMetrics(orders, complaints, now) {
    var counted = orders.filter(function (o) { return o.status !== 'PENDING_PAYMENT'; });
    var total = counted.length;
    var defects = 0;
    var late = 0;
    var cancelled = 0;
    counted.forEach(function (o) {
        if (o.lines.some(function (l) { return l.refundedCents > 0 || l.returnedQty > 0; })) defects += 1;
        var promised = o.promisedShipBy ? o.promisedShipBy.getTime() : null;
        if (promised && ((o.shippedAt && o.shippedAt.getTime() > promised) || (!o.shippedAt && o.status !== 'CANCELLED' && now > promised))) late += 1;
        if (o.lines.some(function (l) { return l.cancelRequestedQty > 0 || (l.cancelledQty > 0 && o.status !== 'CANCELLED'); })) cancelled += 1;
    });
    var rate = function (count) { return total ? Math.round((count * 10000) / total) : 0; };
    return { orders: total, defectRateBps: rate(Math.min(total, defects + complaints)), lateShipmentRateBps: rate(late), cancellationRateBps: rate(cancelled) };
}

/**
 * Recomputes one seller's performance and rating from its seller orders; a breach opens a
 * case, and suspends the seller when sellerAutoSuspendOnBreach is on.
 * @param {dw.object.CustomObject} seller - approved seller
 * @returns {{metrics: Object, breaches: string[]}} outcome
 */
function evaluatePerformance(seller) {
    var site = Site.getCurrent();
    var now = Date.now();
    var sellerId = seller.custom.sellerId;
    var since = new Date(now - site.getCustomPreferenceValue('sellerPerformanceWindowDays') * DAY);
    var orders = marketplaceHelpers.queryPage('MarketplaceSellerOrder', 'custom.sellerId = {0} AND custom.orderCreatedAt >= {1}', null, [sellerId, since], 0, 5000).items.map(function (r) {
        return { status: r.custom.status, lines: marketplaceHelpers.parseJson(r.custom.lines, []), promisedShipBy: r.custom.promisedShipBy, shippedAt: r.custom.shippedAt };
    });
    var complaints = marketplaceHelpers.queryCount('MarketplaceCase', 'custom.sellerId = {0} AND custom.createdAt >= {1} AND (custom.caseType = {2} OR custom.caseType = {3}) AND custom.status != {4}', [sellerId, since, 'COUNTERFEIT_REPORT', 'CUSTOMER_ISSUE', 'DISMISSED']);
    var metrics = getPerformanceMetrics(orders, complaints, now);
    var breaches = [];
    if (metrics.orders >= site.getCustomPreferenceValue('sellerPerformanceMinOrders')) {
        if (metrics.defectRateBps > site.getCustomPreferenceValue('sellerMaxDefectRateBps')) breaches.push('defect-rate');
        if (metrics.lateShipmentRateBps > site.getCustomPreferenceValue('sellerMaxLateShipmentRateBps')) breaches.push('late-shipment-rate');
        if (metrics.cancellationRateBps > site.getCustomPreferenceValue('sellerMaxCancellationRateBps')) breaches.push('cancellation-rate');
    }
    var ratings = marketplaceHelpers.queryPage('MarketplaceSellerOrder', 'custom.sellerId = {0} AND custom.rating != NULL', null, [sellerId], 0, 5000).items;
    Transaction.wrap(function () {
        seller.custom.metrics = JSON.stringify({ orders: metrics.orders, defectRateBps: metrics.defectRateBps, lateShipmentRateBps: metrics.lateShipmentRateBps, cancellationRateBps: metrics.cancellationRateBps, evaluatedAt: new Date(now).toISOString() });
        // Recounting from the orders corrects any lost concurrent rating update.
        seller.custom.ratingSum = ratings.reduce(function (sum, r) { return sum + r.custom.rating; }, 0);
        seller.custom.ratingCount = ratings.length;
        if (!breaches.length) return;
        require('*/cartridge/scripts/helpers/caseHelpers').openCase({ caseType: 'PERFORMANCE_BREACH', sellerId: sellerId, entityId: sellerId, severity: 'HIGH', detail: { breaches: breaches.join(','), orders: metrics.orders }, dedupeKey: 'performance:' + sellerId });
        marketplaceHelpers.notify(sellerId, 'PERFORMANCE_WARNING', { breaches: breaches.join(', ') });
        if (site.getCustomPreferenceValue('sellerAutoSuspendOnBreach') === true) sellerHelpers.suspendSeller(seller, 'performance', marketplaceHelpers.actor('SYSTEM', 'performance'));
    });
    return { metrics: metrics, breaches: breaches };
}

module.exports = {
    CARRIERS: CARRIERS,
    EVENT_TYPES: EVENT_TYPES,
    COMMISSION_SCOPES: COMMISSION_SCOPES,
    getActiveRules: getActiveRules,
    findRule: findRule,
    getCommission: getCommission,
    createRule: createRule,
    deactivateRule: deactivateRule,
    postLedgerEntries: postLedgerEntries,
    getEntryView: getEntryView,
    getBalances: getBalances,
    getLedgerEntries: getLedgerEntries,
    addAdjustment: addAdjustment,
    syncOrder: syncOrder,
    getFulfillmentStatus: getFulfillmentStatus,
    getSellerOrderView: getSellerOrderView,
    shipOrder: shipOrder,
    requestCancellation: requestCancellation,
    applyOrderEvent: applyOrderEvent,
    rateSeller: rateSeller,
    getSellerOrders: getSellerOrders,
    getSellerOrderDetail: getSellerOrderDetail,
    getCustomerPurchases: getCustomerPurchases,
    closeFinishedOrders: closeFinishedOrders,
    bookMissedEarnings: bookMissedEarnings,
    getPerformanceMetrics: getPerformanceMetrics,
    evaluatePerformance: evaluatePerformance
};
