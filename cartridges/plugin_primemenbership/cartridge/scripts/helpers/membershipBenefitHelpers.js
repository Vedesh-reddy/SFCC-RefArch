'use strict';

/**
 * The entitlement engine. The membership record decides who gets what, on every call; nothing is
 * read from the session, the request or a customer group. Savings are custom price adjustments
 * added during the basket calculation, with caps counted on the membership record:
 *
 *   calculate -> adjustments on the basket (nothing counted yet)
 *   order created -> reservation counts the savings against the caps, re-checked
 *   order placed -> committed | order failed -> released | order cancelled later -> reversed
 *
 * Any error or invalid plan gives no benefit (fail closed).
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var membershipHelpers = require('*/cartridge/scripts/helpers/membershipHelpers');
var planHelpers = require('*/cartridge/scripts/helpers/membershipPlanHelpers');
var subscriptionHelpers = require('*/cartridge/scripts/helpers/membershipSubscriptionHelpers');
var adapters = require('*/cartridge/scripts/integrations/membershipAdapters');

var TYPE = 'PrimeMembershipBenefitUsage';
var PROMOTION = { 'member-discount': 'prime-membership-discount', 'exclusive-deals': 'prime-membership-deal', 'free-shipping': 'prime-membership-shipping' };
var ORDER_SAVINGS = 'order-savings';

/**
 * @param {string} customerNo - customer
 * @returns {?Object} {subscription, plan} while paid benefits apply and the plan can be trusted
 */
function getActiveMembership(customerNo) {
    if (!customerNo || !planHelpers.isEnabled()) return null;
    var subscription = subscriptionHelpers.getSubscription(customerNo);
    if (!subscriptionHelpers.isEntitled(subscription)) return null;
    var plan = planHelpers.getPlan(subscription.custom.planID);
    return plan && plan.valid ? { subscription: subscription, plan: plan } : null;
}

/**
 * @param {string} customerNo - customer
 * @returns {?Object} {planID, planName, planRank} of the customer's active membership
 */
function getMembershipTier(customerNo) {
    var active = getActiveMembership(customerNo);
    return active ? { planID: active.plan.planID, planName: active.plan.planName, planRank: active.plan.planRank } : null;
}

/**
 * @param {dw.object.CustomObject} subscription - membership
 * @returns {Object} benefitID => {uses, cents} in the current benefit period
 */
function getCounters(subscription) {
    return membershipHelpers.parseJson(subscription.custom.benefitCounters, {});
}

/**
 * @param {Object} plan - plan
 * @param {string} id - benefit ID
 * @returns {string} ACTIVE, or INTEGRATION_REQUIRED or SETUP_REQUIRED when it can't be delivered yet
 */
function getBenefitStatus(plan, id) {
    var benefit = plan.benefits[id];
    var integration = planHelpers.BENEFITS[id].integration;
    if (integration && !adapters.isConnected(integration)) return 'INTEGRATION_REQUIRED';
    if ((id === 'birthday-reward' || id === 'monthly-voucher') && !require('*/cartridge/scripts/helpers/membershipRewardHelpers').getRewardCoupon(benefit.couponID)) return 'SETUP_REQUIRED';
    if (id === 'priority-support' && !benefit.contact) return 'SETUP_REQUIRED';
    return 'ACTIVE';
}

/**
 * @param {Object} benefit - benefit configuration
 * @param {Object} counter - {uses, cents} so far in this period
 * @param {Object} context - {nowMs, countryCode, customer}
 * @returns {?string} reason the benefit doesn't apply, or null
 */
function getRestriction(benefit, counter, context) {
    var now = context.nowMs || Date.now();
    if (benefit.validFrom && Date.parse(benefit.validFrom) > now) return 'not-started';
    if (benefit.validTo && Date.parse(benefit.validTo) < now) return 'ended';
    if (benefit.countries && benefit.countries.length && benefit.countries.indexOf(context.countryCode) < 0) return 'country';
    if (benefit.customerGroupIDs && benefit.customerGroupIDs.length) {
        if (!context.customer || !context.customer.isMemberOfAnyCustomerGroup.apply(context.customer, benefit.customerGroupIDs)) return 'customer-group';
    }
    if (benefit.maxUsesPerPeriod && counter.uses >= benefit.maxUsesPerPeriod) return 'usage-limit';
    if (benefit.annualCapCents && counter.cents >= benefit.annualCapCents) return 'annual-cap';
    return null;
}

/**
 * @param {string} customerNo - customer
 * @param {string} benefitID - benefit
 * @param {Object} [context] - {nowMs, countryCode, customer}
 * @returns {{eligible: boolean, reason: ?string}} decision
 */
function isBenefitEligible(customerNo, benefitID, context) {
    var active = getActiveMembership(customerNo);
    if (!active) return { eligible: false, reason: 'no-membership' };
    var benefit = active.plan.benefits[benefitID];
    if (!benefit || benefit.enabled !== true) return { eligible: false, reason: 'not-on-plan' };
    if (getBenefitStatus(active.plan, benefitID) !== 'ACTIVE') return { eligible: false, reason: 'not-available' };
    var reason = getRestriction(benefit, getCounters(active.subscription)[benefitID] || { uses: 0, cents: 0 }, context || {});
    return { eligible: !reason, reason: reason };
}

/**
 * @param {string} customerNo - customer
 * @returns {Object[]} what the customer's plan gives, with whether it can be delivered and what is used
 */
function getAvailableBenefits(customerNo) {
    var active = getActiveMembership(customerNo);
    if (!active) return [];
    var counters = getCounters(active.subscription);
    return planHelpers.getEnabledBenefitIds(active.plan).map(function (id) {
        var counter = counters[id] || { uses: 0, cents: 0 };
        var benefit = active.plan.benefits[id];
        return {
            id: id,
            text: planHelpers.describeBenefit(active.plan, id),
            status: getBenefitStatus(active.plan, id),
            used: membershipHelpers.formatCents(counter.cents),
            remaining: benefit.annualCapCents ? membershipHelpers.formatCents(Math.max(0, benefit.annualCapCents - counter.cents)) : '',
            uses: String(counter.uses),
            hasCap: !!benefit.annualCapCents
        };
    });
}

/**
 * @param {dw.catalog.Product} product - product
 * @returns {string[]} category IDs including the master's and the parents
 */
function getCategoryIds(product) {
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
 * @param {Object} benefit - discount benefit
 * @param {dw.catalog.Product} product - product
 * @returns {boolean} true when the discount may apply to this product
 */
function isProductEligible(benefit, product) {
    var ids = [product.ID];
    if (product.isVariant()) ids.push(product.masterProduct.ID);
    if ((benefit.excludedProductIDs || []).some(function (id) { return ids.indexOf(id) >= 0; })) return false;
    var included = benefit.includedCategoryIDs || [];
    var excluded = benefit.excludedCategoryIDs || [];
    if (!included.length && !excluded.length) return true;
    var categories = getCategoryIds(product);
    if (excluded.some(function (id) { return categories.indexOf(id) >= 0; })) return false;
    return !included.length || included.some(function (id) { return categories.indexOf(id) >= 0; });
}

/**
 * @param {Object} deal - {productIDs, categoryIDs}
 * @param {dw.catalog.Product} product - product
 * @param {number} now - now
 * @returns {boolean} true when the deal covers this product now
 */
function isDealOn(deal, product, now) {
    if (deal.startsAt && Date.parse(deal.startsAt) > now) return false;
    if (deal.endsAt && Date.parse(deal.endsAt) < now) return false;
    var ids = [product.ID];
    if (product.isVariant()) ids.push(product.masterProduct.ID);
    if ((deal.productIDs || []).some(function (id) { return ids.indexOf(id) >= 0; })) return true;
    if (!(deal.categoryIDs || []).length) return false;
    var categories = getCategoryIds(product);
    return deal.categoryIDs.some(function (id) { return categories.indexOf(id) >= 0; });
}

/**
 * Seller payouts come from the line price, so a member discount on a seller's offer would be paid
 * by the seller. Reads the attribute defensively because plugin_seller is optional.
 * @param {dw.order.ProductLineItem} line - line
 * @returns {boolean} true for a marketplace seller offer
 */
function isSellerOffer(line) {
    try {
        return !!line.custom.mktOfferId;
    } catch (e) {
        return false;
    }
}

/**
 * @param {dw.order.ProductLineItem} line - line
 * @returns {number} discounts already on this line from promotions, in cents
 */
function getPromotionCents(line) {
    return line.priceAdjustments.toArray().reduce(function (sum, adjustment) {
        return sum + Math.abs(membershipHelpers.centsOf(adjustment.price));
    }, 0);
}

/**
 * The member discount and deal percent for each line. Equivalent benefits never stack: a line
 * gets the higher of the two percentages, never both. Pure calculation: changes nothing.
 * @param {string} customerNo - customer
 * @param {dw.order.LineItemCtnr} basket - basket, already free of this plugin's adjustments
 * @param {Object} [context] - {nowMs, customer}
 * @returns {Object} {lines: [{line, cents, benefitID}], shipping: [{item, cents}], totals}
 */
function calculateMembershipSavings(customerNo, basket, context) {
    var result = { lines: [], shipping: [], discountCents: 0, dealCents: 0, shippingCents: 0 };
    var active = getActiveMembership(customerNo);
    if (!active) return result;
    var ctx = context || {};
    var now = ctx.nowMs || Date.now();
    var plan = active.plan;
    var counters = getCounters(active.subscription);
    var shipment = basket.defaultShipment;
    var address = shipment && shipment.shippingAddress;
    var countryCode = address && address.countryCode ? String(address.countryCode.value || address.countryCode) : null;
    var usable = function (id) {
        var benefit = plan.benefits[id];
        if (!benefit || benefit.enabled !== true) return null;
        var reason = getRestriction(benefit, counters[id] || { uses: 0, cents: 0 }, { nowMs: now, countryCode: countryCode, customer: ctx.customer });
        return reason ? null : benefit;
    };
    var room = function (benefit, id) {
        return Math.min(benefit.perOrderCapCents, benefit.annualCapCents - (counters[id] ? counters[id].cents : 0));
    };
    var discount = usable('member-discount');
    var deals = usable('exclusive-deals');
    var discountRoom = discount ? room(discount, 'member-discount') : 0;
    var dealRoom = deals ? room(deals, 'exclusive-deals') : 0;
    var sellerOffersAllowed = membershipHelpers.getPreference('primeMembershipDiscountSellerOffers') === true;

    if (discount || deals) {
        basket.getAllProductLineItems().toArray().forEach(function (line) {
            if (!line.product || !line.catalogProduct || line.bonusProductLineItem || line.optionProductLineItem || line.bundledProductLineItem) return;
            if (isSellerOffer(line) && !sellerOffersAllowed) return;
            var cents = membershipHelpers.centsOf(line.basePrice) * line.quantityValue;
            var promoted = getPromotionCents(line);
            var net = cents - promoted;
            if (net <= 0) return;
            var dealPercent = 0;
            if (deals) {
                deals.deals.forEach(function (deal) {
                    if (deal.percent > dealPercent && isDealOn(deal, line.product, now)) dealPercent = deal.percent;
                });
            }
            var discountPercent = discount && isProductEligible(discount, line.product) ? discount.percent : 0;
            var useDeal = dealPercent > discountPercent;
            var percent = useDeal ? dealPercent : discountPercent;
            var benefit = useDeal ? deals : discount;
            if (!percent) return;
            var policy = benefit.promotionPolicy || 'exclude-promoted';
            if (promoted > 0 && policy === 'exclude-promoted') return;
            var wanted = Math.round((policy === 'stack' ? net : cents) * percent / 100);
            if (policy === 'best-of') wanted -= promoted;
            var available = useDeal ? dealRoom : discountRoom;
            var amount = Math.min(wanted, available, net);
            if (amount <= 0) return;
            if (useDeal) {
                dealRoom -= amount;
                result.dealCents += amount;
            } else {
                discountRoom -= amount;
                result.discountCents += amount;
            }
            result.lines.push({ line: line, cents: amount, benefitID: useDeal ? 'exclusive-deals' : 'member-discount' });
        });
    }

    var shippingBenefit = usable('free-shipping');
    if (shippingBenefit) {
        var shippingRoom = room(shippingBenefit, 'free-shipping');
        basket.shipments.toArray().forEach(function (item) {
            var method = item.shippingMethod;
            var shippingLine = item.standardShippingLineItem;
            if (!method || !shippingLine || shippingBenefit.methodIDs.indexOf(method.ID) < 0) return;
            var amount = Math.min(membershipHelpers.centsOf(shippingLine.adjustedPrice), shippingRoom);
            if (amount <= 0) return;
            shippingRoom -= amount;
            result.shippingCents += amount;
            result.shipping.push({ item: shippingLine, cents: amount });
        });
    }
    return result;
}

/**
 * @param {dw.order.ShippingLineItem} line - shipping line
 * @returns {?dw.order.PriceAdjustment} this plugin's adjustment on it
 */
function getShippingAdjustment(line) {
    return line.shippingPriceAdjustments.toArray().filter(function (adjustment) { return adjustment.promotionID === PROMOTION['free-shipping']; })[0] || null;
}

/**
 * @param {dw.order.Basket} basket - basket
 */
function removeAdjustments(basket) {
    basket.getAllProductLineItems().toArray().forEach(function (line) {
        ['member-discount', 'exclusive-deals'].forEach(function (id) {
            var adjustment = line.getPriceAdjustmentByPromotionID(PROMOTION[id]);
            if (adjustment) line.removePriceAdjustment(adjustment);
        });
    });
    basket.shipments.toArray().forEach(function (shipment) {
        var line = shipment.standardShippingLineItem;
        var adjustment = line ? getShippingAdjustment(line) : null;
        if (adjustment) line.removeShippingPriceAdjustment(adjustment);
    });
}

/**
 * Rebuilds this plugin's adjustments for the basket being calculated.
 * @param {dw.order.Basket} basket - basket
 */
function applyMembershipSavings(basket) {
    var Resource = require('dw/web/Resource');
    removeAdjustments(basket);
    var customer = basket.customer;
    if (!customer || !customer.authenticated || !customer.registered) {
        basket.custom.primeMembershipSavingsCents = 0;
        basket.custom.primeMembershipShippingSavingsCents = 0;
        return;
    }
    var savings = calculateMembershipSavings(basket.customerNo, basket, { customer: customer });
    savings.lines.forEach(function (entry) {
        // Not createPriceAdjustment(id, discount): on the platform that leaves the price at 0 here.
        var adjustment = entry.line.createPriceAdjustment(PROMOTION[entry.benefitID]);
        adjustment.setPriceValue(-entry.cents / 100);
        adjustment.setLineItemText(Resource.msg('adjustment.' + entry.benefitID, membershipHelpers.BUNDLE, null));
    });
    savings.shipping.forEach(function (entry) {
        var adjustment = entry.item.createShippingPriceAdjustment(PROMOTION['free-shipping']);
        adjustment.setPriceValue(-entry.cents / 100);
        adjustment.setLineItemText(Resource.msg('adjustment.free-shipping', membershipHelpers.BUNDLE, null));
    });
    basket.custom.primeMembershipSavingsCents = savings.discountCents + savings.dealCents;
    basket.custom.primeMembershipShippingSavingsCents = savings.shippingCents;
}

/**
 * A membership fee is charged exactly as quoted: no shipping cost, and no order promotion can
 * reduce it, because the calculate hook runs after the promotion engine.
 * @param {dw.order.Basket} basket - fee basket
 */
function clearFeeBasket(basket) {
    basket.priceAdjustments.toArray().forEach(function (adjustment) { basket.removePriceAdjustment(adjustment); });
    basket.shippingPriceAdjustments.toArray().forEach(function (adjustment) { basket.removeShippingPriceAdjustment(adjustment); });
    basket.getAllProductLineItems().toArray().forEach(function (line) {
        line.priceAdjustments.toArray().forEach(function (adjustment) { line.removePriceAdjustment(adjustment); });
    });
    basket.shipments.toArray().forEach(function (shipment) {
        var line = shipment.standardShippingLineItem;
        if (!line) return;
        line.shippingPriceAdjustments.toArray().forEach(function (adjustment) { line.removeShippingPriceAdjustment(adjustment); });
        line.setPriceValue(0);
    });
}

/**
 * @param {dw.order.LineItemCtnr} ctnr - basket or order
 * @returns {Object} benefitID => cents this plugin gave on it
 */
function getContainerSavings(ctnr) {
    var amounts = { 'member-discount': 0, 'exclusive-deals': 0, 'free-shipping': 0 };
    ctnr.getAllProductLineItems().toArray().forEach(function (line) {
        ['member-discount', 'exclusive-deals'].forEach(function (id) {
            var adjustment = line.getPriceAdjustmentByPromotionID(PROMOTION[id]);
            if (adjustment) amounts[id] += Math.abs(membershipHelpers.centsOf(adjustment.price));
        });
    });
    ctnr.shipments.toArray().forEach(function (shipment) {
        var line = shipment.standardShippingLineItem;
        var adjustment = line ? getShippingAdjustment(line) : null;
        if (adjustment) amounts['free-shipping'] += Math.abs(membershipHelpers.centsOf(adjustment.price));
    });
    return amounts;
}

/**
 * Adds to or takes from the counters. Call inside a transaction.
 * @param {dw.object.CustomObject} subscription - membership
 * @param {Object} amounts - benefitID => cents
 * @param {number} sign - 1 to add, -1 to give back
 */
function changeCounters(subscription, amounts, sign) {
    var counters = getCounters(subscription);
    Object.keys(amounts).forEach(function (id) {
        if (!amounts[id]) return;
        var counter = counters[id] || { uses: 0, cents: 0 };
        counter.uses = Math.max(0, counter.uses + sign);
        counter.cents = Math.max(0, counter.cents + sign * amounts[id]);
        counters[id] = counter;
    });
    subscription.custom.benefitCounters = JSON.stringify(counters);
}

/**
 * @param {dw.object.CustomObject} subscription - membership
 * @returns {string} the benefit period the usage belongs to
 */
function getUsagePeriod(subscription) {
    return membershipHelpers.toDay(subscription.custom.benefitPeriodStart);
}

/**
 * Counts savings against the caps with the current counters, so that two orders racing for the
 * same allowance can't both pass unnoticed by more than one order's cap. One row per order: the
 * platform allows 10 custom object creations per storefront request, across all cartridges.
 * @param {string} customerNo - customer
 * @param {string} benefitID - benefit, or order-savings with context.amounts
 * @param {Object} context - {orderNo, amounts: {benefitID: cents}, loyaltyMultiplier}
 * @returns {string} reservation ID
 */
function reserveBenefitUsage(customerNo, benefitID, context) {
    var active = getActiveMembership(customerNo);
    if (!active) throw membershipHelpers.abort('no-membership');
    var counters = getCounters(active.subscription);
    var amounts = context.amounts || {};
    Object.keys(amounts).forEach(function (id) {
        if (!amounts[id]) return;
        var benefit = active.plan.benefits[id];
        var used = counters[id] ? counters[id].cents : 0;
        if (!benefit || benefit.enabled !== true || amounts[id] > benefit.perOrderCapCents || used + amounts[id] > benefit.annualCapCents) throw membershipHelpers.abort('cap-exceeded');
    });
    var id = active.subscription.custom.subscriptionID + ':' + benefitID + ':' + context.orderNo;
    var record = CustomObjectMgr.createCustomObject(TYPE, id);
    var total = Object.keys(amounts).reduce(function (sum, key) { return sum + amounts[key]; }, 0);
    record.custom.subscriptionID = active.subscription.custom.subscriptionID;
    record.custom.customerNo = customerNo;
    record.custom.benefitID = benefitID;
    record.custom.usagePeriod = getUsagePeriod(active.subscription);
    record.custom.orderNo = context.orderNo;
    record.custom.discountCents = total;
    record.custom.details = JSON.stringify(amounts);
    record.custom.usageStatus = 'RESERVED';
    if (context.loyaltyMultiplier) {
        record.custom.loyaltyMultiplier = context.loyaltyMultiplier;
        record.custom.loyaltyStatus = 'PENDING';
    }
    record.custom.createdAt = new Date();
    record.custom.updatedAt = new Date();
    changeCounters(active.subscription, amounts, 1);
    active.subscription.custom.updatedAt = new Date();
    return id;
}

/**
 * @param {string} reservationID - reservation
 */
function commitBenefitUsage(reservationID) {
    var record = CustomObjectMgr.getCustomObject(TYPE, reservationID);
    if (!record || record.custom.usageStatus !== 'RESERVED') return;
    record.custom.usageStatus = 'COMMITTED';
    record.custom.updatedAt = new Date();
}

/**
 * Gives the allowance back. A repeat changes nothing, because only a RESERVED row counts.
 * @param {string} reservationID - reservation
 */
function releaseBenefitUsage(reservationID) {
    var record = CustomObjectMgr.getCustomObject(TYPE, reservationID);
    if (!record || record.custom.usageStatus !== 'RESERVED') return;
    var subscription = subscriptionHelpers.getSubscription(record.custom.customerNo);
    if (subscription && record.custom.usagePeriod === getUsagePeriod(subscription)) changeCounters(subscription, membershipHelpers.parseJson(record.custom.details, {}), -1);
    record.custom.usageStatus = 'RELEASED';
    if (record.custom.loyaltyStatus === 'PENDING') record.custom.loyaltyStatus = 'VOID';
    record.custom.updatedAt = new Date();
}

/**
 * @param {string} customerNo - customer
 * @param {dw.order.Order} order - order
 * @returns {string} the order's reservation ID
 */
function getOrderReservationId(customerNo, order) {
    return customerNo + ':' + ORDER_SAVINGS + ':' + order.orderNo;
}

/**
 * @param {dw.order.LineItemCtnr} ctnr - basket or order
 * @returns {boolean} true when this is a membership fee and not a purchase of merchandise
 */
function isFeeContainer(ctnr) {
    if (ctnr.custom.primeMembershipTransactionID) return true;
    var feeID = membershipHelpers.getPreference('primeMembershipFeeProductID');
    return ctnr.getAllProductLineItems().toArray().some(function (line) { return line.productID === feeID && !line.catalogProduct; });
}

/**
 * Stamps what fulfilment needs to know and reserves the order's savings.
 * @param {dw.order.Order} order - order just created from the basket
 * @returns {boolean} false when the savings are no longer allowed; the caller fails the order
 */
function reserveOrderBenefits(order) {
    if (isFeeContainer(order)) return true;
    var customerNo = order.customerNo;
    var amounts = getContainerSavings(order);
    var hasSavings = Object.keys(amounts).some(function (id) { return amounts[id] > 0; });
    var active = getActiveMembership(customerNo);
    if (!active) return !hasSavings;
    try {
        Transaction.wrap(function () {
            var plan = active.plan;
            var loyalty = plan.benefits['loyalty-multiplier'];
            var multiplier = loyalty && loyalty.enabled === true && adapters.isLoyaltyAvailable() ? loyalty.multiplier : null;
            if (hasSavings || multiplier) reserveBenefitUsage(customerNo, ORDER_SAVINGS, { orderNo: order.orderNo, amounts: amounts, loyaltyMultiplier: multiplier });
            order.custom.primeMembershipSubscriptionID = active.subscription.custom.subscriptionID;
            order.custom.primeMembershipSavingsCents = amounts['member-discount'] + amounts['exclusive-deals'];
            order.custom.primeMembershipShippingSavingsCents = amounts['free-shipping'];
            var returns = plan.benefits['extended-returns'];
            if (returns && returns.enabled === true && adapters.isConnected('returns')) order.custom.primeMembershipReturnDays = returns.days;
            var wrap = plan.benefits['gift-wrap'];
            if (wrap && wrap.enabled === true && adapters.isConnected('gift-wrap')) {
                order.custom.primeMembershipGiftWrap = order.shipments.toArray().some(function (shipment) { return shipment.gift; });
            }
        });
    } catch (e) {
        require('dw/system/Logger').getLogger('prime-membership', 'membership-benefit').warn('Benefits not reserved for order {0}: {1}', order.orderNo, e.errorCode || e.message);
        return false;
    }
    return true;
}

/**
 * @param {dw.order.Order} order - order
 * @param {boolean} placed - true to commit, false to release
 */
function settleOrderBenefits(order, placed) {
    if (!order.customerNo) return;
    var id = getOrderReservationId(order.customerNo, order);
    Transaction.wrap(function () {
        if (placed) commitBenefitUsage(id);
        else releaseBenefitUsage(id);
    });
}

/**
 * Settles reservations left open and reverses usage of cancelled orders, per the benefit's
 * reversal rule. Also pays out loyalty multipliers. Bounded and repeatable.
 * @param {number} limit - maximum per kind
 * @returns {Object} counts
 */
function reconcileUsage(limit) {
    var OrderMgr = require('dw/order/OrderMgr');
    var Order = require('dw/order/Order');
    var counts = { committed: 0, released: 0, reversed: 0, loyaltyApplied: 0, errors: 0 };
    var cutoff = new Date(Date.now() - 30 * 60000);
    membershipHelpers.queryPage(TYPE, 'custom.usageStatus = {0} AND custom.createdAt < {1}', 'custom.createdAt asc', ['RESERVED', cutoff], 0, limit).items.forEach(function (record) {
        var order = OrderMgr.getOrder(record.custom.orderNo);
        var status = order ? order.status.value : Order.ORDER_STATUS_FAILED;
        if (status === Order.ORDER_STATUS_CREATED) return;
        var placed = status !== Order.ORDER_STATUS_FAILED && status !== Order.ORDER_STATUS_CANCELLED;
        Transaction.wrap(function () {
            if (placed) commitBenefitUsage(record.custom.usageID);
            else releaseBenefitUsage(record.custom.usageID);
        });
        counts[placed ? 'committed' : 'released'] += 1;
    });
    membershipHelpers.queryPage(TYPE, 'custom.usageStatus = {0} AND custom.updatedAt >= {1} AND custom.discountCents > {2}', 'custom.updatedAt asc', ['COMMITTED', new Date(Date.now() - 90 * membershipHelpers.DAY), 0], 0, limit).items.forEach(function (record) {
        var order = OrderMgr.getOrder(record.custom.orderNo);
        if (!order || order.status.value !== Order.ORDER_STATUS_CANCELLED) return;
        Transaction.wrap(function () {
            var subscription = subscriptionHelpers.getSubscription(record.custom.customerNo);
            var plan = subscription ? planHelpers.getPlan(subscription.custom.planID) : null;
            var amounts = membershipHelpers.parseJson(record.custom.details, {});
            var give = {};
            Object.keys(amounts).forEach(function (id) {
                var benefit = plan && plan.benefits ? plan.benefits[id] : null;
                if (!benefit || benefit.reversal !== 'keep') give[id] = amounts[id];
            });
            if (subscription && record.custom.usagePeriod === getUsagePeriod(subscription)) changeCounters(subscription, give, -1);
            record.custom.usageStatus = 'REVERSED';
            record.custom.updatedAt = new Date();
            membershipHelpers.audit('usage-reversed', 'job:reconciliation', record.custom.subscriptionID, 'COMMITTED', 'REVERSED', null);
        });
        counts.reversed += 1;
    });
    if (adapters.isLoyaltyAvailable()) {
        membershipHelpers.queryPage(TYPE, 'custom.loyaltyStatus = {0} AND custom.usageStatus = {1}', 'custom.createdAt asc', ['PENDING', 'COMMITTED'], 0, limit).items.forEach(function (record) {
            try {
                var outcome = adapters.applyLoyaltyMultiplier({ orderNo: record.custom.orderNo, customerNo: record.custom.customerNo, multiplier: record.custom.loyaltyMultiplier });
                if (outcome.status === 'PENDING') return;
                Transaction.wrap(function () {
                    record.custom.loyaltyStatus = outcome.status;
                    record.custom.updatedAt = new Date();
                });
                if (outcome.status === 'APPLIED') counts.loyaltyApplied += 1;
            } catch (e) {
                counts.errors += 1;
            }
        });
    }
    return counts;
}

/**
 * Moves memberships into their next benefit period. Past usage stays on its rows; only the running
 * counters start over.
 * @param {number} limit - maximum per run
 * @returns {Object} counts
 */
function advanceBenefitPeriods(limit) {
    var counts = { advanced: 0 };
    membershipHelpers.queryPage('PrimeMembershipSubscription', 'custom.benefitPeriodEnd <= {0}', 'custom.benefitPeriodEnd asc', [new Date()], 0, limit).items.forEach(function (subscription) {
        if (!subscriptionHelpers.isEntitled(subscription)) return;
        Transaction.wrap(function () {
            var s = subscription.custom;
            var start = s.benefitPeriodEnd;
            // A membership whose job runs were missed catches up by whole periods, not one per run.
            while (membershipHelpers.addMonths(start, 12).getTime() <= Date.now()) start = membershipHelpers.addMonths(start, 12);
            s.benefitPeriodStart = start;
            s.benefitPeriodEnd = membershipHelpers.addMonths(start, 12);
            s.benefitCounters = '{}';
            s.updatedAt = new Date();
        });
        counts.advanced += 1;
    });
    return counts;
}

/**
 * @param {string} customerNo - customer
 * @param {number} limit - page size
 * @returns {Object[]} savings and rewards, newest first
 */
function getUsageHistory(customerNo, limit) {
    return membershipHelpers.queryPage(TYPE, 'custom.customerNo = {0}', 'custom.createdAt desc', [customerNo], 0, limit).items.map(function (record) {
        var c = record.custom;
        return {
            benefitID: c.benefitID,
            orderNo: c.orderNo || '',
            amount: membershipHelpers.formatCents(c.discountCents || 0),
            status: c.usageStatus,
            rewardCode: c.usageStatus === 'ISSUED' ? c.rewardCode || '' : '',
            date: membershipHelpers.toDay(c.createdAt)
        };
    });
}

module.exports = {
    ORDER_SAVINGS: ORDER_SAVINGS,
    PROMOTION: PROMOTION,
    getActiveMembership: getActiveMembership,
    getMembershipTier: getMembershipTier,
    getAvailableBenefits: getAvailableBenefits,
    getBenefitStatus: getBenefitStatus,
    isBenefitEligible: isBenefitEligible,
    isProductEligible: isProductEligible,
    calculateMembershipSavings: calculateMembershipSavings,
    applyMembershipSavings: applyMembershipSavings,
    removeAdjustments: removeAdjustments,
    clearFeeBasket: clearFeeBasket,
    isFeeContainer: isFeeContainer,
    getContainerSavings: getContainerSavings,
    reserveBenefitUsage: reserveBenefitUsage,
    commitBenefitUsage: commitBenefitUsage,
    releaseBenefitUsage: releaseBenefitUsage,
    reserveOrderBenefits: reserveOrderBenefits,
    settleOrderBenefits: settleOrderBenefits,
    reconcileUsage: reconcileUsage,
    advanceBenefitPeriods: advanceBenefitPeriods,
    getUsageHistory: getUsageHistory
};
