'use strict';

var csrfProtection = require('*/cartridge/scripts/middleware/csrf');

/**
 * Middleware to use consent tracking check. Uses CSRF middleware to generate a CSRF token if one is not present.
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next call in the middleware chain
 * @returns {void}
 */
function consent(req, res, next) {
    var consented = req.session.privacyCache.get('consent');
    if (consented === undefined) {
        consented = null;
        req.session.privacyCache.set('consent', consented);
    } else if (typeof consented === 'boolean') {
        req.session.raw.setTrackingAllowed(consented);
    }

    res.setViewData({ tracking_consent: consented });

    // Consent is submitted to a CSRF-protected endpoint, so this middleware is
    // commonly listed alongside `csrfProtection.generateToken` rather than used
    // exclusively. The order in which the two methods run is not guaranteed, so
    // both check for the existence of `csrf` on the view data to avoid
    // unnecessary work.
    var viewData = res.getViewData();
    if (viewData.csrf) {
        next();
    } else {
        csrfProtection.generateToken(req, res, next);
    }
}

module.exports = {
    consent: consent
};
