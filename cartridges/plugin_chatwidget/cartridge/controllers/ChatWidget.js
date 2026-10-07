'use strict';

/**
 * JSON endpoints for the storefront shopping assistant.
 *
 * Read endpoints project SFRA models into display-safe payloads. Writes that
 * SFRA already exposes as JSON routes (cart, coupons, login, registration,
 * profile, addresses, saved cards, SubmitShipping, SubmitPayment, PlaceOrder)
 * are called directly by the widget and journaled by the route prepends in
 * this cartridge's Cart, Account, Address, PaymentInstruments, Checkout*,
 * Order, Product and Login controllers.
 * @module controllers/ChatWidget
 */

var server = require('server');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var journey = require('*/cartridge/scripts/helpers/journey');
var widgetHelpers = require('*/cartridge/scripts/helpers/chatWidgetHelpers');

var PAGE_SIZE = 8;
var ORDER_LIST_SIZE = 10;
var CLIENT_EVENTS = ['widget_opened', 'widget_closed', 'checkout_step_entered'];
var CLIENT_CHECKOUT_STEPS = ['payment', 'review'];

/**
 * Send a JSON error with an HTTP status.
 * @param {Object} res SFRA response
 * @param {number} status HTTP status code
 * @param {string} message shopper-facing message
 */
function fail(res, status, message) {
    res.setStatusCode(status);
    res.json({ error: true, message: message });
}

/**
 * Guard for account and checkout capabilities.
 * @param {Object} req SFRA request
 * @param {Object} res SFRA response
 * @returns {boolean} whether the shopper is authenticated
 */
function authenticated(req, res) {
    if (!req.currentCustomer.raw.authenticated || !req.currentCustomer.raw.registered) {
        fail(res, 401, 'Please sign in to use this account feature.');
        return false;
    }
    return true;
}

/**
 * Order owned by the authenticated shopper, or null.
 * @param {Object} req SFRA request
 * @param {string} orderNo order number
 * @returns {dw.order.Order|null} owned order
 */
function ownedOrder(req, orderNo) {
    var order = orderNo ? require('dw/order/OrderMgr').getOrder(orderNo) : null;
    var profile = req.currentCustomer.raw.profile;
    return order && profile && order.customerNo === profile.customerNo ? order : null;
}

/**
 * Pending review order for the journey, only if the current shopper owns it.
 * @param {Object} req SFRA request
 * @returns {string|null} order number
 */
function reviewableOrder(req) {
    var orderNo = req.currentCustomer.raw.authenticated ? journey.pendingReviewOrder(req) : null;
    return orderNo && ownedOrder(req, orderNo) && !journey.hasReview(orderNo) ? orderNo : null;
}

/**
 * Start menu: actions available to the current shopper.
 */
server.get('Capabilities', function (req, res, next) {
    var result = widgetHelpers.capabilities(req, reviewableOrder(req));
    journey.track(req, 'capabilities_displayed', { context: result.actions.join(',') });
    res.json(result);
    next();
});

/**
 * Session-bound CSRF token for widget POSTs. Fetched before each POST because
 * login and logout rotate the session token.
 */
server.get('AuthToken', server.middleware.https, csrfProtection.generateToken, function (req, res, next) {
    res.json(res.getViewData().csrf);
    next();
});

/**
 * Persist a client-only interaction (open/close, checkout steps rendered
 * without a server call) from an allow-list.
 */
server.post('Activity', csrfProtection.validateAjaxRequest, function (req, res, next) {
    var step = CLIENT_CHECKOUT_STEPS.indexOf(req.form.step) === -1 ? '' : req.form.step;
    if (CLIENT_EVENTS.indexOf(req.form.action) === -1 || (req.form.action === 'checkout_step_entered' && !step)) {
        fail(res, 400, 'Unknown activity.');
        return next();
    }
    journey.track(req, req.form.action, { context: step ? 'step=' + step : '' });
    res.json({ success: true });
    return next();
});

server.get('Categories', function (req, res, next) {
    journey.track(req, 'catalog_viewed', { entityID: req.querystring.parent || 'root' });
    res.json({ categories: widgetHelpers.categoriesFor(req.querystring.parent) });
    next();
});

/**
 * Product carousel page for a category (cgid) or a search phrase (q).
 */
server.get('Products', function (req, res, next) {
    var ProductFactory = require('*/cartridge/scripts/factories/product');
    var ProductSearchModel = require('dw/catalog/ProductSearchModel');
    var productSearch = new ProductSearchModel();
    var phrase = String(req.querystring.q || '').trim().substring(0, 100);
    var start = Math.max(parseInt(req.querystring.start, 10) || 0, 0);
    var products = [];
    var hits;
    var skipped = 0;

    if (!phrase && !req.querystring.cgid) {
        fail(res, 400, 'Choose a category or enter a search term.');
        return next();
    }
    if (phrase) {
        productSearch.setSearchPhrase(phrase);
    } else {
        productSearch.setCategoryID(req.querystring.cgid);
        productSearch.setRecursiveCategorySearch(true);
    }
    productSearch.search();
    hits = productSearch.productSearchHits;
    while (hits.hasNext() && skipped < start) {
        hits.next();
        skipped += 1;
    }
    while (hits.hasNext() && products.length < PAGE_SIZE) {
        var apiProduct = hits.next().getProduct();
        var product = ProductFactory.get({ pid: apiProduct.ID, pview: 'tile' });
        products.push({
            id: product.id,
            image: product.images.medium.length ? product.images.medium[0].absURL : '',
            name: product.productName,
            price: widgetHelpers.formatProductPrice(product.price),
            hasVariations: apiProduct.master || apiProduct.variationGroup
        });
    }
    journey.track(req, phrase ? 'product_search' : 'product_carousel_loaded', {
        entityID: phrase ? '' : req.querystring.cgid,
        // Search phrases are free-form shopper input, so only the result count is stored.
        context: 'start=' + start + ';results=' + productSearch.count
    });
    res.json({ products: products, hasMore: hits.hasNext(), total: productSearch.count });
    return next();
});

server.get('Product', function (req, res, next) {
    var ProductFactory = require('*/cartridge/scripts/factories/product');
    var product = ProductFactory.get({ pid: req.querystring.pid, quantity: 1 });

    journey.track(req, 'product_selected', { entityID: product.id });
    res.json({
        id: product.id,
        variationAttributes: product.variationAttributes,
        readyToOrder: product.readyToOrder
    });
    next();
});

/**
 * Current basket: lines, totals, shipping methods and promotions.
 */
server.get('Cart', function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var Transaction = require('dw/system/Transaction');
    var basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
    var basket = BasketMgr.getCurrentBasket();
    var cart;

    if (basket) {
        Transaction.wrap(function () {
            if (basket.currencyCode !== req.session.currency.currencyCode) {
                basket.updateCurrency();
            }
            basketCalculationHelpers.calculateTotals(basket);
        });
    }
    cart = widgetHelpers.cartData(basket);
    journey.track(req, 'cart_viewed', { context: 'items=' + cart.numItems });
    res.json(cart);
    next();
});

/**
 * Applied basket promotions, coupon states and active customer promotions.
 */
server.get('Promotions', function (req, res, next) {
    var promotions = widgetHelpers.promotionsData(require('dw/order/BasketMgr').getCurrentBasket());
    journey.track(req, 'promotions_viewed', { context: 'applied=' + promotions.applied.length + ';active=' + promotions.active.length });
    res.json(promotions);
    next();
});

/**
 * Request a password reset e-mail. Same response whether or not the account
 * exists, to avoid account enumeration (matches Account-PasswordResetDialogForm).
 */
server.post('PasswordReset', server.middleware.https, csrfProtection.validateAjaxRequest, function (req, res, next) {
    var CustomerMgr = require('dw/customer/CustomerMgr');
    var Resource = require('dw/web/Resource');
    var accountHelpers = require('*/cartridge/scripts/helpers/accountHelpers');
    var emailHelpers = require('*/cartridge/scripts/helpers/emailHelpers');
    var email = String(req.form.loginEmail || '').trim();
    var resettingCustomer;

    if (!emailHelpers.validateEmail(email)) {
        journey.track(req, 'password_reset_requested', { result: 'error' });
        res.json({ success: false, message: Resource.msg('error.message.passwordreset', 'login', null) });
        return next();
    }
    resettingCustomer = CustomerMgr.getCustomerByLogin(email);
    if (resettingCustomer) {
        accountHelpers.sendPasswordResetEmail(email, resettingCustomer);
    }
    journey.track(req, 'password_reset_requested', { result: 'success' });
    res.json({ success: true, message: Resource.msg('msg.requestedpasswordreset', 'login', null) });
    return next();
});

/**
 * Sign out without leaving the page. Closes the journey before the session
 * customer changes.
 */
server.post('Logout', csrfProtection.validateAjaxRequest, function (req, res, next) {
    journey.track(req, 'logout', { result: 'success' });
    journey.endJourney(req);
    require('dw/customer/CustomerMgr').logoutCustomer(false);
    res.json({ success: true });
    next();
});

/**
 * Account summary: profile and counts.
 */
server.get('Account', function (req, res, next) {
    var customer = req.currentCustomer.raw;
    if (!authenticated(req, res)) return next();
    journey.track(req, 'account_viewed', { entityID: 'summary' });
    res.json({
        profile: {
            firstName: customer.profile.firstName || '',
            lastName: customer.profile.lastName || '',
            email: customer.profile.email || '',
            phone: customer.profile.phoneHome || ''
        },
        counts: {
            addresses: customer.addressBook.addresses.length,
            payments: customer.profile.wallet.paymentInstruments.length,
            orders: customer.orderHistory.orderCount,
            recentOrders: widgetHelpers.recentOrderCount(customer)
        }
    });
    return next();
});

server.get('Addresses', function (req, res, next) {
    if (!authenticated(req, res)) return next();
    journey.track(req, 'account_viewed', { entityID: 'addresses' });
    res.json({
        addresses: widgetHelpers.addressesFor(req.currentCustomer.raw),
        options: widgetHelpers.addressOptions()
    });
    return next();
});

/**
 * Make one of the shopper's own saved addresses the default. Address-SetDefault
 * redirects to a page, so the widget uses this JSON equivalent.
 */
server.post('SetDefaultAddress', csrfProtection.validateAjaxRequest, function (req, res, next) {
    var Transaction = require('dw/system/Transaction');
    var addressBook;
    var address;

    if (!authenticated(req, res)) return next();
    addressBook = req.currentCustomer.raw.addressBook;
    address = addressBook.getAddress(String(req.form.addressId || ''));
    if (!address) {
        journey.track(req, 'address_default_set', { result: 'error' });
        fail(res, 404, 'That address is no longer in your address book.');
        return next();
    }
    Transaction.wrap(function () {
        addressBook.setPreferredAddress(address);
    });
    journey.track(req, 'address_default_set', { result: 'success' });
    res.json({ success: true });
    return next();
});

server.get('Payments', function (req, res, next) {
    if (!authenticated(req, res)) return next();
    journey.track(req, 'account_viewed', { entityID: 'payments' });
    res.json({ payments: widgetHelpers.paymentsFor(req.currentCustomer.raw) });
    return next();
});

server.get('Orders', function (req, res, next) {
    var Order = require('dw/order/Order');
    var orders = [];
    var iterator;

    if (!authenticated(req, res)) return next();
    iterator = req.currentCustomer.raw.orderHistory.getOrders('status != {0}', 'creationDate desc', Order.ORDER_STATUS_REPLACED);
    while (iterator.hasNext() && orders.length < ORDER_LIST_SIZE) {
        orders.push(widgetHelpers.orderSummary(iterator.next()));
    }
    iterator.close();
    journey.track(req, 'account_viewed', { entityID: 'orders', context: 'count=' + orders.length });
    res.json({ orders: orders });
    return next();
});

/**
 * Details of an order owned by the signed-in shopper.
 */
server.get('Order', function (req, res, next) {
    var orderHelpers = require('*/cartridge/scripts/order/orderHelpers');
    var order;

    if (!authenticated(req, res)) return next();
    order = ownedOrder(req, req.querystring.orderID);
    if (!order) {
        journey.track(req, 'order_details_viewed', { result: 'error' });
        fail(res, 404, 'We could not find that order in your account.');
        return next();
    }
    journey.track(req, 'order_details_viewed', { entityID: order.orderNo, result: 'success' });
    res.json(widgetHelpers.orderDetails(orderHelpers.getOrderDetails(req)));
    return next();
});

/**
 * Enter checkout: mirrors Checkout-Begin preparation for a registered shopper
 * and returns saved addresses, the selected shipping method and whether the
 * configured payment processor can complete inside the widget.
 */
server.get('Checkout', server.middleware.https, function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var Transaction = require('dw/system/Transaction');
    var URLUtils = require('dw/web/URLUtils');
    var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
    var validationHelpers = require('*/cartridge/scripts/helpers/basketValidationHelpers');
    var basket = BasketMgr.getCurrentBasket();
    var customer = req.currentCustomer.raw;
    var shipment;

    if (!authenticated(req, res)) return next();
    if (!basket || !basket.productLineItems.length) {
        fail(res, 409, 'Your cart is empty.');
        return next();
    }
    if (validationHelpers.validateProducts(basket).error) {
        fail(res, 409, 'Some items in your cart are no longer available. Please review your cart.');
        return next();
    }
    Transaction.wrap(function () {
        COHelpers.ensureNoEmptyShipments(req);
        if (!basket.customerEmail) {
            basket.setCustomerEmail(customer.profile.email);
        }
        if (basket.currencyCode !== req.session.currency.currencyCode) {
            basket.updateCurrency();
        }
    });
    COHelpers.recalculateBasket(basket);
    req.session.privacyCache.set('usingMultiShipping', false);
    shipment = basket.defaultShipment;

    journey.track(req, 'checkout_step_entered', { context: 'step=delivery' });
    res.json({
        addresses: widgetHelpers.addressesFor(customer),
        options: widgetHelpers.addressOptions(),
        selectedShippingMethodId: shipment.shippingMethodID || '',
        phone: customer.profile.phoneHome || '',
        payment: widgetHelpers.paymentSupport(req, basket),
        secureCheckoutUrl: URLUtils.https('Checkout-Begin', 'stage', 'payment').toString(),
        cart: widgetHelpers.cartData(basket)
    });
    return next();
});

/**
 * Confirmation state for an order placed in this session by this shopper.
 * Ownership follows Order-Confirm (same session customer); reviews also
 * require the order to belong to the signed-in customer number.
 */
server.get('Confirmation', server.middleware.https, function (req, res, next) {
    var Order = require('dw/order/Order');
    var order = req.querystring.orderID ? require('dw/order/OrderMgr').getOrder(req.querystring.orderID) : null;
    var placed;

    if (!order || !order.customer || order.customer.ID !== req.currentCustomer.raw.ID) {
        fail(res, 404, 'We could not confirm that order for this session.');
        return next();
    }
    placed = order.status.value !== Order.ORDER_STATUS_CREATED && order.status.value !== Order.ORDER_STATUS_FAILED;
    if (placed) {
        journey.recordOrder(req, order.orderNo);
    }
    journey.track(req, 'order_confirmation_observed', { entityID: order.orderNo, result: placed ? 'success' : 'error' });
    res.json({
        orderNo: order.orderNo,
        total: widgetHelpers.formatMoney(order.totalGrossPrice),
        status: String(order.status.displayValue),
        confirmed: order.confirmationStatus.value === Order.CONFIRMATION_STATUS_CONFIRMED,
        placed: placed,
        canReview: placed && !!ownedOrder(req, order.orderNo) && !journey.hasReview(order.orderNo),
        reviewed: journey.hasReview(order.orderNo)
    });
    return next();
});

/**
 * Save a review for a confirmed order owned by the signed-in shopper.
 */
server.post('Review', csrfProtection.validateAjaxRequest, function (req, res, next) {
    var Order = require('dw/order/Order');
    var order;
    var rating = parseInt(req.form.rating, 10);
    var comment = String(req.form.comment || '').trim().substring(0, 1000);
    var consent = req.form.commentConsent === 'true';

    if (!authenticated(req, res)) return next();
    order = ownedOrder(req, req.form.orderNo);
    if (!order || order.status.value === Order.ORDER_STATUS_FAILED || order.status.value === Order.ORDER_STATUS_CREATED) {
        fail(res, 404, 'Reviews can only be left for your own placed orders.');
        return next();
    }
    if (!(rating >= 1 && rating <= 5)) {
        fail(res, 400, 'Please choose a rating from 1 to 5.');
        return next();
    }
    if (comment && !consent) {
        fail(res, 400, 'Please agree to storing your comment, or remove it.');
        return next();
    }
    if (journey.hasReview(order.orderNo)) {
        fail(res, 409, 'You have already reviewed this order.');
        return next();
    }
    if (!journey.saveReview(req, { orderNo: order.orderNo, rating: rating, comment: comment, commentConsent: consent })) {
        fail(res, 503, 'We could not save your review right now. Please try again.');
        return next();
    }
    res.json({ success: true });
    return next();
});

module.exports = server.exports();
