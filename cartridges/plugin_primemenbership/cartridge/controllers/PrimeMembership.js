'use strict';

/**
 * Membership pages: plans, joining, upgrading, renewing, the member dashboard and cancelling. Every
 * action works on the signed-in customer's own records, with amounts from the server.
 */

var server = require('server');
var URLUtils = require('dw/web/URLUtils');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var membershipHelpers = require('*/cartridge/scripts/helpers/membershipHelpers');
var planHelpers = require('*/cartridge/scripts/helpers/membershipPlanHelpers');

var LOGIN_SLOT = 10;
var FLASH = 'primeMembershipFlash';
var MAX_LABEL_PRODUCTS = 48;

/**
 * @param {Object} req - request
 * @returns {?string} the customer number of a signed-in registered customer
 */
function getCustomerNo(req) {
    return req.currentCustomer.profile && req.currentCustomer.raw.authenticated ? req.currentCustomer.profile.customerNo : null;
}

/**
 * Renders the unavailable page while the plugin is off.
 * @param {Object} req - request
 * @param {Object} res - response
 * @param {Function} next - next middleware
 * @returns {void}
 */
function requireEnabled(req, res, next) {
    if (planHelpers.isEnabled()) return next();
    res.setStatusCode(503);
    res.render('membership/unavailable');
    return this.done(req, res);
}

/**
 * Sends signed-out visitors to the login page, back to the dashboard afterwards.
 * @param {Object} req - request
 * @param {Object} res - response
 * @param {Function} next - next middleware
 * @returns {void}
 */
function requireLogin(req, res, next) {
    if (!getCustomerNo(req)) {
        res.redirect(URLUtils.url('Login-Show', 'rurl', LOGIN_SLOT));
        return this.done(req, res);
    }
    return next();
}

/**
 * @param {Object} req - request
 * @param {Object} flash - {message} or {error}
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
    return membershipHelpers.parseJson(raw, null);
}

/**
 * @param {Object} req - request
 * @param {Object} res - response
 * @param {Object} result - helper result
 * @param {dw.web.URL} url - target
 * @param {string} [message] - success message key
 */
function finish(req, res, result, url, message) {
    setFlash(req, result.error ? { error: result.errorCode } : { message: message || 'saved' });
    res.redirect(url);
}

/**
 * @param {string} id - content asset
 * @returns {?string} markup of an online asset
 */
function getContentBody(id) {
    var asset = id ? require('dw/content/ContentMgr').getContent(id) : null;
    return asset && asset.isOnline() && asset.custom.body ? asset.custom.body.markup : null;
}

/**
 * @returns {Object} the terms and FAQ shown on plan pages
 */
function getLegalContent() {
    return {
        terms: getContentBody(membershipHelpers.getPreference('primeMembershipTermsAssetId')),
        faq: getContentBody(membershipHelpers.getPreference('primeMembershipFaqAssetId'))
    };
}

/**
 * @param {?string} customerNo - shopper
 * @returns {?Object} the shopper's plan for the "your plan" indicator and buttons
 */
function getCurrentTier(customerNo) {
    return customerNo ? require('*/cartridge/scripts/helpers/membershipBenefitHelpers').getMembershipTier(customerNo) : null;
}

/**
 * @param {?Object} tier - shopper's plan
 * @param {Object} planView - plan view
 * @returns {Object} plan view with its call to action
 */
function withAction(tier, planView) {
    var view = Object.assign({}, planView);
    view.current = !!tier && tier.planID === planView.planID;
    if (!tier) {
        view.actionUrl = URLUtils.https('PrimeMembership-Join', 'plan', planView.planID).toString();
        view.actionLabel = 'join';
    } else if (planView.planRank > tier.planRank) {
        view.actionUrl = URLUtils.https('PrimeMembership-Upgrade', 'plan', planView.planID).toString();
        view.actionLabel = 'upgrade';
    } else {
        view.actionUrl = null;
        view.actionLabel = null;
    }
    return view;
}

server.get('Show', server.middleware.https, requireEnabled, function (req, res, next) {
    var tier = getCurrentTier(getCustomerNo(req));
    var legal = getLegalContent();
    res.render('membership/landing', {
        plans: planHelpers.getSellablePlans().map(planHelpers.getPlanView).map(function (view) { return withAction(tier, view); }),
        tier: tier,
        terms: legal.terms,
        faq: legal.faq,
        flash: takeFlash(req)
    });
    return next();
});

server.get('Details', server.middleware.https, requireEnabled, function (req, res, next) {
    var plan = planHelpers.getPlan(req.querystring.plan);
    if (!plan || !plan.enabled || !plan.valid) {
        res.redirect(URLUtils.https('PrimeMembership-Show'));
        return next();
    }
    var view = withAction(getCurrentTier(getCustomerNo(req)), planHelpers.getPlanView(plan));
    var benefit = plan.benefits['member-discount'];
    var legal = getLegalContent();
    res.render('membership/details', {
        plan: view,
        savingsLimits: benefit && benefit.enabled === true ? { perOrder: membershipHelpers.formatCents(benefit.perOrderCapCents), annual: membershipHelpers.formatCents(benefit.annualCapCents) } : null,
        terms: legal.terms
    });
    return next();
});

/**
 * @param {Object} req - request
 * @param {Object} res - response
 * @param {string} type - PURCHASE, UPGRADE or RENEWAL
 * @param {string} planID - target plan
 */
function renderReview(req, res, type, planID) {
    var customerNo = getCustomerNo(req);
    var paymentHelpers = require('*/cartridge/scripts/helpers/membershipPaymentHelpers');
    var quote = paymentHelpers.getQuote(customerNo, type, planID);
    if (quote.error) {
        setFlash(req, { error: quote.errorCode });
        res.redirect(URLUtils.https(customerNo && quote.errorCode !== 'plan-unavailable' ? 'PrimeMembership-Dashboard' : 'PrimeMembership-Show'));
        return;
    }
    var figures = quote.quoteData || {};
    var subscription = quote.subscription;
    res.render('membership/review', {
        type: type,
        plan: planHelpers.getPlanView(quote.plan),
        amount: membershipHelpers.formatCents(quote.amountCents),
        nonce: membershipHelpers.createId('PMN'),
        upgrade: type === 'UPGRADE' ? {
            current: planHelpers.getPlanView(planHelpers.getPlan(subscription.custom.planID)),
            expires: membershipHelpers.toDay(subscription.custom.expirationDate),
            remainingDays: String(Math.ceil(figures.remainingSeconds / 86400)),
            credit: membershipHelpers.formatCents(figures.unusedCreditCents),
            targetCost: membershipHelpers.formatCents(figures.targetCostCents)
        } : null,
        terms: getLegalContent().terms,
        form: server.forms.getForm('primeMembershipSelect'),
        flash: takeFlash(req)
    });
}

server.get('Join', server.middleware.https, requireEnabled, requireLogin, csrfProtection.generateToken, function (req, res, next) {
    renderReview(req, res, 'PURCHASE', req.querystring.plan);
    return next();
});

server.get('Upgrade', server.middleware.https, requireEnabled, requireLogin, csrfProtection.generateToken, function (req, res, next) {
    renderReview(req, res, 'UPGRADE', req.querystring.plan);
    return next();
});

server.get('Renew', server.middleware.https, requireEnabled, requireLogin, csrfProtection.generateToken, function (req, res, next) {
    var subscription = require('*/cartridge/scripts/helpers/membershipSubscriptionHelpers').getSubscription(getCustomerNo(req));
    renderReview(req, res, 'RENEWAL', subscription ? subscription.custom.planID : '');
    return next();
});

server.post('StartCheckout', server.middleware.https, requireEnabled, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var form = server.forms.getForm('primeMembershipSelect');
    var customerNo = getCustomerNo(req);
    var paymentHelpers = require('*/cartridge/scripts/helpers/membershipPaymentHelpers');
    var result = form.valid && form.acceptTerms.checked
        ? paymentHelpers.startCheckout(customerNo, form.transactionType.value, form.planID.value, form.nonce.value)
        : membershipHelpers.errorResult('terms-required');
    if (result.error) {
        setFlash(req, { error: result.errorCode });
        res.redirect(URLUtils.https('PrimeMembership-Show'));
    } else {
        res.redirect(URLUtils.https('PrimeMembership-Checkout', 'id', result.transactionID));
    }
    return next();
});

/**
 * @param {Object} req - request
 * @param {Object} res - response
 * @param {string} id - transaction
 * @returns {?dw.object.CustomObject} the customer's own transaction; otherwise redirects
 */
function getOwnTransactionOrRedirect(req, res, id) {
    var record = require('*/cartridge/scripts/helpers/membershipPaymentHelpers').getOwnTransaction(id, getCustomerNo(req));
    if (!record) res.redirect(URLUtils.https('PrimeMembership-Dashboard'));
    return record;
}

server.get('Checkout', server.middleware.https, requireEnabled, requireLogin, csrfProtection.generateToken, function (req, res, next) {
    var record = getOwnTransactionOrRedirect(req, res, req.querystring.id);
    if (!record) return next();
    var paymentHelpers = require('*/cartridge/scripts/helpers/membershipPaymentHelpers');
    if (record.custom.status !== 'QUOTED') {
        res.redirect(URLUtils.https('PrimeMembership-Confirmation', 'id', record.custom.transactionID));
        return next();
    }
    var checked = paymentHelpers.checkQuote(record);
    var basket = checked.error ? null : paymentHelpers.getFeeBasket(record);
    if (!basket) {
        setFlash(req, { error: checked.error ? checked.errorCode : 'quote-expired' });
        res.redirect(URLUtils.https('PrimeMembership-Show'));
        return next();
    }
    var hasAddress = !!basket.billingAddress;
    var year = new Date().getFullYear();
    var paymentForm = hasAddress ? server.forms.getForm('primeMembershipPayment') : null;
    if (paymentForm) paymentForm.clear();
    var view = {
        transaction: paymentHelpers.getTransactionView(record),
        plan: planHelpers.getPlanView(checked.plan),
        hasAddress: hasAddress,
        billingForm: server.forms.getForm('primeMembershipBilling'),
        countries: membershipHelpers.getListPreference('primeMembershipBillingCountries'),
        flash: takeFlash(req)
    };
    if (paymentForm) {
        view.forms = { billingForm: paymentForm };
        view.paymentMethod = membershipHelpers.getListPreference('primeMembershipPaymentMethods')[0];
        view.expirationYears = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (i) { return year + i; });
        // Stand-ins for what base creditCardForm.isml reads from the checkout page.
        view.order = { billing: { payment: { selectedPaymentInstruments: [] } } };
        view.customer = { registeredUser: false };
    }
    res.render('membership/checkout', view);
    return next();
});

server.post('SaveBilling', server.middleware.https, requireEnabled, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var record = getOwnTransactionOrRedirect(req, res, req.querystring.id);
    if (!record) return next();
    var form = server.forms.getForm('primeMembershipBilling');
    var result = !form.valid ? membershipHelpers.errorResult('address-invalid') : require('*/cartridge/scripts/helpers/membershipPaymentHelpers').saveBillingAddress(record, {
        firstName: form.firstName.value,
        lastName: form.lastName.value,
        address1: form.address1.value,
        address2: form.address2.value,
        city: form.city.value,
        stateCode: form.stateCode.value,
        postalCode: form.postalCode.value,
        countryCode: form.countryCode.value,
        phone: form.phone.value
    });
    if (result.error) setFlash(req, { error: result.errorCode });
    res.redirect(URLUtils.https('PrimeMembership-Checkout', 'id', record.custom.transactionID));
    return next();
});

server.post('PlaceOrder', server.middleware.https, requireEnabled, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var record = getOwnTransactionOrRedirect(req, res, req.querystring.id);
    if (!record) return next();
    var paymentForm = server.forms.getForm('primeMembershipPayment');
    var result = require('*/cartridge/scripts/helpers/membershipPaymentHelpers').placeOrder(req, paymentForm, record);
    paymentForm.clear();
    if (result.error) {
        setFlash(req, { error: result.errorCode === 'invalid' ? 'payment-details' : result.errorCode });
        res.redirect(URLUtils.https('PrimeMembership-Checkout', 'id', record.custom.transactionID));
        return next();
    }
    res.redirect(URLUtils.https('PrimeMembership-Confirmation', 'id', record.custom.transactionID));
    return next();
});

server.get('Confirmation', server.middleware.https, requireEnabled, requireLogin, function (req, res, next) {
    var record = getOwnTransactionOrRedirect(req, res, req.querystring.id);
    if (!record) return next();
    res.render('membership/confirmation', {
        transaction: require('*/cartridge/scripts/helpers/membershipPaymentHelpers').getTransactionView(record)
    });
    return next();
});

server.get('Dashboard', server.middleware.https, requireEnabled, requireLogin, csrfProtection.generateToken, function (req, res, next) {
    var customerNo = getCustomerNo(req);
    var subscriptionHelpers = require('*/cartridge/scripts/helpers/membershipSubscriptionHelpers');
    var benefitHelpers = require('*/cartridge/scripts/helpers/membershipBenefitHelpers');
    var paymentHelpers = require('*/cartridge/scripts/helpers/membershipPaymentHelpers');
    var adapters = require('*/cartridge/scripts/integrations/membershipAdapters');
    var subscription = subscriptionHelpers.getSubscription(customerNo);
    var tier = benefitHelpers.getMembershipTier(customerNo);
    var view = { flash: takeFlash(req), membership: null, benefits: [], usage: [], transactions: paymentHelpers.getHistory(customerNo, 20), upgrades: [], settingsForm: server.forms.getForm('primeMembershipSettings') };
    if (subscription) {
        var c = subscription.custom;
        var subscribedPlan = planHelpers.getPlan(c.planID);
        var paidThrough = c.paidThroughDate;
        var windowMs = membershipHelpers.getPreference('primeMembershipRenewalWindowDays') * membershipHelpers.DAY;
        view.membership = {
            planName: subscribedPlan ? subscribedPlan.planName : '',
            status: c.status,
            startDate: membershipHelpers.toDay(c.startDate),
            expirationDate: membershipHelpers.toDay(c.expirationDate),
            remainingDays: paidThrough ? String(Math.max(0, Math.ceil((paidThrough.getTime() - Date.now()) / membershipHelpers.DAY))) : '0',
            autoRenew: c.autoRenewEnabled === true,
            autoRenewAvailable: adapters.isAutoRenewAvailable(),
            marketingEmails: c.marketingEmailsEnabled !== false,
            entitled: subscriptionHelpers.isEntitled(subscription),
            canJoin: !subscriptionHelpers.isEntitled(subscription) && !c.pendingTransactionID,
            canCancel: subscriptionHelpers.isEntitled(subscription) && c.status !== 'CANCELLED' && !c.pendingTransactionID,
            canReactivate: c.status === 'CANCELLED' && subscriptionHelpers.isEntitled(subscription),
            canRenew: subscriptionHelpers.isEntitled(subscription) && !c.pendingTransactionID && paidThrough.getTime() - Date.now() <= windowMs
        };
        view.benefits = benefitHelpers.getAvailableBenefits(customerNo);
        view.usage = benefitHelpers.getUsageHistory(customerNo, 20);
    }
    if (tier) {
        view.upgrades = planHelpers.getSellablePlans().filter(function (plan) { return plan.planRank > tier.planRank; }).map(planHelpers.getPlanView).map(function (plan) { return withAction(tier, plan); });
    }
    res.render('membership/dashboard', view);
    return next();
});

server.post('UpdateSettings', server.middleware.https, requireEnabled, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var form = server.forms.getForm('primeMembershipSettings');
    var customerNo = getCustomerNo(req);
    var result = require('*/cartridge/scripts/helpers/membershipSubscriptionHelpers').updateSettings(customerNo, form.autoRenew.checked === true, form.marketingEmails.checked === true, 'customer:' + customerNo);
    finish(req, res, result, URLUtils.https('PrimeMembership-Dashboard'));
    return next();
});

server.get('Cancel', server.middleware.https, requireEnabled, requireLogin, csrfProtection.generateToken, function (req, res, next) {
    var subscriptionHelpers = require('*/cartridge/scripts/helpers/membershipSubscriptionHelpers');
    var subscription = subscriptionHelpers.getSubscription(getCustomerNo(req));
    if (!subscriptionHelpers.isEntitled(subscription) || subscription.custom.status === 'CANCELLED') {
        res.redirect(URLUtils.https('PrimeMembership-Dashboard'));
        return next();
    }
    res.render('membership/cancel', { effectiveDate: membershipHelpers.toDay(subscription.custom.paidThroughDate) });
    return next();
});

server.post('CancelSubmit', server.middleware.https, requireEnabled, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var customerNo = getCustomerNo(req);
    var result = require('*/cartridge/scripts/helpers/membershipSubscriptionHelpers').cancelMembership(customerNo, 'customer:' + customerNo);
    finish(req, res, result, URLUtils.https('PrimeMembership-Dashboard'), 'cancelled');
    return next();
});

server.post('Reactivate', server.middleware.https, requireEnabled, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var customerNo = getCustomerNo(req);
    var result = require('*/cartridge/scripts/helpers/membershipSubscriptionHelpers').reactivateMembership(customerNo, 'customer:' + customerNo);
    finish(req, res, result, URLUtils.https('PrimeMembership-Dashboard'), 'reactivated');
    return next();
});

server.get('Event', server.middleware.https, requireEnabled, requireLogin, function (req, res, next) {
    var benefitHelpers = require('*/cartridge/scripts/helpers/membershipBenefitHelpers');
    var active = benefitHelpers.getActiveMembership(getCustomerNo(req));
    var benefit = active ? active.plan.benefits['vip-event'] : null;
    var event = benefit && benefit.enabled === true ? benefit.events.filter(function (e) { return e.id === req.querystring.id; })[0] : null;
    if (!event || (event.endsAt && Date.parse(event.endsAt) < Date.now())) {
        setFlash(req, { error: 'event-unavailable' });
        res.redirect(URLUtils.https('PrimeMembership-Dashboard'));
        return next();
    }
    res.render('membership/event', { name: event.name, body: getContentBody(event.contentAssetId) });
    return next();
});

// Small JSON routes for the script that the footer hook loads; never page-cached.
server.get('PageContext', function (req, res, next) {
    var Resource = require('dw/web/Resource');
    var customerNo = getCustomerNo(req);
    var tier = planHelpers.isEnabled() ? getCurrentTier(customerNo) : null;
    var context = { badge: null, join: null, savings: null };
    if (tier) {
        context.badge = { text: tier.planName, url: URLUtils.https('PrimeMembership-Dashboard').toString() };
        var basket = require('dw/order/BasketMgr').getCurrentBasket();
        var savings = basket ? (basket.custom.primeMembershipSavingsCents || 0) + (basket.custom.primeMembershipShippingSavingsCents || 0) : 0;
        if (savings > 0) context.savings = Resource.msgf('cart.savings', 'primemembership', null, membershipHelpers.formatCents(savings));
    } else if (planHelpers.isEnabled() && membershipHelpers.getPreference('primeMembershipJoinLinkEnabled') === true) {
        context.join = { text: Resource.msg('header.join', 'primemembership', null), url: URLUtils.https('PrimeMembership-Show').toString() };
    }
    res.json(context);
    return next();
});

server.get('ProductLabels', function (req, res, next) {
    var ids = String(req.querystring.pids || '').split(',').filter(function (id) { return /^[\w.-]{1,100}$/.test(id); }).slice(0, MAX_LABEL_PRODUCTS);
    res.json({ labels: planHelpers.isEnabled() ? require('*/cartridge/scripts/helpers/membershipAccessHelpers').getProductLabels(getCustomerNo(req), ids) : {} });
    return next();
});

module.exports = server.exports();
