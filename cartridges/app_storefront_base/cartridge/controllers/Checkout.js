'use strict';

var server = require('server');

var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');

/**
 * Main entry point for Checkout
 */

server.get(
    'Login',
    server.middleware.https,
    csrfProtection.generateToken,
    function (req, res, next) {
        var BasketMgr = require('dw/order/BasketMgr');
        var ProductLineItemsModel = require('*/cartridge/models/productLineItems');
        var TotalsModel = require('*/cartridge/models/totals');
        var URLUtils = require('dw/web/URLUtils');
        var reportingUrlsHelper = require('*/cartridge/scripts/reportingUrls');

        var currentBasket = BasketMgr.getCurrentBasket();
        var reportingURLs;
        if (!currentBasket) {
            res.redirect(URLUtils.url('Cart-Show'));
            return next();
        }

        if (req.currentCustomer.profile) {
            res.redirect(URLUtils.url('Checkout-Begin'));
        } else {
            var rememberMe = false;
            var userName = '';
            var actionUrl = URLUtils.url('Account-Login', 'checkoutLogin', true);
            var totalsModel = new TotalsModel(currentBasket);
            var details = {
                subTotal: totalsModel.subTotal,
                totalQuantity: ProductLineItemsModel.getTotalQuantity(
                    currentBasket.productLineItems
                )
            };

            if (req.currentCustomer.credentials) {
                rememberMe = true;
                userName = req.currentCustomer.credentials.username;
            }

            reportingURLs = reportingUrlsHelper.getCheckoutReportingURLs(
                currentBasket.UUID,
                1,
                'CheckoutMethod'
            );

            res.render('/checkout/checkoutLogin', {
                rememberMe: rememberMe,
                userName: userName,
                actionUrl: actionUrl,
                details: details,
                reportingURLs: reportingURLs,
                oAuthReentryEndpoint: 2
            });
        }

        return next();
    }
);


// Main entry point for Checkout
server.get(
    'Begin',
    server.middleware.https,
    csrfProtection.generateToken,
    function (req, res, next) {
        var BasketMgr = require('dw/order/BasketMgr');
        var Transaction = require('dw/system/Transaction');
        var AccountModel = require('*/cartridge/models/account');
        var OrderModel = require('*/cartridge/models/order');
        var URLUtils = require('dw/web/URLUtils');
        var reportingUrlsHelper = require('*/cartridge/scripts/reportingUrls');
        var Locale = require('dw/util/Locale');
        var ShippingStateModel = require('*/cartridge/models/shippingState');

        var currentBasket = BasketMgr.getCurrentBasket();
        if (!currentBasket) {
            res.redirect(URLUtils.url('Cart-Show'));
            return next();
        }

        var currentStage = req.querystring.stage ? req.querystring.stage : 'shipping';

        var billingAddress = currentBasket.billingAddress;
        var shippingAddress = currentBasket.defaultShipment.shippingAddress;

        var currentCustomer = req.currentCustomer.raw;
        var usingMultiShipping = req.session.privacyCache.get('usingMultiShipping');
        var currentLocale = Locale.getLocale(req.locale.id);
        var preferredAddress;

        // only true if customer is registered
        if (req.currentCustomer.addressBook && req.currentCustomer.addressBook.preferredAddress) {
            preferredAddress = req.currentCustomer.addressBook.preferredAddress;
            if (!shippingAddress) {
                COHelpers.copyCustomerAddressToShipment(preferredAddress);
                req.session.privacyCache.set(currentBasket.defaultShipment.UUID, 'valid');
            }
            if (!billingAddress) {
                COHelpers.copyCustomerAddressToBilling(preferredAddress);
            }
        }

        // Calculate the basket
        Transaction.wrap(function () {
            COHelpers.ensureNoEmptyShipments(req);
        });

        if (currentBasket.currencyCode !== req.session.currency.currencyCode) {
            Transaction.wrap(function () {
                currentBasket.updateCurrency();
            });
        }

        COHelpers.recalculateBasket(currentBasket);

        var shippingForm = COHelpers.prepareShippingForm(currentBasket);
        var billingForm = COHelpers.prepareBillingForm(currentBasket);

        if (preferredAddress) {
            shippingForm.copyFrom(preferredAddress);
            billingForm.copyFrom(preferredAddress);
        }

        // Loop through all shipments and make sure all are valid
        var isValid;
        var allValid = true;
        for (var i = 0, ii = currentBasket.shipments.length; i < ii; i++) {
            isValid = req.session.privacyCache.get(currentBasket.shipments[i].UUID);
            if (isValid !== 'valid') {
                allValid = false;
                break;
            }
        }

        var orderModel = new OrderModel(
            currentBasket,
            {
                customer: currentCustomer,
                usingMultiShipping: usingMultiShipping,
                shippable: allValid,
                countryCode: currentLocale.country,
                containerView: 'basket'
            }
        );

        // Get rid of this from top-level ... should be part of OrderModel???
        var currentYear = new Date().getFullYear();
        var creditCardExpirationYears = [];

        for (var j = 0; j < 10; j++) {
            creditCardExpirationYears.push(currentYear + j);
        }

        var accountModel = new AccountModel(req.currentCustomer);

        var reportingURLs;
        reportingURLs = reportingUrlsHelper.getCheckoutReportingURLs(
            currentBasket.UUID,
            2,
            'Shipping'
        );

        var shippingStateModel = new ShippingStateModel(orderModel);

        res.render('checkout/checkout', {
            order: orderModel,
            customer: accountModel,
            forms: {
                shippingForm: shippingForm,
                billingForm: billingForm
            },
            expirationYears: creditCardExpirationYears,
            currentStage: currentStage,
            reportingURLs: reportingURLs,
            initialState: JSON.stringify(shippingStateModel)
        });

        return next();
    }
);


module.exports = server.exports();
