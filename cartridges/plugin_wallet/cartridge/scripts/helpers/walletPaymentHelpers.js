'use strict';

/**
 * Paying orders with the wallet, in full or together with a card.
 *
 *   apply (basket payment instrument) -> authorize at order placement (PURCHASE_HOLD)
 *   -> capture after the order is placed (PURCHASE_CAPTURE), or release when it fails
 *   (HOLD_RELEASE). Refunds credit the wallet (REFUND).
 *
 * The amount always comes from the server: the basket total and the wallet balance. The payer
 * is the signed-in customer (owner, or an active family member of the wallet).
 *
 * Step-up approval, bound to payer, basket and exact amount, used once:
 *   owner  - a code when the amount reaches walletStepUpThresholdCents or the session has not paid before
 *   member - owner approval when the owner asked for it, else a code when walletFamilyRequireCode
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');
var walletHelpers = require('*/cartridge/scripts/helpers/walletHelpers');
var walletAccountHelpers = require('*/cartridge/scripts/helpers/walletAccountHelpers');
var walletFamilyHelpers = require('*/cartridge/scripts/helpers/walletFamilyHelpers');

var log = Logger.getLogger('plugin-wallet', 'wallet-transaction');
var HOLD_FLOW = {
    ACTIVE: ['CAPTURED', 'RELEASED', 'REVIEW'],
    REVIEW: ['CAPTURED', 'RELEASED'],
    CAPTURED: [],
    RELEASED: []
};
var APPROVAL_FLOW = {
    PENDING: ['APPROVED', 'DECLINED', 'EXPIRED'],
    APPROVED: ['USED', 'EXPIRED'],
    USED: [],
    DECLINED: [],
    EXPIRED: []
};

/**
 * @param {dw.order.LineItemCtnr} ctnr - basket or order
 * @returns {dw.order.PaymentInstrument[]} wallet payment instruments
 */
function getWalletInstruments(ctnr) {
    var id = walletHelpers.getPreference('walletPaymentMethodId');
    return ctnr.paymentInstruments.toArray().filter(function (pi) { return pi.paymentMethod === id; });
}

/**
 * @param {dw.customer.Customer} customer - signed-in customer
 * @param {string} mode - OWN | FAMILY
 * @returns {Object} payer context {walletId, wallet, customerNo, member, actor}, or an error result
 */
function getPayerContext(customer, mode) {
    if (mode === 'FAMILY') return walletFamilyHelpers.getMemberContext(customer);
    var context = walletAccountHelpers.getWalletContext(customer, false);
    if (!context.error) context.member = null;
    return context;
}

/**
 * @param {dw.order.LineItemCtnr} ctnr - basket or order
 * @returns {string[]} product IDs being paid for
 */
function getProductIds(ctnr) {
    return ctnr.productLineItems.toArray().map(function (pli) { return pli.productID; });
}

/**
 * All limits for a payment of this payer from this wallet.
 * @param {Object} payer - payer context
 * @param {number} amountCents - payment
 * @param {string[]} productIds - products
 * @returns {Object} result
 */
function checkPaymentLimits(payer, amountCents, productIds) {
    var active = walletAccountHelpers.checkWalletActive(payer.wallet);
    if (active.error) return active;
    if (amountCents > (payer.wallet.custom.availableCents || 0)) return walletHelpers.errorResult('insufficient-funds');
    var limits = walletAccountHelpers.checkSpendLimits(payer.wallet, amountCents);
    if (limits.error || !payer.member) return limits;
    return walletFamilyHelpers.checkMemberLimits(payer.member, amountCents, productIds);
}

/**
 * Tells the wallet owner (once a day) that a payment hit a spending limit.
 * @param {Object} payer - payer context
 */
function notifyLimitReached(payer) {
    var key = 'limit:' + payer.walletId + ':' + new Date().toISOString().slice(0, 10);
    if (CustomObjectMgr.getCustomObject('WalletRequestKey', key)) return;
    Transaction.wrap(function () {
        var record = CustomObjectMgr.createCustomObject('WalletRequestKey', key);
        record.custom.requestHash = 'limit';
        record.custom.createdAt = new Date();
        walletHelpers.notify(payer.walletId, 'LIMIT_REACHED', {});
    });
}

/**
 * Optional merchant program: a session flag that a customer group rule can use to grant a
 * shipping promotion when the wallet pays at least a share of the merchandise. It never
 * changes the free-shipping threshold itself.
 * @param {dw.order.Basket} basket - basket
 * @param {number} walletCents - wallet amount (0 when removed)
 * @returns {boolean} true when the flag changed
 */
function updateShippingBenefit(basket, walletCents) {
    var eligible = false;
    if (walletHelpers.getPreference('walletShippingBenefitEnabled') === true && walletCents > 0) {
        var merchandise = walletHelpers.centsOf(basket.adjustedMerchandizeTotalPrice);
        eligible = merchandise > 0 && walletCents * 10000 >= merchandise * walletHelpers.getPreference('walletShippingBenefitMinShareBps');
    }
    var current = session.custom.walletShippingBenefit === true;
    session.custom.walletShippingBenefit = eligible;
    return current !== eligible;
}

/**
 * @param {dw.order.Basket} basket - basket
 * @returns {{totalCents: number, walletCents: number, remainingCents: number}} split of the basket total
 */
function getSplit(basket) {
    var total = walletHelpers.centsOf(basket.totalGrossPrice);
    var pi = getWalletInstruments(basket)[0];
    var wallet = pi ? Math.min(pi.custom.walletRequestedCents || 0, total) : 0;
    return { totalCents: total, walletCents: wallet, remainingCents: total - wallet };
}

/**
 * @param {Object} payer - {customerNo, member?, wallet}
 * @param {number} amountCents - payment
 * @param {string} sessionRef - session ID
 * @returns {string} NONE | CODE | OWNER
 */
function getApprovalRequirement(payer, amountCents, sessionRef) {
    if (payer.member) {
        if (payer.member.custom.requireOwnerApproval) return 'OWNER';
        return walletHelpers.getPreference('walletFamilyRequireCode') !== false ? 'CODE' : 'NONE';
    }
    if (amountCents >= walletHelpers.getPreference('walletStepUpThresholdCents')) return 'CODE';
    return walletAccountHelpers.isKnownSession(payer.wallet, sessionRef) ? 'NONE' : 'CODE';
}

/**
 * @param {string} payerCustomerNo - payer
 * @param {string} basketId - basket UUID
 * @param {number} amountCents - payment
 * @returns {?dw.object.CustomObject} usable approval for exactly this payment
 */
function findApproval(payerCustomerNo, basketId, amountCents) {
    var now = Date.now();
    return walletHelpers.queryPage('WalletApproval', 'custom.payerCustomerNo = {0} AND custom.basketHash = {1} AND custom.status = {2}', 'custom.createdAt desc', [payerCustomerNo, walletHelpers.sha256(basketId), 'APPROVED'], 0, 20).items
        .filter(function (a) { return a.custom.amountCents === amountCents && a.custom.expiresAt.getTime() > now; })[0] || null;
}

/**
 * Inside a transaction.
 * @param {Object} payer - payer context
 * @param {string} basketId - basket UUID
 * @param {number} amountCents - payment
 * @param {string} method - CODE | OWNER
 * @param {string} status - APPROVED | PENDING
 * @returns {dw.object.CustomObject} approval
 */
function createApproval(payer, basketId, amountCents, method, status) {
    var approval = CustomObjectMgr.createCustomObject('WalletApproval', walletHelpers.createId('APR'));
    var c = approval.custom;
    c.walletId = payer.walletId;
    c.payerCustomerNo = payer.customerNo;
    c.memberCustomerNo = payer.member ? payer.customerNo : null;
    c.basketHash = walletHelpers.sha256(basketId);
    c.amountCents = amountCents;
    c.method = method;
    c.status = status;
    c.expiresAt = new Date(Date.now() + walletHelpers.getPreference('walletApprovalTtlMinutes') * 60000);
    c.createdAt = new Date();
    return approval;
}

/**
 * @param {string} customerNo - payer
 * @param {string} basketId - basket UUID
 * @returns {string} code subject, bound to the basket
 */
function getCodeSubject(customerNo, basketId) {
    return customerNo + ':' + walletHelpers.sha256(basketId).slice(0, 16);
}

/**
 * Applies the wallet to the current basket.
 * @param {dw.customer.Customer} customer - signed-in customer
 * @param {dw.order.Basket} basket - basket
 * @param {Object} data - {mode: OWN|FAMILY, amount (dollars, optional: as much as possible)}
 * @param {string} sessionRef - session ID
 * @returns {Object} result with walletCents, remainingCents, requirement and approved
 */
function applyToBasket(customer, basket, data, sessionRef) {
    var mode = data && data.mode === 'FAMILY' ? 'FAMILY' : 'OWN';
    var payer = getPayerContext(customer, mode);
    if (payer.error) return payer;
    var totalCents = walletHelpers.centsOf(basket.totalGrossPrice);
    if (totalCents <= 0) return walletHelpers.errorResult('invalid', { basket: 'empty' });
    var available = payer.wallet.custom.availableCents || 0;
    var requested = data && data.amount !== undefined && data.amount !== '' && data.amount !== null ? walletHelpers.toCents(data.amount) : Math.min(available, totalCents);
    if (!requested) return walletHelpers.errorResult('invalid', { amount: 'invalid' });
    var amount = Math.min(requested, totalCents);
    if (payer.member) amount = Math.min(amount, payer.member.custom.perOrderLimitCents);
    var limits = checkPaymentLimits(payer, amount, getProductIds(basket));
    if (limits.error) {
        if (limits.errorCode === 'limit-reached') notifyLimitReached(payer);
        return limits;
    }
    var methodId = walletHelpers.getPreference('walletPaymentMethodId');
    Transaction.wrap(function () {
        getWalletInstruments(basket).forEach(function (pi) { basket.removePaymentInstrument(pi); });
        var pi = basket.createPaymentInstrument(methodId, walletHelpers.toMoney(amount));
        pi.custom.walletMode = mode;
        pi.custom.walletPayerCustomerNo = payer.customerNo;
        pi.custom.walletRequestedCents = amount;
        // Kept on the order instrument too, so the authorization finds the approval for this basket.
        pi.custom.walletBasketId = basket.UUID;
        if (updateShippingBenefit(basket, amount)) require('*/cartridge/scripts/helpers/basketCalculationHelpers').calculateTotals(basket);
    });
    var split = getSplit(basket);
    var requirement = getApprovalRequirement(payer, split.walletCents, sessionRef);
    return {
        error: false,
        walletCents: split.walletCents,
        remainingCents: split.remainingCents,
        requirement: requirement,
        approved: requirement === 'NONE' || !!findApproval(payer.customerNo, basket.UUID, split.walletCents)
    };
}

/**
 * @param {dw.order.Basket} basket - basket
 */
function removeFromBasket(basket) {
    Transaction.wrap(function () {
        getWalletInstruments(basket).forEach(function (pi) { basket.removePaymentInstrument(pi); });
        if (updateShippingBenefit(basket, 0)) require('*/cartridge/scripts/helpers/basketCalculationHelpers').calculateTotals(basket);
    });
}

/**
 * Splits the basket total between the wallet and one other instrument. Called inside the
 * base calculatePaymentTransaction transaction.
 * @param {dw.order.Basket} basket - basket
 * @returns {boolean} true when the split is complete (nothing left unpaid)
 */
function allocatePayments(basket) {
    var split = getSplit(basket);
    var walletPi = getWalletInstruments(basket)[0];
    var others = basket.paymentInstruments.toArray().filter(function (pi) { return pi !== walletPi; });
    walletPi.paymentTransaction.setAmount(walletHelpers.toMoney(split.walletCents));
    if (split.remainingCents === 0) {
        others.forEach(function (pi) { basket.removePaymentInstrument(pi); });
        return true;
    }
    if (others.length !== 1) return false;
    others[0].paymentTransaction.setAmount(walletHelpers.toMoney(split.remainingCents));
    return true;
}

/**
 * The payer of the wallet instrument in the basket, with the amount the wallet pays.
 * @param {dw.customer.Customer} customer - signed-in customer
 * @param {dw.order.Basket} basket - basket
 * @returns {Object} payer context with amountCents, or an error result
 */
function getBasketPayer(customer, basket) {
    var pi = getWalletInstruments(basket)[0];
    if (!pi) return walletHelpers.errorResult('not-found');
    var payer = getPayerContext(customer, pi.custom.walletMode);
    if (payer.error) return payer;
    if (payer.customerNo !== pi.custom.walletPayerCustomerNo) return walletHelpers.errorResult('payer-changed');
    payer.amountCents = getSplit(basket).walletCents;
    return payer;
}

/**
 * Checkout check before the order is created (CheckoutServices-PlaceOrder prepend).
 * @param {dw.customer.Customer} customer - signed-in customer
 * @param {dw.order.Basket} basket - basket
 * @param {string} sessionRef - session ID
 * @returns {Object} result; error codes are error.<code> keys
 */
function checkBeforePlaceOrder(customer, basket, sessionRef) {
    if (!getWalletInstruments(basket).length) return { error: false };
    // Switched off with a wallet instrument still in the basket: the panel (and its Remove
    // button) is gone, so drop the instrument here and send the shopper back to payment.
    if (!walletHelpers.isWalletEnabled()) {
        removeFromBasket(basket);
        return walletHelpers.errorResult('disabled');
    }
    var payer = getBasketPayer(customer, basket);
    if (payer.error) return payer;
    var limits = checkPaymentLimits(payer, payer.amountCents, getProductIds(basket));
    if (limits.error) return limits;
    if (getApprovalRequirement(payer, payer.amountCents, sessionRef) !== 'NONE' && !findApproval(payer.customerNo, basket.UUID, payer.amountCents)) {
        return walletHelpers.errorResult('approval-required');
    }
    return { error: false };
}

/**
 * Places the hold for one wallet payment instrument of a new order (payment processor
 * Authorize hook). Re-checks everything; the ledger refuses a negative balance.
 * @param {string} orderNo - order number
 * @param {dw.order.OrderPaymentInstrument} pi - wallet instrument
 * @param {dw.customer.Customer} customer - signed-in customer
 * @param {string} sessionRef - session ID
 * @returns {Object} result with holdId
 */
function authorizePayment(orderNo, pi, customer, sessionRef) {
    var basketId = String(pi.custom.walletBasketId || '');
    var amount = walletHelpers.centsOf(pi.paymentTransaction.amount);
    var payer = getPayerContext(customer, pi.custom.walletMode);
    if (payer.error) return payer;
    if (payer.customerNo !== pi.custom.walletPayerCustomerNo) return walletHelpers.errorResult('payer-changed');
    // Member category rules were checked against the basket just before the order was created.
    var limits = checkPaymentLimits(payer, amount, []);
    if (limits.error) return limits;
    var needs = getApprovalRequirement(payer, amount, sessionRef);
    var approval = needs === 'NONE' ? null : findApproval(payer.customerNo, basketId, amount);
    if (needs !== 'NONE' && !approval) return walletHelpers.errorResult('approval-required');
    var holdId = walletHelpers.createId('HOLD');
    try {
        Transaction.wrap(function () {
            if (approval) {
                approval.custom.status = 'USED';
                approval.custom.usedAt = new Date();
            }
            walletAccountHelpers.postTransaction({ key: 'HOLD:' + holdId, txType: 'PURCHASE_HOLD', walletId: payer.walletId, amountCents: amount, orderNo: orderNo, holdId: holdId, memberCustomerNo: payer.member ? payer.customerNo : null, actor: payer.actor });
            var hold = CustomObjectMgr.createCustomObject('WalletHold', holdId);
            var h = hold.custom;
            h.walletId = payer.walletId;
            h.orderNo = orderNo;
            h.amountCents = amount;
            h.capturedCents = 0;
            h.refundedCents = 0;
            h.status = 'ACTIVE';
            h.memberCustomerNo = payer.member ? payer.customerNo : null;
            h.approvalId = approval ? approval.custom.approvalId : null;
            h.expiresAt = new Date(Date.now() + walletHelpers.getPreference('walletHoldTtlMinutes') * 60000);
            h.createdAt = new Date();
            pi.paymentTransaction.setTransactionID(holdId);
            pi.custom.walletHoldId = holdId;
            walletAccountHelpers.rememberSession(payer.wallet, sessionRef);
            walletHelpers.logAudit({ entityType: 'HOLD', entityId: holdId, walletId: payer.walletId, action: 'HOLD', actor: payer.actor, to: 'ACTIVE', detail: { orderNo: orderNo, amountCents: amount } });
        });
    } catch (e) {
        log.warn('Wallet hold for order {0} refused: {1}', orderNo, e.errorCode || e.message);
        return walletHelpers.toErrorResult(e);
    }
    return { error: false, holdId: holdId };
}

/**
 * @param {string} holdId - hold
 * @param {Object} by - who captured
 * @returns {Object} result; captured is true when the hold is captured (now or before)
 */
function captureHold(holdId, by) {
    var hold = CustomObjectMgr.getCustomObject('WalletHold', String(holdId));
    if (!hold) return walletHelpers.errorResult('not-found');
    var c = hold.custom;
    if (c.status === 'CAPTURED') return { error: false, captured: true };
    if (!walletHelpers.canMove(HOLD_FLOW, c.status, 'CAPTURED')) return walletHelpers.errorResult('not-allowed-now');
    try {
        Transaction.wrap(function () {
            walletAccountHelpers.postTransaction({ key: 'CAPTURE:' + holdId, txType: 'PURCHASE_CAPTURE', walletId: c.walletId, amountCents: c.amountCents, orderNo: c.orderNo, holdId: holdId, memberCustomerNo: c.memberCustomerNo, actor: by });
            c.status = 'CAPTURED';
            c.capturedCents = c.amountCents;
            c.capturedAt = new Date();
            walletHelpers.logAudit({ entityType: 'HOLD', entityId: holdId, walletId: c.walletId, action: 'CAPTURE', actor: by, to: 'CAPTURED' });
        });
    } catch (e) {
        return walletHelpers.toErrorResult(e);
    }
    return { error: false, captured: true };
}

/**
 * @param {string} holdId - hold
 * @param {string} reason - why
 * @param {Object} by - who released
 * @returns {Object} result; released is false when the hold was already captured
 */
function releaseHold(holdId, reason, by) {
    var hold = CustomObjectMgr.getCustomObject('WalletHold', String(holdId));
    if (!hold) return walletHelpers.errorResult('not-found');
    var c = hold.custom;
    if (c.status === 'RELEASED') return { error: false, released: true };
    if (c.status === 'CAPTURED') return { error: false, released: false };
    try {
        Transaction.wrap(function () {
            walletAccountHelpers.postTransaction({ key: 'RELEASE:' + holdId, txType: 'HOLD_RELEASE', walletId: c.walletId, amountCents: c.amountCents, orderNo: c.orderNo, holdId: holdId, actor: by, reason: reason });
            c.status = 'RELEASED';
            c.releasedAt = new Date();
            c.releaseReason = String(reason || '').slice(0, 100);
            walletHelpers.logAudit({ entityType: 'HOLD', entityId: holdId, walletId: c.walletId, action: 'RELEASE', actor: by, to: 'RELEASED', reason: reason });
        });
    } catch (e) {
        return walletHelpers.toErrorResult(e);
    }
    return { error: false, released: true };
}

/**
 * After CheckoutServices-PlaceOrder: captures the holds of a placed order, or releases them
 * when placement failed. Holds left here are settled by the hold job.
 * @param {string[]} holdIds - holds created in this request
 * @param {Object} viewData - PlaceOrder response data
 * @returns {{captured: number, released: number}} counts
 */
function settleAfterPlaceOrder(holdIds, viewData) {
    var counts = { captured: 0, released: 0 };
    var by = walletHelpers.actor('SYSTEM', 'place-order');
    if (!holdIds || !holdIds.length) return counts;
    if (viewData.error || !viewData.orderID) {
        holdIds.forEach(function (id) { if (releaseHold(id, 'order-not-placed', by).released) counts.released += 1; });
        return counts;
    }
    var Order = require('dw/order/Order');
    var order = require('dw/order/OrderMgr').getOrder(viewData.orderID, viewData.orderToken);
    var placed = order && [Order.ORDER_STATUS_NEW, Order.ORDER_STATUS_OPEN, Order.ORDER_STATUS_COMPLETED].indexOf(order.status.value) >= 0;
    if (!placed) return counts;
    holdIds.forEach(function (id) { if (captureHold(id, by).captured) counts.captured += 1; });
    var walletTotal = getWalletInstruments(order).reduce(function (sum, pi) { return sum + walletHelpers.centsOf(pi.paymentTransaction.amount); }, 0);
    if (walletTotal >= walletHelpers.centsOf(order.totalGrossPrice)) {
        // Only an order paid entirely by the wallet is known to be fully paid here.
        Transaction.wrap(function () { order.setPaymentStatus(Order.PAYMENT_STATUS_PAID); });
    }
    return counts;
}

/**
 * Credits a refund to the wallet. WALLET_PORTION refunds what a hold captured; STORE_CREDIT
 * credits a card-paid amount as wallet credit, only when the merchant allows it.
 * @param {Object} data - {refundId, kind, holdId|orderNo, walletId (STORE_CREDIT), amountCents, reason}
 * @param {Object} by - admin or integration
 * @returns {Object} result with refundedCents, journalId and replayed
 */
function refundToWallet(data, by) {
    var refundId = String((data && data.refundId) || '');
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(refundId)) return walletHelpers.errorResult('invalid', { refundId: 'invalid' });
    var amount = Number(data.amountCents);
    if (!walletAccountHelpers.isCents(amount) || amount <= 0) return walletHelpers.errorResult('invalid', { amountCents: 'invalid' });
    var key = 'REFUND:' + refundId;
    var existing = CustomObjectMgr.getCustomObject('WalletJournal', key);
    if (existing) return { error: false, refundedCents: existing.custom.amountCents, journalId: key, replayed: true };
    var hold = null;
    var walletId;
    if (data.kind === 'STORE_CREDIT') {
        if (walletHelpers.getPreference('walletCardRefundToWalletAllowed') !== true) return walletHelpers.errorResult('forbidden', { reason: 'store-credit-disabled' });
        walletId = String(data.walletId || '');
        if (!CustomObjectMgr.getCustomObject('WalletAccount', walletId)) return walletHelpers.errorResult('not-found');
    } else {
        hold = data.holdId ? CustomObjectMgr.getCustomObject('WalletHold', String(data.holdId)) : null;
        if (!hold && data.orderNo) hold = walletHelpers.queryPage('WalletHold', 'custom.orderNo = {0} AND custom.status = {1}', null, [String(data.orderNo), 'CAPTURED'], 0, 1).items[0] || null;
        if (!hold || hold.custom.status !== 'CAPTURED') return walletHelpers.errorResult('not-found');
        if (amount > hold.custom.capturedCents - (hold.custom.refundedCents || 0)) return walletHelpers.errorResult('invalid', { amountCents: 'exceeds-captured' });
        walletId = hold.custom.walletId;
    }
    var posted;
    try {
        Transaction.wrap(function () {
            posted = walletAccountHelpers.postTransaction({ key: key, txType: 'REFUND', walletId: walletId, amountCents: amount, orderNo: hold ? hold.custom.orderNo : data.orderNo, holdId: hold ? hold.custom.holdId : null, actor: by, reason: data.reason });
            if (hold) hold.custom.refundedCents = (hold.custom.refundedCents || 0) + amount;
            walletHelpers.logAudit({ entityType: 'REFUND', entityId: refundId, walletId: walletId, action: data.kind === 'STORE_CREDIT' ? 'STORE_CREDIT' : 'REFUND', actor: by, detail: { amountCents: amount } });
            walletHelpers.notify(walletId, 'REFUND_CREDITED', { amount: walletHelpers.formatCents(amount) });
        });
    } catch (e) {
        return walletHelpers.toErrorResult(e);
    }
    var since = new Date(Date.now() - walletHelpers.getPreference('walletRefundAbuseWindowDays') * walletAccountHelpers.DAY);
    var refunds = walletHelpers.queryCount('WalletJournal', 'custom.walletId = {0} AND custom.txType = {1} AND custom.createdAt >= {2}', [walletId, 'REFUND', since]);
    if (refunds >= walletHelpers.getPreference('walletRefundAbuseCount')) {
        Transaction.wrap(function () {
            walletHelpers.openCase({ caseType: 'REFUND_ABUSE', walletId: walletId, severity: 'MEDIUM', detail: { refunds: refunds }, dedupeKey: 'refunds:' + walletId });
        });
    }
    return { error: false, refundedCents: amount, journalId: posted.journal.custom.journalId, replayed: false };
}

/**
 * E-mails a payment code to the payer's own account address.
 * @param {Object} payer - payer context (with amountCents)
 * @param {string} basketId - basket UUID
 * @param {string} sessionRef - session ID
 * @returns {Object} result
 */
function sendPaymentCode(payer, basketId, sessionRef) {
    var customer = require('dw/customer/CustomerMgr').getCustomerByCustomerNumber(payer.customerNo);
    var email = customer && customer.profile ? customer.profile.email : null;
    return walletHelpers.sendCode('wallet-pay', getCodeSubject(payer.customerNo, basketId), sessionRef, email, 'email.paycode.subject', { amount: walletHelpers.formatCents(payer.amountCents) });
}

/**
 * @param {Object} payer - payer context (with amountCents)
 * @param {string} basketId - basket UUID
 * @param {string} code - entered code
 * @param {string} sessionRef - session ID
 * @returns {Object} result with approvalId
 */
function verifyPaymentCode(payer, basketId, code, sessionRef) {
    var checked = walletHelpers.checkCode('wallet-pay', getCodeSubject(payer.customerNo, basketId), code, sessionRef);
    if (checked.errorCode === 'code-locked') walletAccountHelpers.recordLockedCode(payer.wallet);
    if (checked.error) return checked;
    var id;
    Transaction.wrap(function () {
        id = createApproval(payer, basketId, payer.amountCents, 'CODE', 'APPROVED').custom.approvalId;
        walletHelpers.logAudit({ entityType: 'APPROVAL', entityId: id, walletId: payer.walletId, action: 'CODE_VERIFIED', actor: payer.actor, detail: { amountCents: payer.amountCents } });
    });
    return { error: false, approvalId: id };
}

/**
 * A member asks the owner to approve this payment.
 * @param {Object} payer - member payer context (with amountCents)
 * @param {string} basketId - basket UUID
 * @returns {Object} result with approvalId
 */
function requestOwnerApproval(payer, basketId) {
    if (!payer.member) return walletHelpers.errorResult('invalid', { mode: 'not-a-member' });
    if (!walletHelpers.checkRateLimit('owner-approval', payer.customerNo, 10, 3600)) return walletHelpers.errorResult('rate-limited');
    var id;
    Transaction.wrap(function () {
        id = createApproval(payer, basketId, payer.amountCents, 'OWNER', 'PENDING').custom.approvalId;
        walletHelpers.logAudit({ entityType: 'APPROVAL', entityId: id, walletId: payer.walletId, action: 'REQUESTED', actor: payer.actor, detail: { amountCents: payer.amountCents } });
        walletHelpers.notify(payer.walletId, 'FAMILY_PAYMENT_REQUEST', { nickname: payer.member.custom.nickname, amount: walletHelpers.formatCents(payer.amountCents) });
    });
    return { error: false, approvalId: id };
}

/**
 * @param {Object} context - owner wallet context
 * @param {string} approvalId - approval
 * @param {string} decision - APPROVED | DECLINED
 * @returns {Object} result
 */
function decideOwnerApproval(context, approvalId, decision) {
    var approval = CustomObjectMgr.getCustomObject('WalletApproval', String(approvalId || ''));
    if (!approval || approval.custom.walletId !== context.walletId || approval.custom.method !== 'OWNER') return walletHelpers.errorResult('not-found');
    if (['APPROVED', 'DECLINED'].indexOf(decision) < 0) return walletHelpers.errorResult('invalid', { decision: 'invalid' });
    if (approval.custom.expiresAt.getTime() < Date.now() || !walletHelpers.canMove(APPROVAL_FLOW, approval.custom.status, decision)) return walletHelpers.errorResult('not-allowed-now');
    Transaction.wrap(function () {
        approval.custom.status = decision;
        approval.custom.decidedAt = new Date();
        walletHelpers.logAudit({ entityType: 'APPROVAL', entityId: approvalId, walletId: context.walletId, action: decision, actor: context.actor });
        walletHelpers.notify(approval.custom.memberCustomerNo, decision === 'APPROVED' ? 'FAMILY_PAYMENT_APPROVED' : 'FAMILY_PAYMENT_DECLINED', { amount: walletHelpers.formatCents(approval.custom.amountCents) });
    });
    return { error: false };
}

/**
 * @param {Object} context - owner wallet context
 * @returns {Object[]} pending member requests
 */
function getPendingApprovals(context) {
    var now = Date.now();
    return walletHelpers.queryPage('WalletApproval', 'custom.walletId = {0} AND custom.status = {1} AND custom.method = {2}', 'custom.createdAt desc', [context.walletId, 'PENDING', 'OWNER'], 0, 20).items
        .filter(function (a) { return a.custom.expiresAt.getTime() > now; })
        .map(function (a) {
            var member = CustomObjectMgr.getCustomObject('WalletMember', a.custom.memberCustomerNo);
            return { approvalId: a.custom.approvalId, amountCents: a.custom.amountCents, nickname: member ? member.custom.nickname : '', createdAt: a.custom.createdAt, expiresAt: a.custom.expiresAt };
        });
}

/**
 * Job helper: expires approvals past their time.
 * @param {number} limit - maximum approvals
 * @returns {number} expired
 */
function expireApprovals(limit) {
    var due = walletHelpers.queryPage('WalletApproval', '(custom.status = {0} OR custom.status = {1}) AND custom.expiresAt <= {2}', null, ['PENDING', 'APPROVED', new Date()], 0, limit).items;
    due.forEach(function (a) {
        Transaction.wrap(function () { a.custom.status = 'EXPIRED'; });
    });
    return due.length;
}

/**
 * Job helper: settles holds by the order status. Placed orders are captured, failed or
 * cancelled ones released; a hold whose order is still unplaced after its time goes to
 * REVIEW (money may be moving) instead of being released automatically.
 * @param {number} limit - maximum holds
 * @returns {{captured: number, released: number, review: number, failed: number}} counts
 */
function processHolds(limit) {
    var Order = require('dw/order/Order');
    var OrderMgr = require('dw/order/OrderMgr');
    var startedAt = new Date();
    var counts = { captured: 0, released: 0, review: 0, failed: 0 };
    var by = walletHelpers.actor('SYSTEM', 'hold-job');
    walletHelpers.queryPage('WalletHold', 'custom.status = {0} OR custom.status = {1}', 'custom.createdAt asc', ['ACTIVE', 'REVIEW'], 0, limit).items.forEach(function (h) {
        var c = h.custom;
        var order = OrderMgr.getOrder(c.orderNo);
        var status = order ? order.status.value : null;
        var result = { error: false };
        if (status === Order.ORDER_STATUS_NEW || status === Order.ORDER_STATUS_OPEN || status === Order.ORDER_STATUS_COMPLETED) {
            result = captureHold(c.holdId, by);
            if (result.captured) counts.captured += 1;
        } else if (status === Order.ORDER_STATUS_FAILED || status === Order.ORDER_STATUS_CANCELLED || (!order && c.expiresAt.getTime() < Date.now())) {
            result = releaseHold(c.holdId, order ? 'order-' + String(status) : 'order-missing', by);
            if (result.released) counts.released += 1;
        } else if (c.status === 'ACTIVE' && c.expiresAt.getTime() < Date.now()) {
            Transaction.wrap(function () {
                c.status = 'REVIEW';
                walletHelpers.openCase({ caseType: 'HOLD_REVIEW', walletId: c.walletId, entityId: c.holdId, severity: 'HIGH', detail: { orderNo: c.orderNo }, dedupeKey: 'hold:' + c.holdId });
            });
            counts.review += 1;
        }
        if (result.error) {
            counts.failed += 1;
            log.error('Hold {0} could not be settled: {1}', c.holdId, result.errorCode);
        }
    });
    counts.notified = notifyCapturedHolds(limit, startedAt);
    return counts;
}

/**
 * Payment notifications for holds captured since the last run. They are sent here and not at
 * capture, because a storefront request may create at most 10 custom objects
 * (api.dw.object.CustomObjectMgr.create()@SF) and place-order already writes the ledger.
 * @param {number} limit - maximum holds
 * @param {Date} firstRunFrom - on the first run, notify holds captured from this time on
 * @returns {number} holds notified
 */
function notifyCapturedHolds(limit, firstRunFrom) {
    var second = function (date) { return Math.floor(date.getTime() / 1000) * 1000; };
    var state = walletHelpers.getJobState('capture-notifications');
    // queries compare datetimes to the second, so the cursor is a whole second plus the holds
    // already notified within it
    var after = new Date(second(state.after ? new Date(state.after) : firstRunFrom));
    var done = state.ids || [];
    var holds = walletHelpers.queryPage('WalletHold', 'custom.status = {0} AND custom.capturedAt >= {1}', 'custom.capturedAt asc', ['CAPTURED', after], 0, limit + done.length).items
        .filter(function (h) { return done.indexOf(h.custom.holdId) < 0; })
        .slice(0, limit);
    holds.forEach(function (h) {
        var c = h.custom;
        var params = { amount: walletHelpers.formatCents(c.capturedCents || c.amountCents), orderNo: c.orderNo };
        Transaction.wrap(function () {
            walletHelpers.notify(c.walletId, c.memberCustomerNo ? 'FAMILY_PAYMENT_MADE' : 'WALLET_PAYMENT', params);
            if (c.memberCustomerNo) walletHelpers.notify(c.memberCustomerNo, 'WALLET_PAYMENT', params);
        });
    });
    if (holds.length || !state.after) {
        var last = holds.length ? second(holds[holds.length - 1].custom.capturedAt) : after.getTime();
        var ids = holds.filter(function (h) { return second(h.custom.capturedAt) === last; }).map(function (h) { return h.custom.holdId; });
        walletHelpers.saveJobState('capture-notifications', { after: new Date(last).toISOString(), ids: last === after.getTime() ? done.concat(ids) : ids });
    }
    return holds.length;
}

/**
 * Data for the wallet panel on the billing step. Shows the owner's own balance; for a
 * family member only the member's remaining allowance, never the owner's balance.
 * @param {dw.customer.Customer} customer - current customer
 * @param {dw.order.Basket} basket - current basket
 * @returns {?Object} panel model, or null when the wallet cannot be offered
 */
function getCheckoutPanel(customer, basket) {
    var customerNo = walletAccountHelpers.getCustomerNo(customer);
    if (!walletHelpers.isWalletEnabled() || !basket || !customerNo) return null;
    var wallet = CustomObjectMgr.getCustomObject('WalletAccount', customerNo);
    var own = wallet && wallet.custom.status === 'ACTIVE' && wallet.custom.availableCents > 0
        ? { availableCents: wallet.custom.availableCents, availableFormatted: walletHelpers.formatCents(wallet.custom.availableCents) } : null;
    var family = null;
    var member = walletFamilyHelpers.getMemberContext(customer);
    if (!member.error) {
        var allowance = walletFamilyHelpers.getAllowance(member);
        family = { nickname: allowance.nickname, perOrderFormatted: walletHelpers.formatCents(allowance.perOrderLimitCents), remainingTodayFormatted: walletHelpers.formatCents(allowance.remainingTodayCents) };
    }
    if (!own && !family) return null;
    var pi = getWalletInstruments(basket)[0];
    var split = getSplit(basket);
    return {
        own: own,
        family: family,
        applied: pi ? { mode: pi.custom.walletMode, amountFormatted: walletHelpers.formatCents(split.walletCents), remainingFormatted: walletHelpers.formatCents(split.remainingCents), coversTotal: split.remainingCents === 0 } : null,
        methodId: walletHelpers.getPreference('walletPaymentMethodId'),
        sandbox: walletHelpers.isSandbox()
    };
}

module.exports = {
    HOLD_FLOW: HOLD_FLOW,
    APPROVAL_FLOW: APPROVAL_FLOW,
    getWalletInstruments: getWalletInstruments,
    getPayerContext: getPayerContext,
    getBasketPayer: getBasketPayer,
    getSplit: getSplit,
    getApprovalRequirement: getApprovalRequirement,
    findApproval: findApproval,
    applyToBasket: applyToBasket,
    removeFromBasket: removeFromBasket,
    allocatePayments: allocatePayments,
    checkBeforePlaceOrder: checkBeforePlaceOrder,
    authorizePayment: authorizePayment,
    captureHold: captureHold,
    releaseHold: releaseHold,
    settleAfterPlaceOrder: settleAfterPlaceOrder,
    refundToWallet: refundToWallet,
    sendPaymentCode: sendPaymentCode,
    verifyPaymentCode: verifyPaymentCode,
    requestOwnerApproval: requestOwnerApproval,
    decideOwnerApproval: decideOwnerApproval,
    getPendingApprovals: getPendingApprovals,
    expireApprovals: expireApprovals,
    processHolds: processHolds,
    updateShippingBenefit: updateShippingBenefit,
    getCheckoutPanel: getCheckoutPanel
};
