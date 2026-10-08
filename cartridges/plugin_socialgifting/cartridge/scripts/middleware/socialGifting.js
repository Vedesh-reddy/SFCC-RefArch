'use strict';

var prefs = require('../util/preferences');
var token = require('../util/token');
var store = require('../helpers/store');
var v = require('../util/validation');
var Logger = require('dw/system/Logger');
var Resource = require('dw/web/Resource');
/**
 * Build server-trusted identity and session capability context.
 * @param {*} req - req input
 * @param {*} key - key input
 * @returns {*} Domain result
 */
function actor(req, key) {
    var customer = req.currentCustomer.raw;
    var profile = customer && customer.authenticated && customer.registered ? customer.profile : null;
    var privacy = req.session.privacyCache;
    var guest = privacy.get('sgGuest');
    if (!guest) { guest = token.random(); privacy.set('sgGuest', guest); }
    return { customer: profile ? customer : null, customerNo: profile ? profile.customerNo : null,
        actorHash: token.key(profile ? ['customer', profile.customerNo] : ['guest', guest]),
        shareHash: key ? privacy.get('sgShare:' + key) : null, currency: req.session.currency.currencyCode };
}
/**
 * Prevent personal responses from entering shared caches.
 * @param {*} res - res input
 */
function noCache(res) {
    res.cachePeriod = 0;
    res.base.setExpires(new Date(0));
    res.setHttpHeader('Cache-Control', 'private, no-store');
    res.setHttpHeader('Referrer-Policy', 'no-referrer');
    res.setHttpHeader('X-Content-Type-Options', 'nosniff');
}
/**
 * Error the socialGifting domain operation.
 * @param {*} res - res input
 * @param {*} e - e input
 */
function error(res, e) {
    var code = e.code || 'TEMPORARILY_UNAVAILABLE';
    var status = e.status || 503;
    // Never interpolate exception text; providers/platform errors may contain private input.
    if (!e.code) Logger.getLogger('social-gifting', 'registry').error('Request failed; code={0}', code);
    res.setStatusCode(status);
    res.json({ success: false, error: { code: code, message: Resource.msg('error.' + code, 'socialgifting', 'Unable to complete this request. Please refresh and try again.') } });
}
/**
 * Enforce an action quota for the authenticated customer or guest session.
 * @param {*} actorValue - actorValue input
 * @param {*} action - action input
 */
function rate(actorValue, action) {
    var minute = Math.floor(Date.now() / 60000);
    var key = token.key([action, actorValue.actorHash, minute]);
    store.transaction(function () {
        var bucket = store.get('AbuseBucket', key);
        if (!bucket) bucket = store.create('AbuseBucket', key, { count: 0, revision: 0, expiresAt: new Date((minute + 2) * 60000) });
        store.mutate('abuse:' + key, bucket);
        var max = action === 'invite' ? 3 : 20;
        if (bucket.custom.count >= max) v.fail('RATE_LIMIT', 429);
        bucket.custom.count += 1;
    });
}
/**
 * Wrap browser mutations with terminating CSRF and feature checks.
 * @param {*} action - action input
 * @param {*} fn - fn input
 * @returns {*} Domain result
 */
function post(action, fn) {
    return function (req, res, next) {
        noCache(res);
        try {
            prefs.requireFeature();
            if (!require('dw/web/CSRFProtection').validateRequest()) v.fail('CSRF', 403);
            var who = actor(req, req.form.registryKey);
            rate(who, action);
            var result = fn(req, res, who);
            if (!res.redirectUrl) res.json({ success: true, data: result || {} });
        } catch (e) { error(res, e); }
        return next();
    };
}
/**
 * Wrap page rendering with safe errors and no-store headers.
 * @param {*} fn - fn input
 * @returns {*} Domain result
 */
function page(fn) {
    return function (req, res, next) {
        noCache(res);
        try { prefs.requireFeature(); fn(req, res); } catch (e) { error(res, e); }
        return next();
    };
}
module.exports = { actor: actor, noCache: noCache, error: error, post: post, page: page };
