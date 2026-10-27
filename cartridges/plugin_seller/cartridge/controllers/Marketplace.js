'use strict';

/**
 * Shopper-facing marketplace pages: the offers block on the PDP (remote include), the
 * public seller page, listing reports, and the shopper's marketplace purchases with
 * seller ratings.
 */

var server = require('server');
var URLUtils = require('dw/web/URLUtils');
var cache = require('*/cartridge/scripts/middleware/cache');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var userLoggedIn = require('*/cartridge/scripts/middleware/userLoggedIn');

var PID = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * @returns {boolean} true when the marketplace is on
 */
function enabled() {
    return require('*/cartridge/scripts/helpers/marketplaceHelpers').isMarketplaceEnabled();
}

// Offers contain no shopper data, so a short page cache is safe; stock shown is indicative
// and checked again when the line is added.
server.get('Offers', cache.applyShortPromotionSensitiveCache, function (req, res, next) {
    var pid = String(req.querystring.pid || '');
    var list = enabled() && PID.test(pid) ? require('*/cartridge/scripts/helpers/offerHelpers').getProductOffers(pid) : [];
    res.render('marketplace/offers', { pid: pid, offers: list });
    next();
});

server.get('Seller', cache.applyDefaultCache, function (req, res, next) {
    var profile = enabled() ? require('*/cartridge/scripts/helpers/sellerHelpers').getPublicProfile(String(req.querystring.id || '')) : null;
    if (!profile) {
        res.setStatusCode(404);
        res.render('marketplace/seller-missing');
        return next();
    }
    res.render('marketplace/seller', { profile: profile });
    return next();
});

server.get('Report', server.middleware.https, userLoggedIn.validateLoggedIn, csrfProtection.generateToken, function (req, res, next) {
    var CustomObjectMgr = require('dw/object/CustomObjectMgr');
    var offer = enabled() ? CustomObjectMgr.getCustomObject('MarketplaceOffer', String(req.querystring.offerId || '')) : null;
    if (!offer) {
        res.setStatusCode(404);
        res.render('marketplace/seller-missing');
        return next();
    }
    var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', offer.custom.sellerId);
    res.render('marketplace/report', {
        offerId: offer.custom.offerId,
        productId: offer.custom.productId,
        sellerName: seller ? seller.custom.displayName : '',
        sent: req.querystring.sent === '1',
        error: req.querystring.error ? String(req.querystring.error).slice(0, 40) : null
    });
    return next();
});

server.post('SubmitReport', server.middleware.https, userLoggedIn.validateLoggedIn, csrfProtection.validateRequest, function (req, res, next) {
    var offerId = String(req.form.offerId || '');
    var result = require('*/cartridge/scripts/helpers/caseHelpers').reportListing(req.currentCustomer.raw, {
        offerId: offerId, caseType: req.form.caseType, description: req.form.description, orderNo: req.form.orderNo
    });
    res.redirect(result.error ? URLUtils.url('Marketplace-Report', 'offerId', offerId, 'error', result.errorCode) : URLUtils.url('Marketplace-Report', 'offerId', offerId, 'sent', '1'));
    return next();
});

server.get('Purchases', server.middleware.https, userLoggedIn.validateLoggedIn, csrfProtection.generateToken, function (req, res, next) {
    var offset = Number(req.querystring.offset) > 0 ? Math.floor(Number(req.querystring.offset)) : 0;
    var list = enabled() ? require('*/cartridge/scripts/helpers/sellerOrderHelpers').getCustomerPurchases(req.currentCustomer.raw, offset, 20) : { items: [], total: 0 };
    res.render('marketplace/purchases', { list: list, offset: offset, rated: req.querystring.rated === '1' });
    next();
});

server.post('Rate', server.middleware.https, userLoggedIn.validateLoggedIn, csrfProtection.validateRequest, function (req, res, next) {
    var result = require('*/cartridge/scripts/helpers/sellerOrderHelpers').rateSeller(req.currentCustomer.raw, String(req.form.orderNo || ''), String(req.form.sellerId || ''), req.form.rating);
    res.redirect(result.error ? URLUtils.url('Marketplace-Purchases') : URLUtils.url('Marketplace-Purchases', 'rated', '1'));
    return next();
});

module.exports = server.exports();
