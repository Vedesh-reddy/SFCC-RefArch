'use strict';

/**
 * Wallet pages (dashboard, top-up, history, family, approvals, security) and the checkout
 * calls that apply the wallet to the basket. The wallet is always the signed-in customer's
 * own (or, for family payments, the wallet the customer is an active member of).
 */

var server = require('server');
var URLUtils = require('dw/web/URLUtils');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');

var LOGIN_SLOT = 8;
var FLASH = 'walletFlash';
var MEMBER_ACTIONS = { revoke: 'REVOKED', freeze: 'FROZEN', activate: 'ACTIVE' };

/**
 * Sends signed-out visitors to the login page, back to the wallet afterwards.
 * @param {Object} req - request
 * @param {Object} res - response
 * @param {Function} next - next middleware
 * @returns {void}
 */
function requireLogin(req, res, next) {
    if (!req.currentCustomer.profile) {
        res.redirect(URLUtils.url('Login-Show', 'rurl', LOGIN_SLOT));
        return this.done(req, res);
    }
    return next();
}

/**
 * @param {Object} req - request
 * @returns {string} session ID, used to bind codes and recognize known sessions
 */
function getSessionRef(req) {
    return String(req.session.raw.sessionID);
}

/**
 * @param {Object} req - request
 * @param {Object} flash - {message} or {error, fields}
 */
function setFlash(req, flash) {
    req.session.privacyCache.set(FLASH, JSON.stringify(flash));
}

/**
 * @param {Object} req - request
 * @returns {?Object} flash message, read once
 */
function takeFlash(req) {
    var raw = req.session.privacyCache.get(FLASH);
    req.session.privacyCache.set(FLASH, null);
    try {
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

/**
 * Saves the outcome of an action as the flash message and redirects.
 * @param {Object} req - request
 * @param {Object} res - response
 * @param {Object} result - helper result
 * @param {string} message - success message key (flash.<message>)
 * @param {dw.web.URL} successUrl - target after success
 * @param {dw.web.URL} [errorUrl] - target after an error (successUrl when omitted)
 */
function finish(req, res, result, message, successUrl, errorUrl) {
    if (result.error) {
        setFlash(req, { error: result.errorCode, fields: result.fields });
        res.redirect(errorUrl || successUrl);
    } else {
        setFlash(req, { message: message });
        res.redirect(successUrl);
    }
}

/**
 * JSON answer for the checkout script.
 * @param {Object} res - response
 * @param {Object} result - helper result
 * @param {Object} [data] - extra data on success
 */
function sendJson(res, result, data) {
    if (result.error) {
        res.setStatusCode(result.errorCode === 'unauthenticated' ? 401 : 400);
        res.json({ success: false, error: result.errorCode, message: result.errorMessage });
        return;
    }
    res.json(Object.assign({ success: true }, data || {}));
}

/**
 * @param {Object} req - request
 * @returns {Object} the owner's wallet context (created on first use), or an error result
 */
function getOwnerContext(req) {
    return require('*/cartridge/scripts/helpers/walletAccountHelpers').getWalletContext(req.currentCustomer.raw, true);
}

/**
 * @param {Object} req - request
 * @returns {?number} posted revision, or null
 */
function getRevision(req) {
    var value = req.form.revision;
    return value === undefined || value === '' ? null : Number(value);
}

/**
 * @param {Object} req - request
 * @returns {number} page offset from the query string
 */
function getOffset(req) {
    var n = Number(req.querystring.offset);
    return n > 0 && n < 100000 ? Math.floor(n) : 0;
}

/**
 * @param {Object} form - walletMember form
 * @returns {Object} member fields for walletFamilyHelpers (amounts in dollars)
 */
function getMemberData(form) {
    return {
        email: form.email.value,
        nickname: form.nickname.value,
        perOrderLimit: form.perOrderLimit.value,
        dailyLimit: form.dailyLimit.value,
        monthlyLimit: form.monthlyLimit.value,
        allowedCategoryIds: form.allowedCategoryIds.value || '',
        requireOwnerApproval: form.requireOwnerApproval.checked
    };
}

/**
 * @param {Object} form - SFRA form
 * @returns {Object} result for an invalid form
 */
function invalidForm(form) {
    var result = require('*/cartridge/scripts/helpers/walletHelpers').errorResult('invalid');
    result.fields = require('*/cartridge/scripts/formErrors').getFormErrors(form);
    return result;
}

/**
 * @param {string} status - top-up status
 * @returns {string} flash message key
 */
function getTopUpMessage(status) {
    return { CREDITED: 'topup-credited', FAILED: 'topup-failed', EXPIRED: 'topup-expired', REVERSED: 'topup-reversed' }[status] || 'topup-pending';
}

server.get('Show', server.middleware.https, requireLogin, csrfProtection.generateToken, function (req, res, next) {
    var walletHelpers = require('*/cartridge/scripts/helpers/walletHelpers');
    var accountHelpers = require('*/cartridge/scripts/helpers/walletAccountHelpers');
    var familyHelpers = require('*/cartridge/scripts/helpers/walletFamilyHelpers');
    var context = getOwnerContext(req);
    if (context.error) {
        res.setStatusCode(404);
        res.render('wallet/unavailable');
        return next();
    }
    var familyEnabled = familyHelpers.isFamilyEnabled();
    var membership = familyHelpers.getMemberContext(req.currentCustomer.raw);
    var flash = takeFlash(req);
    var topUpForm = server.forms.getForm('walletTopUp');
    var memberForm = server.forms.getForm('walletMember');
    // after a failed POST the session forms still hold what the customer typed
    if (!flash || !flash.error) {
        topUpForm.clear();
        memberForm.clear();
    }
    res.render('wallet/dashboard', {
        wallet: accountHelpers.getWalletView(context.wallet),
        history: accountHelpers.getHistory(context.walletId, null, 0, walletHelpers.getPreference('walletHistoryPageSize')),
        topUps: require('*/cartridge/scripts/helpers/walletTopUpHelpers').getTopUps(context, 0, 5),
        insights: accountHelpers.getMonthlyInsights(context.walletId, 6),
        familyEnabled: familyEnabled,
        members: familyEnabled ? familyHelpers.getMembers(context.walletId).map(familyHelpers.getMemberView) : [],
        approvals: familyEnabled ? require('*/cartridge/scripts/helpers/walletPaymentHelpers').getPendingApprovals(context) : [],
        allowance: membership.error ? null : familyHelpers.getAllowance(membership),
        suggested: walletHelpers.getListPreference('walletSuggestedTopUpCents').map(Number),
        topUpsAllowed: walletHelpers.canTopUp(),
        sandbox: walletHelpers.isSandbox(),
        unread: walletHelpers.getInbox(context.customerNo, 0, 1).unread,
        topUpForm: topUpForm,
        memberForm: memberForm,
        flash: flash
    });
    return next();
});

server.get('History', server.middleware.https, requireLogin, function (req, res, next) {
    var context = getOwnerContext(req);
    if (context.error) {
        res.setStatusCode(404);
        res.render('wallet/unavailable');
        return next();
    }
    var offset = getOffset(req);
    var type = /^[A-Z_]{3,20}$/.test(String(req.querystring.type || '')) ? String(req.querystring.type) : null;
    var pageSize = require('*/cartridge/scripts/helpers/walletHelpers').getPreference('walletHistoryPageSize');
    res.render('wallet/history', {
        history: require('*/cartridge/scripts/helpers/walletAccountHelpers').getHistory(context.walletId, type, offset, pageSize),
        offset: offset,
        pageSize: pageSize,
        type: type
    });
    return next();
});

server.post('TopUp', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var context = getOwnerContext(req);
    var topUpForm = server.forms.getForm('walletTopUp');
    var result = context;
    if (!context.error && !topUpForm.valid) result = invalidForm(topUpForm);
    else if (!context.error) result = require('*/cartridge/scripts/helpers/walletTopUpHelpers').startTopUp(context, topUpForm.customAmount.value || topUpForm.amount.value);
    if (result.error) {
        finish(req, res, result, null, URLUtils.url('Wallet-Show'));
    } else {
        res.redirect(result.redirectUrl);
    }
    return next();
});

server.get('SandboxPay', server.middleware.https, requireLogin, csrfProtection.generateToken, function (req, res, next) {
    var walletHelpers = require('*/cartridge/scripts/helpers/walletHelpers');
    var topUpHelpers = require('*/cartridge/scripts/helpers/walletTopUpHelpers');
    var context = getOwnerContext(req);
    var topUp = context.error ? null : topUpHelpers.getOwnTopUp(context, req.querystring.id);
    if (!walletHelpers.isSandbox() || !walletHelpers.canTopUp() || !topUp) {
        res.setStatusCode(404);
        res.render('wallet/unavailable');
        return next();
    }
    res.render('wallet/sandbox-pay', { topUp: topUpHelpers.getTopUpView(topUp) });
    return next();
});

server.post('SandboxComplete', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var context = getOwnerContext(req);
    var result = context.error ? context : require('*/cartridge/scripts/helpers/walletTopUpHelpers').decideSandboxPayment(context, String(req.form.id || ''), String(req.form.outcome || ''));
    finish(req, res, result, getTopUpMessage(result.status), URLUtils.url('Wallet-Show'));
    return next();
});

// The provider sends the customer back here; the wallet is credited only by the server-side check.
server.get('TopUpReturn', server.middleware.https, requireLogin, function (req, res, next) {
    var topUpHelpers = require('*/cartridge/scripts/helpers/walletTopUpHelpers');
    var context = getOwnerContext(req);
    var topUp = context.error ? null : topUpHelpers.getOwnTopUp(context, req.querystring.id);
    var result = topUp ? topUpHelpers.completeTopUp(topUp.custom.topUpId, context.actor) : { error: false };
    setFlash(req, { message: getTopUpMessage(result.status) });
    res.redirect(URLUtils.url('Wallet-Show'));
    return next();
});

server.post('Invite', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var context = getOwnerContext(req);
    var memberForm = server.forms.getForm('walletMember');
    var result = context;
    if (!context.error && !memberForm.valid) result = invalidForm(memberForm);
    else if (!context.error) result = require('*/cartridge/scripts/helpers/walletFamilyHelpers').invite(context, getMemberData(memberForm));
    finish(req, res, result, 'invitation-sent', URLUtils.url('Wallet-Show'));
    return next();
});

server.post('UpdateMember', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var context = getOwnerContext(req);
    var memberForm = server.forms.getForm('walletMember');
    var result = context;
    if (!context.error && !memberForm.valid) {
        result = invalidForm(memberForm);
    } else if (!context.error) {
        var data = getMemberData(memberForm);
        delete data.email;
        result = require('*/cartridge/scripts/helpers/walletFamilyHelpers').updateMember(context, String(req.form.customerNo || ''), data, getRevision(req));
    }
    finish(req, res, result, 'saved', URLUtils.url('Wallet-Show'));
    return next();
});

server.post('MemberStatus', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var context = getOwnerContext(req);
    var action = String(req.form.action || '');
    var result = context;
    if (!context.error && !MEMBER_ACTIONS[action]) result = require('*/cartridge/scripts/helpers/walletHelpers').errorResult('invalid', { action: 'invalid' });
    else if (!context.error) result = require('*/cartridge/scripts/helpers/walletFamilyHelpers').setMemberStatus(context, String(req.form.customerNo || ''), MEMBER_ACTIONS[action]);
    finish(req, res, result, 'member-' + action, URLUtils.url('Wallet-Show'));
    return next();
});

server.post('ApprovalDecision', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var context = getOwnerContext(req);
    var result = context.error ? context : require('*/cartridge/scripts/helpers/walletPaymentHelpers').decideOwnerApproval(context, String(req.form.approvalId || ''), String(req.form.decision || ''));
    finish(req, res, result, 'approval-saved', URLUtils.url('Wallet-Show'));
    return next();
});

server.get('Invitation', server.middleware.https, requireLogin, csrfProtection.generateToken, function (req, res, next) {
    var token = String(req.querystring.token || '');
    var valid = require('*/cartridge/scripts/helpers/walletFamilyHelpers').isFamilyEnabled() && !!require('*/cartridge/scripts/helpers/walletFamilyHelpers').getInvitation(token);
    res.render('wallet/invitation', { token: token, valid: valid, flash: takeFlash(req) });
    return next();
});

server.post('InvitationCode', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var token = String(req.form.token || '');
    var result = require('*/cartridge/scripts/helpers/walletFamilyHelpers').sendAcceptCode(req.currentCustomer.raw, token, getSessionRef(req));
    finish(req, res, result, 'code-sent', URLUtils.url('Wallet-Invitation', 'token', token));
    return next();
});

server.post('AcceptInvitation', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var token = String(req.form.token || '');
    var result = require('*/cartridge/scripts/helpers/walletFamilyHelpers').acceptInvitation(req.currentCustomer.raw, token, String(req.form.code || '').trim(), getSessionRef(req));
    finish(req, res, result, 'invitation-accepted', URLUtils.url('Wallet-Show'), URLUtils.url('Wallet-Invitation', 'token', token));
    return next();
});

server.post('DeclineInvitation', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var token = String(req.form.token || '');
    var result = require('*/cartridge/scripts/helpers/walletFamilyHelpers').declineInvitation(req.currentCustomer.raw, token);
    finish(req, res, result, 'invitation-declined', URLUtils.url('Wallet-Show'), URLUtils.url('Wallet-Invitation', 'token', token));
    return next();
});

server.post('Lock', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var context = getOwnerContext(req);
    var result = context.error ? context : require('*/cartridge/scripts/helpers/walletAccountHelpers').setWalletStatus(context.wallet, 'LOCKED', 'owner-request', context.actor);
    finish(req, res, result, 'wallet-locked', URLUtils.url('Wallet-Show'));
    return next();
});

// Only a lock the owner set can be lifted by the owner; risk and chargeback locks need support.
server.post('UnlockCode', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var walletHelpers = require('*/cartridge/scripts/helpers/walletHelpers');
    var context = getOwnerContext(req);
    var result = context;
    if (!context.error && context.wallet.custom.lockedReason !== 'owner-request') result = walletHelpers.errorResult('forbidden', { reason: 'support-unlock' });
    else if (!context.error) result = walletHelpers.sendCode('wallet-unlock', context.customerNo, getSessionRef(req), req.currentCustomer.profile.email, 'email.code.subject', {});
    finish(req, res, result, 'code-sent', URLUtils.url('Wallet-Show'));
    return next();
});

server.post('Unlock', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var walletHelpers = require('*/cartridge/scripts/helpers/walletHelpers');
    var accountHelpers = require('*/cartridge/scripts/helpers/walletAccountHelpers');
    var context = getOwnerContext(req);
    var result = context;
    if (!context.error && context.wallet.custom.lockedReason !== 'owner-request') {
        result = walletHelpers.errorResult('forbidden', { reason: 'support-unlock' });
    } else if (!context.error) {
        result = walletHelpers.checkCode('wallet-unlock', context.customerNo, String(req.form.code || '').trim(), getSessionRef(req));
        if (result.errorCode === 'code-locked') accountHelpers.recordLockedCode(context.wallet);
        if (!result.error) result = accountHelpers.setWalletStatus(context.wallet, 'ACTIVE', 'owner-unlock', context.actor);
    }
    finish(req, res, result, 'wallet-unlocked', URLUtils.url('Wallet-Show'));
    return next();
});

server.get('Notifications', server.middleware.https, requireLogin, csrfProtection.generateToken, function (req, res, next) {
    var offset = getOffset(req);
    res.render('wallet/notifications', {
        inbox: require('*/cartridge/scripts/helpers/walletHelpers').getInbox(req.currentCustomer.profile.customerNo, offset, 20),
        offset: offset,
        pageSize: 20,
        flash: takeFlash(req)
    });
    return next();
});

server.post('MarkRead', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var result = require('*/cartridge/scripts/helpers/walletHelpers').markNotificationRead(req.currentCustomer.profile.customerNo, String(req.form.id || ''));
    finish(req, res, result, 'saved', URLUtils.url('Wallet-Notifications'));
    return next();
});

// ---- Checkout (AJAX, JSON) -------------------------------------------------------------

/**
 * @param {dw.order.Basket} basket - basket
 * @returns {Object} amounts for the checkout panel
 */
function getSummary(basket) {
    var walletHelpers = require('*/cartridge/scripts/helpers/walletHelpers');
    var split = require('*/cartridge/scripts/helpers/walletPaymentHelpers').getSplit(basket);
    return {
        walletCents: split.walletCents,
        remainingCents: split.remainingCents,
        walletFormatted: walletHelpers.formatCents(split.walletCents),
        remainingFormatted: walletHelpers.formatCents(split.remainingCents),
        coversTotal: split.walletCents > 0 && split.remainingCents === 0
    };
}

/**
 * @returns {?dw.order.Basket} current basket
 */
function getBasket() {
    return require('dw/order/BasketMgr').getCurrentBasket();
}

server.post('Apply', server.middleware.https, requireLogin, csrfProtection.validateAjaxRequest, function (req, res, next) {
    var basket = getBasket();
    if (!basket) {
        sendJson(res, require('*/cartridge/scripts/helpers/walletHelpers').errorResult('not-found'));
        return next();
    }
    var result = require('*/cartridge/scripts/helpers/walletPaymentHelpers').applyToBasket(req.currentCustomer.raw, basket, { mode: req.form.mode, amount: req.form.amount }, getSessionRef(req));
    sendJson(res, result, result.error ? null : Object.assign(getSummary(basket), { requirement: result.requirement, approved: result.approved }));
    return next();
});

server.post('Remove', server.middleware.https, requireLogin, csrfProtection.validateAjaxRequest, function (req, res, next) {
    var basket = getBasket();
    if (!basket) {
        sendJson(res, require('*/cartridge/scripts/helpers/walletHelpers').errorResult('not-found'));
        return next();
    }
    require('*/cartridge/scripts/helpers/walletPaymentHelpers').removeFromBasket(basket);
    sendJson(res, { error: false }, getSummary(basket));
    return next();
});

server.post('PaymentCode', server.middleware.https, requireLogin, csrfProtection.validateAjaxRequest, function (req, res, next) {
    var paymentHelpers = require('*/cartridge/scripts/helpers/walletPaymentHelpers');
    var basket = getBasket();
    var payer = basket ? paymentHelpers.getBasketPayer(req.currentCustomer.raw, basket) : require('*/cartridge/scripts/helpers/walletHelpers').errorResult('not-found');
    var result = payer.error ? payer : paymentHelpers.sendPaymentCode(payer, basket.UUID, getSessionRef(req));
    sendJson(res, result, { sent: true });
    return next();
});

server.post('VerifyPaymentCode', server.middleware.https, requireLogin, csrfProtection.validateAjaxRequest, function (req, res, next) {
    var paymentHelpers = require('*/cartridge/scripts/helpers/walletPaymentHelpers');
    var basket = getBasket();
    var payer = basket ? paymentHelpers.getBasketPayer(req.currentCustomer.raw, basket) : require('*/cartridge/scripts/helpers/walletHelpers').errorResult('not-found');
    var result = payer.error ? payer : paymentHelpers.verifyPaymentCode(payer, basket.UUID, String(req.form.code || '').trim(), getSessionRef(req));
    sendJson(res, result, { approved: true });
    return next();
});

server.post('RequestApproval', server.middleware.https, requireLogin, csrfProtection.validateAjaxRequest, function (req, res, next) {
    var paymentHelpers = require('*/cartridge/scripts/helpers/walletPaymentHelpers');
    var basket = getBasket();
    var payer = basket ? paymentHelpers.getBasketPayer(req.currentCustomer.raw, basket) : require('*/cartridge/scripts/helpers/walletHelpers').errorResult('not-found');
    var result = payer.error ? payer : paymentHelpers.requestOwnerApproval(payer, basket.UUID);
    sendJson(res, result, { requested: true });
    return next();
});

// Account dashboard card (remote include from account/paymentCard); shows nothing until a wallet exists.
server.get('AccountCard', server.middleware.https, function (req, res, next) {
    var accountHelpers = require('*/cartridge/scripts/helpers/walletAccountHelpers');
    var context = req.currentCustomer.profile ? accountHelpers.getWalletContext(req.currentCustomer.raw, false) : { error: true };
    res.render('wallet/account-card', { wallet: context.error ? null : accountHelpers.getWalletView(context.wallet) });
    return next();
});

// Basket-specific, so never cached.
server.get('Advisor', function (req, res, next) {
    var advice = null;
    try {
        advice = require('*/cartridge/scripts/helpers/walletAdvisorHelpers').getAdvice(getBasket());
    } catch (e) {
        require('dw/system/Logger').getLogger('plugin-wallet', 'wallet-advisor').warn('Advisor failed: {0}', e.message);
    }
    res.render('wallet/advisor', { advice: advice });
    return next();
});

module.exports = server.exports();
