'use strict';

/**
 * Buying, upgrading and renewing. A membership is paid in its own order, from a temporary basket
 * with one non-catalog line, so the shopper's cart is untouched and the fee needs no catalog
 * product, price book or inventory. Payment goes through the site's own payment processor hooks.
 *
 * Sequence: quote -> billing address -> tax shown -> payment -> order placed -> payment verified
 * -> membership changed. Only activateFromOrder changes entitlements, and it reads the order's
 * payment state on the server. Nothing in a request can mark a payment as paid.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');
var membershipHelpers = require('*/cartridge/scripts/helpers/membershipHelpers');
var planHelpers = require('*/cartridge/scripts/helpers/membershipPlanHelpers');
var subscriptionHelpers = require('*/cartridge/scripts/helpers/membershipSubscriptionHelpers');
var pricingHelpers = require('*/cartridge/scripts/helpers/membershipPricingHelpers');
var adapters = require('*/cartridge/scripts/integrations/membershipAdapters');

var log = Logger.getLogger('prime-membership', 'membership-payment');
var TYPE = 'PrimeMembershipTransaction';
var TYPES = ['PURCHASE', 'UPGRADE', 'RENEWAL'];
var FLOW = {
    QUOTED: ['PROCESSING', 'EXPIRED'],
    PROCESSING: ['AWAITING_PAYMENT', 'FAILED', 'REVIEW'],
    AWAITING_PAYMENT: ['COMPLETED', 'FAILED', 'REVIEW'],
    REVIEW: ['COMPLETED', 'FAILED'],
    COMPLETED: ['REFUNDED'],
    FAILED: ['REVIEW'],
    EXPIRED: [],
    REFUNDED: []
};
var REFUND_WATCH_DAYS = 90;
var PENDING_STATUS = { PURCHASE: 'PENDING_PAYMENT', UPGRADE: 'UPGRADE_PENDING', RENEWAL: 'RENEWAL_PENDING' };

/**
 * Changes a transaction's status. Call inside a transaction.
 * @param {dw.object.CustomObject} record - transaction
 * @param {string} to - new status
 * @param {?string} [reason] - review or failure reason
 */
function setStatus(record, to, reason) {
    if (FLOW[record.custom.status].indexOf(to) < 0) throw membershipHelpers.abort('invalid-transition');
    record.custom.status = to;
    record.custom.reviewReason = reason || null;
    record.custom.updatedAt = new Date();
}

/**
 * @param {string} id - transaction
 * @param {string} customerNo - owner
 * @returns {?dw.object.CustomObject} the transaction, only when it is this customer's
 */
function getOwnTransaction(id, customerNo) {
    var record = CustomObjectMgr.getCustomObject(TYPE, String(id || ''));
    return record && record.custom.customerNo === customerNo ? record : null;
}

/**
 * What the customer would pay for an action, or why they can't. Everything comes from the
 * server's records: nothing about the price is read from the request.
 * @param {string} customerNo - customer
 * @param {string} type - PURCHASE, UPGRADE or RENEWAL
 * @param {string} planID - target plan
 * @param {number} [nowMs] - now
 * @returns {Object} result with plan, subscription, amountCents and quoteData
 */
function getQuote(customerNo, type, planID, nowMs) {
    var now = nowMs || Date.now();
    if (!planHelpers.isEnabled()) return membershipHelpers.errorResult('disabled');
    if (TYPES.indexOf(type) < 0) return membershipHelpers.errorResult('invalid');
    var plan = planHelpers.getPlan(planID);
    if (!plan || !plan.enabled || !plan.valid) return membershipHelpers.errorResult('plan-unavailable');
    var subscription = subscriptionHelpers.getSubscription(customerNo);
    var entitled = subscriptionHelpers.isEntitled(subscription, now);
    if (subscription && subscription.custom.pendingTransactionID) return membershipHelpers.errorResult('payment-pending');
    if (subscription && ['SUSPENDED', 'REFUND_PENDING'].indexOf(subscription.custom.status) >= 0) return membershipHelpers.errorResult('membership-on-hold');
    var quote = { error: false, plan: plan, subscription: subscription, type: type, quoteData: {} };
    if (type === 'PURCHASE') {
        if (entitled) return membershipHelpers.errorResult('already-member');
        quote.amountCents = plan.annualPriceCents;
        return quote;
    }
    if (!entitled) return membershipHelpers.errorResult('no-membership');
    var current = planHelpers.getPlan(subscription.custom.planID);
    if (type === 'RENEWAL') {
        if (subscription.custom.planID !== plan.planID) return membershipHelpers.errorResult('invalid');
        var windowDays = membershipHelpers.getPreference('primeMembershipRenewalWindowDays');
        if (subscription.custom.paidThroughDate.getTime() - now > windowDays * membershipHelpers.DAY) return membershipHelpers.errorResult('renewal-not-open');
        quote.amountCents = plan.annualPriceCents;
        return quote;
    }
    if (subscription.custom.status === 'CANCELLED') return membershipHelpers.errorResult('reactivate-first');
    if (!current || plan.planRank <= current.planRank) return membershipHelpers.errorResult('not-an-upgrade');
    var figures = pricingHelpers.calculateMembershipUpgrade(subscription, plan, now);
    if (figures.chargeCents < 0) return membershipHelpers.errorResult('invalid-charge');
    if (figures.chargeCents < membershipHelpers.getPreference('primeMembershipMinUpgradeChargeCents')) return membershipHelpers.errorResult('upgrade-too-late');
    quote.amountCents = figures.chargeCents;
    quote.quoteData = figures;
    return quote;
}

/**
 * Creates the temporary basket with the fee line. Call inside a transaction.
 * @param {string} transactionID - transaction
 * @param {Object} plan - target plan
 * @param {number} amountCents - fee before tax
 * @param {string} customerNo - customer
 * @returns {dw.order.Basket} basket
 */
function createFeeBasket(transactionID, plan, amountCents, customerNo) {
    var basket = require('dw/order/BasketMgr').createTemporaryBasket();
    var line = basket.createProductLineItem(membershipHelpers.getPreference('primeMembershipFeeProductID'), basket.defaultShipment);
    if (line.catalogProduct) throw membershipHelpers.abort('fee-product-in-catalog');
    var taxClass = membershipHelpers.getPreference('primeMembershipFeeTaxClass');
    line.setProductName(plan.planName);
    line.setLineItemText(plan.planName);
    line.setTaxClassID(taxClass || require('dw/order/TaxMgr').getDefaultTaxClassID());
    line.setQuantityValue(1);
    line.setPriceValue(amountCents / 100);
    basket.custom.primeMembershipTransactionID = transactionID;
    // Base checkout takes this from its contact form; the order needs it for mail and support.
    var customer = require('dw/customer/CustomerMgr').getCustomerByCustomerNumber(customerNo);
    if (customer && customer.profile) basket.setCustomerEmail(customer.profile.email);
    return basket;
}

/**
 * Starts a checkout: fixes the price in a quote that expires, and opens its basket. Repeating
 * the same form (same nonce) returns the same transaction.
 * @param {string} customerNo - customer
 * @param {string} type - PURCHASE, UPGRADE or RENEWAL
 * @param {string} planID - target plan
 * @param {string} nonce - issued with the form
 * @returns {Object} result with transactionID
 */
function startCheckout(customerNo, type, planID, nonce) {
    var key = type + ':' + customerNo + ':' + nonce;
    var existing = CustomObjectMgr.getCustomObject(TYPE, key);
    if (existing) return { error: false, transactionID: key };
    // Nothing is sold until the whole financial setup passes, not only the plan being bought.
    if (planHelpers.getConfigurationProblems().length) return membershipHelpers.errorResult('disabled');
    var quote = getQuote(customerNo, type, planID);
    if (quote.error) return quote;
    if (session.currency.currencyCode !== quote.plan.currency) return membershipHelpers.errorResult('currency-not-supported');
    var minutes = membershipHelpers.getPreference('primeMembershipQuoteMinutes');
    try {
        Transaction.wrap(function () {
            var record = CustomObjectMgr.createCustomObject(TYPE, key);
            var c = record.custom;
            var basket = createFeeBasket(key, quote.plan, quote.amountCents, customerNo);
            c.idempotencyKey = key;
            c.subscriptionID = customerNo;
            c.customerNo = customerNo;
            c.transactionType = type;
            c.sourcePlanID = quote.subscription ? quote.subscription.custom.planID : null;
            c.targetPlanID = quote.plan.planID;
            c.planVersion = quote.plan.configurationVersion;
            c.amountCents = quote.amountCents;
            c.taxCents = 0;
            c.totalCents = quote.amountCents;
            c.currency = quote.plan.currency;
            c.status = 'QUOTED';
            c.quoteExpiresAt = new Date(Date.now() + minutes * 60000);
            c.quoteData = JSON.stringify(quote.quoteData);
            c.basketUUID = basket.UUID;
            c.subscriptionStamp = quote.subscription ? subscriptionHelpers.getStamp(quote.subscription) : '';
            c.correlationID = membershipHelpers.createId('PMC');
            c.createdAt = new Date();
            c.updatedAt = new Date();
        });
    } catch (e) {
        log.error('Starting a {0} checkout failed: {1}', type, e.errorCode || e.message);
        return membershipHelpers.errorResult(e.errorCode === 'fee-product-in-catalog' ? 'plan-unavailable' : 'checkout-unavailable');
    }
    return { error: false, transactionID: key };
}

/**
 * @param {dw.object.CustomObject} record - transaction
 * @returns {?dw.order.Basket} its temporary basket, or null when it expired
 */
function getFeeBasket(record) {
    return record.custom.basketUUID ? require('dw/order/BasketMgr').getTemporaryBasket(record.custom.basketUUID) : null;
}

/**
 * @param {dw.object.CustomObject} record - transaction
 * @returns {Object} failed result when the quote can't be used any more
 */
function checkQuote(record) {
    var c = record.custom;
    if (c.status !== 'QUOTED') return membershipHelpers.errorResult('quote-used');
    if (c.quoteExpiresAt.getTime() <= Date.now()) return membershipHelpers.errorResult('quote-expired');
    var plan = planHelpers.getPlan(c.targetPlanID);
    if (!plan || !plan.enabled || !plan.valid || plan.configurationVersion !== c.planVersion) return membershipHelpers.errorResult('quote-expired');
    var subscription = subscriptionHelpers.getSubscription(c.customerNo);
    if ((subscription ? subscriptionHelpers.getStamp(subscription) : '') !== (c.subscriptionStamp || '')) return membershipHelpers.errorResult('quote-expired');
    if (subscription && subscription.custom.pendingTransactionID) return membershipHelpers.errorResult('payment-pending');
    return { error: false, plan: plan };
}

/**
 * Stores the billing address and calculates tax, so the customer sees the final amount before paying.
 * @param {dw.object.CustomObject} record - own transaction
 * @param {Object} address - validated form values
 * @returns {Object} result
 */
function saveBillingAddress(record, address) {
    var checked = checkQuote(record);
    if (checked.error) return checked;
    if (membershipHelpers.getListPreference('primeMembershipBillingCountries').indexOf(address.countryCode) < 0) return membershipHelpers.errorResult('invalid', { countryCode: 'not-supported' });
    var basket = getFeeBasket(record);
    if (!basket) return membershipHelpers.errorResult('quote-expired');
    Transaction.wrap(function () {
        var billing = basket.billingAddress || basket.createBillingAddress();
        var shipping = basket.defaultShipment.shippingAddress || basket.defaultShipment.createShippingAddress();
        // The tax jurisdiction comes from the shipment, and a fee has nothing to ship.
        [billing, shipping].forEach(function (target) {
            target.setFirstName(address.firstName);
            target.setLastName(address.lastName);
            target.setAddress1(address.address1);
            target.setAddress2(address.address2 || '');
            target.setCity(address.city);
            target.setStateCode(address.stateCode);
            target.setPostalCode(address.postalCode);
            target.setCountryCode(address.countryCode);
            target.setPhone(address.phone);
        });
        require('*/cartridge/scripts/helpers/basketCalculationHelpers').calculateTotals(basket);
        record.custom.taxCents = membershipHelpers.centsOf(basket.totalTax);
        record.custom.totalCents = membershipHelpers.centsOf(basket.totalGrossPrice);
        record.custom.updatedAt = new Date();
    });
    return { error: false };
}

/**
 * @param {dw.order.Basket} basket - fee basket
 * @param {dw.object.CustomObject} record - transaction
 * @returns {boolean} true when the basket charges exactly what was quoted and shown
 */
function basketMatchesQuote(basket, record) {
    return basket.currencyCode === record.custom.currency
        && basket.productLineItems.length === 1
        && membershipHelpers.centsOf(basket.totalNetPrice) === record.custom.amountCents
        && membershipHelpers.centsOf(basket.totalGrossPrice) === record.custom.totalCents;
}

/**
 * @param {string} reason - failure reason
 * @returns {boolean} true when a charge was attempted, so the customer needs to hear about it
 */
function actorIsCharge(reason) {
    return ['payment-declined', 'payment-failed', 'renewal-declined'].indexOf(reason) >= 0;
}

/**
 * Ends a transaction that took no money and puts the membership back as it was.
 * @param {dw.object.CustomObject} record - transaction
 * @param {string} reason - why
 * @param {string} actor - audit actor
 */
function failTransaction(record, reason, actor) {
    Transaction.wrap(function () {
        var c = record.custom;
        var subscription = subscriptionHelpers.getSubscription(c.customerNo);
        setStatus(record, 'FAILED', reason);
        membershipHelpers.audit('payment-failed', actor, c.subscriptionID, null, reason, c.correlationID);
        if (!subscription || subscription.custom.pendingTransactionID !== c.transactionID) return;
        subscription.custom.pendingTransactionID = null;
        if (subscription.custom.status === PENDING_STATUS[c.transactionType]) {
            // A failed upgrade leaves the paid plan and its dates untouched. PAYMENT_FAILED keeps a
            // renewing member's benefits until the paid-through date too.
            subscriptionHelpers.transition(subscription, c.transactionType === 'UPGRADE' ? 'ACTIVE' : 'PAYMENT_FAILED', actor, reason, c.correlationID);
        }
        if (actorIsCharge(reason)) membershipHelpers.notify(c.customerNo, 'PAYMENT_FAILED', c.transactionID, { plan: c.targetPlanID });
    });
}

/**
 * Applies a verified payment to the membership, once. All of it commits together.
 * @param {dw.object.CustomObject} record - transaction
 * @param {string} reference - payment reference
 * @param {string} actor - audit actor
 */
function applyPayment(record, reference, actor) {
    Transaction.wrap(function () {
        var c = record.custom;
        var plan = planHelpers.getPlan(c.targetPlanID);
        var subscription = subscriptionHelpers.getSubscription(c.customerNo);
        if (!plan) throw membershipHelpers.abort('plan-unavailable');
        var now = new Date();
        var from = subscription.custom.status;
        if (from !== 'ACTIVE') {
            if (!subscriptionHelpers.canTransition(from, 'ACTIVE')) throw membershipHelpers.abort('invalid-transition');
            subscriptionHelpers.transition(subscription, 'ACTIVE', actor, c.transactionType.toLowerCase(), c.correlationID);
        }
        var s = subscription.custom;
        if (c.transactionType === 'PURCHASE') {
            s.startDate = now;
            s.expirationDate = membershipHelpers.addMonths(now, plan.validityMonths);
            s.creditBaseCents = c.amountCents;
            s.creditFromDate = now;
            s.benefitPeriodStart = now;
            s.benefitPeriodEnd = membershipHelpers.addMonths(now, 12);
            s.benefitCounters = '{}';
        } else if (c.transactionType === 'UPGRADE') {
            // The expiration date stays. The value of what remains is now the target cost.
            s.creditBaseCents = membershipHelpers.parseJson(c.quoteData, {}).targetCostCents;
            s.creditFromDate = now;
        } else {
            var unused = pricingHelpers.calculateUpgrade({ valueCents: s.creditBaseCents || 0, creditFromMs: s.creditFromDate.getTime(), termStartMs: s.startDate.getTime(), expiresMs: s.expirationDate.getTime(), targetAnnualCents: 0, nowMs: now.getTime() }).unusedCreditCents;
            var base = s.expirationDate.getTime() > now.getTime() ? s.expirationDate : now;
            s.expirationDate = membershipHelpers.addMonths(base, plan.validityMonths);
            s.startDate = base;
            s.creditBaseCents = unused + c.amountCents;
            s.creditFromDate = now;
        }
        s.planID = plan.planID;
        s.planVersion = plan.configurationVersion;
        s.paidThroughDate = s.expirationDate;
        s.renewalDate = s.autoRenewEnabled ? s.expirationDate : null;
        s.sourceOrderNo = c.orderNo;
        s.pendingTransactionID = null;
        s.updatedAt = now;
        setStatus(record, 'COMPLETED');
        c.paymentReference = reference || c.paymentReference;
        membershipHelpers.audit(c.transactionType.toLowerCase() + '-completed', actor, s.subscriptionID, c.sourcePlanID, plan.planID, c.correlationID);
        membershipHelpers.notify(c.customerNo, { PURCHASE: 'ACTIVATED', UPGRADE: 'UPGRADED', RENEWAL: 'RENEWED' }[c.transactionType], c.transactionID, { plan: plan.planName, date: membershipHelpers.toDay(s.expirationDate) });
    });
}

/**
 * Looks at the order's payment and changes the membership if it is verified. Safe to repeat: the
 * storefront calls this after placing the order and the reconciliation job calls it afterwards.
 * @param {dw.object.CustomObject} record - transaction
 * @param {dw.order.Order} order - its order
 * @param {string} actor - audit actor
 * @returns {string} COMPLETED, AWAITING_PAYMENT, FAILED or REVIEW
 */
function activateFromOrder(record, order, actor) {
    var c = record.custom;
    if (c.status === 'COMPLETED') return 'COMPLETED';
    if (order.custom.primeMembershipTransactionID !== c.transactionID || order.customerNo !== c.customerNo || order.orderNo !== c.orderNo) {
        log.error('Order {0} does not belong to transaction {1}', order.orderNo, c.transactionID);
        Transaction.wrap(function () { setStatus(record, 'REVIEW', 'order-mismatch'); });
        return 'REVIEW';
    }
    var payment = adapters.verifyOrderPayment(order);
    if (payment.status === 'PENDING' || payment.status === 'UNKNOWN') return c.status;
    if (payment.status === 'FAILED') {
        failTransaction(record, 'payment-failed', actor);
        return 'FAILED';
    }
    if (payment.amountCents !== c.totalCents || payment.currency !== c.currency) {
        log.error('Paid amount differs from the quote on transaction {0}', c.transactionID);
        Transaction.wrap(function () { setStatus(record, 'REVIEW', 'amount-mismatch'); });
        return 'REVIEW';
    }
    if (subscriptionHelpers.getSubscription(c.customerNo).custom.pendingTransactionID !== c.transactionID) {
        Transaction.wrap(function () { setStatus(record, 'REVIEW', 'superseded'); });
        return 'REVIEW';
    }
    try {
        applyPayment(record, payment.reference, actor);
    } catch (e) {
        // Paid but not applied: a person needs to look at it, the money must not vanish silently.
        log.error('Applying payment failed for transaction {0}: {1}', c.transactionID, e.errorCode || e.message);
        Transaction.wrap(function () { setStatus(record, 'REVIEW', 'apply-failed'); });
        return 'REVIEW';
    }
    return 'COMPLETED';
}

/**
 * Marks the membership as waiting for this payment, which also blocks a second purchase or upgrade.
 * @param {dw.object.CustomObject} record - transaction
 * @param {string} actor - audit actor
 */
function beginProcessing(record, actor) {
    Transaction.wrap(function () {
        var c = record.custom;
        var subscription = subscriptionHelpers.getSubscription(c.customerNo) || subscriptionHelpers.createSubscription(c.customerNo);
        setStatus(record, 'PROCESSING');
        var pending = PENDING_STATUS[c.transactionType];
        // The expiration job may not have run yet for a term that has already ended.
        if (!subscriptionHelpers.canTransition(subscription.custom.status, pending) && subscription.custom.status !== pending) subscriptionHelpers.transition(subscription, 'EXPIRED', actor, 'paid-through-date-passed', c.correlationID);
        if (subscription.custom.status !== pending) subscriptionHelpers.transition(subscription, pending, actor, c.transactionType.toLowerCase(), c.correlationID);
        subscription.custom.pendingTransactionID = c.transactionID;
    });
}

/**
 * Pays the quote through the site's payment processor and, when the payment is verified, changes
 * the membership. The result is the same for a repeated submit: the lock and the transaction
 * status stop a second payment.
 * @param {Object} req - request
 * @param {Object} paymentForm - primeMembershipPayment form
 * @param {dw.object.CustomObject} record - own transaction
 * @returns {Object} result with status, or fieldErrors and serverErrors for the form
 */
function placeOrder(req, paymentForm, record) {
    var c = record.custom;
    if (['PROCESSING', 'AWAITING_PAYMENT', 'COMPLETED', 'REVIEW'].indexOf(c.status) >= 0) return { error: false, status: c.status };
    if (!membershipHelpers.acquireLock(c.customerNo)) return membershipHelpers.errorResult('payment-pending');
    try {
        return placeLockedOrder(req, paymentForm, record);
    } finally {
        membershipHelpers.releaseLock(c.customerNo);
    }
}

/**
 * @param {Object} req - request
 * @param {Object} paymentForm - form
 * @param {dw.object.CustomObject} record - transaction
 * @returns {Object} result
 */
function placeLockedOrder(req, paymentForm, record) {
    var HookMgr = require('dw/system/HookMgr');
    var PaymentMgr = require('dw/order/PaymentMgr');
    var OrderMgr = require('dw/order/OrderMgr');
    var Order = require('dw/order/Order');
    var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
    var hooksHelper = require('*/cartridge/scripts/helpers/hooks');
    var c = record.custom;
    var actor = 'customer:' + c.customerNo;

    var checked = checkQuote(record);
    if (checked.error) return checked;
    var basket = getFeeBasket(record);
    if (!basket || !basket.billingAddress) return membershipHelpers.errorResult('quote-expired');
    var methodID = String(paymentForm.paymentMethod.value || '');
    var method = membershipHelpers.getListPreference('primeMembershipPaymentMethods').indexOf(methodID) >= 0 ? PaymentMgr.getPaymentMethod(methodID) : null;
    if (!method || !method.paymentProcessor) return membershipHelpers.errorResult('payment-method-unavailable');
    var processorID = method.paymentProcessor.ID.toLowerCase();
    if (!HookMgr.hasHook('app.payment.form.processor.' + processorID) || !HookMgr.hasHook('app.payment.processor.' + processorID)) return membershipHelpers.errorResult('payment-method-unavailable');
    var formResult = HookMgr.callHook('app.payment.form.processor.' + processorID, 'processForm', req, paymentForm, {});
    if (formResult.error) return { error: true, errorCode: 'invalid', errorMessage: null, fieldErrors: formResult.fieldErrors || {}, serverErrors: formResult.serverErrors || [] };
    var handled = HookMgr.callHook('app.payment.processor.' + processorID, 'Handle', basket, formResult.viewData.paymentInformation, methodID, req);
    if (handled.error) return { error: true, errorCode: 'invalid', errorMessage: null, fieldErrors: handled.fieldErrors || {}, serverErrors: handled.serverErrors || [] };

    Transaction.wrap(function () { require('*/cartridge/scripts/helpers/basketCalculationHelpers').calculateTotals(basket); });
    if (!basketMatchesQuote(basket, record)) return membershipHelpers.errorResult('price-changed');
    if (COHelpers.calculatePaymentTransaction(basket).error) return membershipHelpers.errorResult('checkout-unavailable');
    if (COHelpers.validatePayment(req, basket).error) return membershipHelpers.errorResult('payment-method-unavailable');

    try {
        beginProcessing(record, actor);
    } catch (e) {
        log.error('Transaction {0} could not start: {1}', c.transactionID, e.errorCode || e.message);
        return membershipHelpers.errorResult('checkout-unavailable');
    }

    var order = COHelpers.createOrder(basket);
    if (!order) {
        failTransaction(record, 'order-not-created', actor);
        return membershipHelpers.errorResult('checkout-unavailable');
    }
    Transaction.wrap(function () {
        c.orderNo = order.orderNo;
        order.custom.primeMembershipTransactionID = c.transactionID;
        c.taxCents = membershipHelpers.centsOf(order.totalTax);
        c.totalCents = membershipHelpers.centsOf(order.totalGrossPrice);
    });
    var payment = COHelpers.handlePayments(order, order.orderNo);
    if (payment.error) {
        failTransaction(record, 'payment-declined', actor);
        return membershipHelpers.errorResult('payment-declined');
    }
    var fraud = hooksHelper('app.fraud.detection', 'fraudDetection', basket, require('*/cartridge/scripts/hooks/fraudDetection').fraudDetection);
    if (fraud.status === 'fail') {
        Transaction.wrap(function () { OrderMgr.failOrder(order, false); });
        failTransaction(record, 'fraud-check-failed', actor);
        return membershipHelpers.errorResult('payment-declined');
    }
    // Not COHelpers.placeOrder: its loyalty wrapper would earn points on the membership fee.
    try {
        Transaction.wrap(function () {
            if (OrderMgr.placeOrder(order).isError()) throw membershipHelpers.abort('order-not-placed');
            order.setConfirmationStatus(fraud.status === 'flag' ? Order.CONFIRMATION_STATUS_NOTCONFIRMED : Order.CONFIRMATION_STATUS_CONFIRMED);
            order.setExportStatus(membershipHelpers.getPreference('primeMembershipExportFeeOrders') === true ? Order.EXPORT_STATUS_READY : Order.EXPORT_STATUS_NOTEXPORTED);
            setStatus(record, 'AWAITING_PAYMENT');
            var instruments = order.paymentInstruments.toArray();
            c.paymentReference = instruments.length && instruments[0].paymentTransaction ? instruments[0].paymentTransaction.transactionID : order.orderNo;
        });
    } catch (e) {
        log.error('Placing order {0} failed: {1}', order.orderNo, e.errorCode || e.message);
        Transaction.wrap(function () { OrderMgr.failOrder(order, false); });
        failTransaction(record, 'order-not-placed', actor);
        return membershipHelpers.errorResult('checkout-unavailable');
    }
    return { error: false, status: activateFromOrder(record, order, actor), orderNo: order.orderNo };
}

/**
 * Settles records whose outcome was not known when the request ended. Bounded and repeatable.
 * @param {number} limit - maximum records per kind
 * @returns {Object} counts
 */
function reconcileTransactions(limit) {
    var OrderMgr = require('dw/order/OrderMgr');
    var Order = require('dw/order/Order');
    var counts = { activated: 0, paymentFailed: 0, review: 0, expired: 0, refundFlagged: 0, stillPending: 0, errors: 0 };
    var actor = 'job:reconciliation';
    var now = Date.now();
    var settle = function (record) {
        try {
            var c = record.custom;
            var order = c.orderNo ? OrderMgr.getOrder(c.orderNo) : null;
            if (!order) {
                // No order after the lock expired means no payment was taken.
                if (c.status === 'PROCESSING' && now - c.updatedAt.getTime() > 30 * 60000) {
                    failTransaction(record, 'abandoned', actor);
                    counts.paymentFailed += 1;
                } else {
                    counts.stillPending += 1;
                }
                return;
            }
            var outcome = activateFromOrder(record, order, actor);
            if (outcome === 'COMPLETED') counts.activated += 1;
            else if (outcome === 'FAILED') counts.paymentFailed += 1;
            else if (outcome === 'REVIEW') counts.review += 1;
            else counts.stillPending += 1;
        } catch (e) {
            counts.errors += 1;
            log.error('Reconciling transaction {0} failed: {1}', record.custom.transactionID, e.errorCode || e.message);
        }
    };
    ['AWAITING_PAYMENT', 'PROCESSING'].forEach(function (status) {
        membershipHelpers.queryPage(TYPE, 'custom.status = {0}', 'custom.updatedAt asc', [status], 0, limit).items.forEach(settle);
    });
    membershipHelpers.queryPage(TYPE, 'custom.status = {0} AND custom.quoteExpiresAt < {1}', 'custom.quoteExpiresAt asc', ['QUOTED', new Date(now)], 0, limit).items.forEach(function (record) {
        Transaction.wrap(function () { setStatus(record, 'EXPIRED'); });
        counts.expired += 1;
    });
    // A cancelled order behind a completed payment takes the benefits away until refund handling is done.
    var state = membershipHelpers.getJobState('reconciliation');
    var since = state.cursor ? new Date(state.cursor) : new Date(now - REFUND_WATCH_DAYS * membershipHelpers.DAY);
    var page = membershipHelpers.queryPage(TYPE, 'custom.status = {0} AND custom.updatedAt >= {1}', 'custom.updatedAt asc', ['COMPLETED', since], 0, limit);
    page.items.forEach(function (record) {
        var order = record.custom.orderNo ? OrderMgr.getOrder(record.custom.orderNo) : null;
        // Flag each cancelled order once. Handling the refund must stay final on later runs.
        if (record.custom.transactionType === 'REFUND' || !order || order.status.value !== Order.ORDER_STATUS_CANCELLED || record.custom.reviewReason === 'order-cancelled') return;
        var subscription = subscriptionHelpers.getSubscription(record.custom.customerNo);
        Transaction.wrap(function () {
            record.custom.reviewReason = 'order-cancelled';
            if (subscription && subscriptionHelpers.canTransition(subscription.custom.status, 'REFUND_PENDING')) {
                subscriptionHelpers.transition(subscription, 'REFUND_PENDING', actor, 'order-cancelled:' + record.custom.orderNo, record.custom.correlationID);
                counts.refundFlagged += 1;
            }
        });
    });
    if (page.items.length < limit) {
        // Start over: a cancellation can arrive long after the transaction last changed.
        membershipHelpers.saveJobState('reconciliation', { cursor: new Date(now - REFUND_WATCH_DAYS * membershipHelpers.DAY).toISOString() });
    } else {
        membershipHelpers.saveJobState('reconciliation', { cursor: page.items[page.items.length - 1].custom.updatedAt.toISOString() });
    }
    return counts;
}

/**
 * Records a refund made in the payment system. The money itself moves there, not here. It lowers
 * the value later upgrades get credit for, and with endMembership it closes the membership.
 * @param {string} customerNo - customer
 * @param {string} orderNo - refunded order
 * @param {number} cents - refunded amount
 * @param {boolean} endMembership - take the benefits away now
 * @param {string} reference - refund reference in the payment system
 * @param {string} actor - audit actor
 * @returns {Object} result
 */
function recordRefund(customerNo, orderNo, cents, endMembership, reference, actor) {
    var subscription = subscriptionHelpers.getSubscription(customerNo);
    if (!subscription) return membershipHelpers.errorResult('no-membership');
    if (!(cents > 0) || !orderNo || !reference) return membershipHelpers.errorResult('invalid');
    var key = 'REFUND:' + customerNo + ':' + orderNo + ':' + reference;
    if (CustomObjectMgr.getCustomObject(TYPE, key)) return { error: false, transactionID: key };
    var sources = membershipHelpers.queryPage(TYPE, 'custom.orderNo = {0} AND custom.customerNo = {1}', null, [orderNo, customerNo], 0, 50).items;
    var paid = sources.filter(function (r) { return r.custom.status === 'COMPLETED' && r.custom.transactionType !== 'REFUND'; })[0];
    if (!paid) return membershipHelpers.errorResult('not-refundable');
    var refunded = sources.reduce(function (sum, r) { return r.custom.transactionType === 'REFUND' ? sum + r.custom.amountCents : sum; }, 0);
    if (cents + refunded > paid.custom.totalCents) return membershipHelpers.errorResult('invalid', { amount: 'above-paid' });
    try {
        Transaction.wrap(function () {
            var record = CustomObjectMgr.createCustomObject(TYPE, key);
            var c = record.custom;
            var s = subscription.custom;
            c.idempotencyKey = key;
            c.subscriptionID = s.subscriptionID;
            c.customerNo = customerNo;
            c.transactionType = 'REFUND';
            c.sourcePlanID = s.planID;
            c.targetPlanID = s.planID;
            c.amountCents = cents;
            c.taxCents = 0;
            c.totalCents = cents;
            c.currency = paid.custom.currency;
            c.orderNo = orderNo;
            c.paymentReference = String(reference).slice(0, 128);
            c.status = 'COMPLETED';
            c.createdAt = new Date();
            c.updatedAt = new Date();
            s.creditBaseCents = Math.max(0, (s.creditBaseCents || 0) - cents);
            s.updatedAt = new Date();
            membershipHelpers.audit('refund-recorded', actor, s.subscriptionID, null, String(cents), null);
            if (endMembership) {
                if (s.status !== 'REFUND_PENDING') subscriptionHelpers.transition(subscription, 'REFUND_PENDING', actor, 'refund');
                subscriptionHelpers.transition(subscription, 'CANCELLED', actor, 'refunded');
                s.paidThroughDate = new Date();
                s.autoRenewEnabled = false;
            } else if (s.status === 'REFUND_PENDING') {
                subscriptionHelpers.transition(subscription, 'ACTIVE', actor, 'partial-refund');
            }
        });
    } catch (e) {
        return membershipHelpers.errorResult(e.errorCode || 'general');
    }
    return { error: false, transactionID: key };
}

/**
 * Settles a transaction held for review. Applying still needs the order to be verified as paid
 * for the quoted amount, so a person can't grant a membership that nobody paid for.
 * @param {string} transactionID - transaction
 * @param {string} decision - apply or fail
 * @param {string} actor - audit actor
 * @returns {Object} result
 */
function resolveReview(transactionID, decision, actor) {
    var record = CustomObjectMgr.getCustomObject(TYPE, String(transactionID || ''));
    if (!record || record.custom.status !== 'REVIEW') return membershipHelpers.errorResult('not-found');
    var c = record.custom;
    if (decision === 'fail') {
        failTransaction(record, 'review-rejected', actor);
        return { error: false };
    }
    var order = c.orderNo ? require('dw/order/OrderMgr').getOrder(c.orderNo) : null;
    if (!order) return membershipHelpers.errorResult('not-paid');
    var payment = adapters.verifyOrderPayment(order);
    if (payment.status !== 'CAPTURED' || payment.amountCents !== c.totalCents || payment.currency !== c.currency) return membershipHelpers.errorResult('not-paid');
    try {
        Transaction.wrap(function () {
            var subscription = subscriptionHelpers.getSubscription(c.customerNo);
            if (subscription.custom.pendingTransactionID && subscription.custom.pendingTransactionID !== c.transactionID) throw membershipHelpers.abort('payment-pending');
            subscription.custom.pendingTransactionID = c.transactionID;
        });
        applyPayment(record, payment.reference, actor);
    } catch (e) {
        return membershipHelpers.errorResult(e.errorCode || 'general');
    }
    return { error: false };
}

/**
 * Renews consented memberships through the recurring payment adapter. Without the adapter, nothing
 * is charged whatever the auto-renew flag says.
 * @param {number} limit - maximum per run
 * @returns {Object} counts
 */
function processRenewals(limit) {
    var counts = { due: 0, charged: 0, pending: 0, declined: 0, skipped: 0 };
    if (!adapters.isAutoRenewAvailable()) return counts;
    var until = new Date(Date.now() + membershipHelpers.DAY);
    var rows = membershipHelpers.queryPage('PrimeMembershipSubscription', 'custom.autoRenewEnabled = {0} AND custom.status = {1} AND custom.paidThroughDate <= {2}', 'custom.paidThroughDate asc', [true, 'ACTIVE', until], 0, limit).items;
    rows.forEach(function (subscription) {
        var s = subscription.custom;
        counts.due += 1;
        var plan = planHelpers.getPlan(s.planID);
        if (s.pendingTransactionID || !s.autoRenewConsentAt || !plan || !plan.enabled || !plan.valid) {
            counts.skipped += 1;
            return;
        }
        var key = 'RENEWAL:' + s.customerNo + ':' + membershipHelpers.toDay(s.expirationDate);
        if (CustomObjectMgr.getCustomObject(TYPE, key)) {
            counts.skipped += 1;
            return;
        }
        var record = Transaction.wrap(function () {
            var created = CustomObjectMgr.createCustomObject(TYPE, key);
            var c = created.custom;
            c.idempotencyKey = key;
            c.subscriptionID = s.subscriptionID;
            c.customerNo = s.customerNo;
            c.transactionType = 'RENEWAL';
            c.sourcePlanID = s.planID;
            c.targetPlanID = s.planID;
            c.planVersion = plan.configurationVersion;
            c.amountCents = plan.annualPriceCents;
            c.taxCents = 0;
            c.totalCents = plan.annualPriceCents;
            c.currency = plan.currency;
            c.status = 'QUOTED';
            c.correlationID = membershipHelpers.createId('PMC');
            c.quoteExpiresAt = new Date(Date.now() + membershipHelpers.DAY);
            c.createdAt = new Date();
            c.updatedAt = new Date();
            return created;
        });
        beginProcessing(record, 'job:renewal');
        var answer = adapters.chargeRenewal({ transactionID: key, customerNo: s.customerNo, planID: s.planID, amountCents: plan.annualPriceCents, currency: plan.currency });
        if (answer.status === 'FAILED') {
            failTransaction(record, 'renewal-declined', 'job:renewal');
            counts.declined += 1;
            return;
        }
        Transaction.wrap(function () {
            setStatus(record, 'AWAITING_PAYMENT');
            record.custom.orderNo = answer.orderNo;
            record.custom.paymentReference = answer.reference;
        });
        if (answer.status === 'CAPTURED' && answer.amountCents >= plan.annualPriceCents && answer.currency === plan.currency) {
            Transaction.wrap(function () { record.custom.totalCents = answer.amountCents; });
            applyPayment(record, answer.reference, 'job:renewal');
            counts.charged += 1;
        } else {
            // Unknown or pending may still end up as money taken: reconciliation or a person settles it.
            counts.pending += 1;
        }
    });
    return counts;
}

/**
 * @param {dw.object.CustomObject} record - transaction
 * @returns {Object} storefront view
 */
function getTransactionView(record) {
    var c = record.custom;
    return {
        transactionID: c.transactionID,
        type: c.transactionType,
        status: c.status,
        sourcePlanID: c.sourcePlanID || '',
        targetPlanID: c.targetPlanID,
        amount: membershipHelpers.formatCents(c.amountCents),
        tax: membershipHelpers.formatCents(c.taxCents || 0),
        total: membershipHelpers.formatCents(c.totalCents),
        orderNo: c.orderNo || '',
        date: membershipHelpers.toDay(c.createdAt)
    };
}

/**
 * @param {string} customerNo - customer
 * @param {number} limit - page size
 * @returns {Object[]} the customer's paid records, newest first
 */
function getHistory(customerNo, limit) {
    return membershipHelpers.queryPage(TYPE, 'custom.customerNo = {0} AND custom.status != {1}', 'custom.createdAt desc', [customerNo, 'QUOTED'], 0, limit).items.map(getTransactionView);
}

module.exports = {
    FLOW: FLOW,
    getOwnTransaction: getOwnTransaction,
    getQuote: getQuote,
    startCheckout: startCheckout,
    getFeeBasket: getFeeBasket,
    checkQuote: checkQuote,
    saveBillingAddress: saveBillingAddress,
    placeOrder: placeOrder,
    activateFromOrder: activateFromOrder,
    failTransaction: failTransaction,
    reconcileTransactions: reconcileTransactions,
    recordRefund: recordRefund,
    resolveReview: resolveReview,
    processRenewals: processRenewals,
    getTransactionView: getTransactionView,
    getHistory: getHistory
};
