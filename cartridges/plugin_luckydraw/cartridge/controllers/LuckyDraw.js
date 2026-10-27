'use strict';

/**
 * Lucky draw pages. Campaign details, winners and draw verification data are public;
 * entries, rewards, the free entry form and opting out need a signed-in registered customer,
 * who only ever sees their own records.
 */

var server = require('server');
var URLUtils = require('dw/web/URLUtils');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');

var LOGIN_SLOT = 9;
var FLASH = 'luckyDrawFlash';

/**
 * Sends signed-out visitors to the login page, back to the lucky draw afterwards.
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
 * @param {Object} res - response
 * @param {Function} next - next middleware
 * @returns {void}
 */
function requireEnabled(req, res, next) {
    if (!require('*/cartridge/scripts/helpers/luckyDrawHelpers').isLuckyDrawEnabled()) {
        res.setStatusCode(404);
        res.render('luckydraw/unavailable');
        return this.done(req, res);
    }
    return next();
}

/**
 * @param {Object} req - request
 * @param {Object} flash - {message} or {error, reason}
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
 * @param {dw.web.URL} url - where to go
 */
function finish(req, res, result, message, url) {
    var fields = result.fields || {};
    setFlash(req, result.error ? { error: result.errorCode, reason: fields.reason || fields.limit || null } : { message: message });
    res.redirect(url);
}

/**
 * @param {Object} res - response
 */
function renderUnavailable(res) {
    res.setStatusCode(404);
    res.render('luckydraw/unavailable');
}

server.get('Show', server.middleware.https, requireEnabled, csrfProtection.generateToken, function (req, res, next) {
    var customerNo = req.currentCustomer.profile ? req.currentCustomer.profile.customerNo : null;
    res.render('luckydraw/overview', {
        campaigns: require('*/cartridge/scripts/helpers/luckyDrawCampaignHelpers').getOverview(),
        inbox: customerNo ? require('*/cartridge/scripts/helpers/luckyDrawHelpers').getInbox(customerNo, 0, 10) : null,
        flash: takeFlash(req)
    });
    return next();
});

server.get('Campaign', server.middleware.https, requireEnabled, csrfProtection.generateToken, function (req, res, next) {
    var customerNo = req.currentCustomer.profile ? req.currentCustomer.profile.customerNo : null;
    var model = require('*/cartridge/scripts/helpers/luckyDrawCampaignHelpers').getCampaignPage(String(req.querystring.id || ''), customerNo);
    if (!model) {
        renderUnavailable(res);
        return next();
    }
    var freeEntryForm = server.forms.getForm('luckyDrawFreeEntry');
    model.flash = takeFlash(req);
    // after a failed POST the session form still holds what the customer typed
    if (!model.flash || !model.flash.error) freeEntryForm.clear();
    model.freeEntryForm = freeEntryForm;
    model.states = require('*/cartridge/scripts/helpers/luckyDrawEntryHelpers').US_STATES;
    res.render('luckydraw/campaign', model);
    return next();
});

server.get('Terms', server.middleware.https, requireEnabled, function (req, res, next) {
    var campaignHelpers = require('*/cartridge/scripts/helpers/luckyDrawCampaignHelpers');
    var r = campaignHelpers.getVisibleCampaignRules(String(req.querystring.id || ''));
    var content = r && r.termsContentAssetId ? require('dw/content/ContentMgr').getContent(r.termsContentAssetId) : null;
    if (!content || !content.isOnline()) {
        renderUnavailable(res);
        return next();
    }
    res.render('luckydraw/terms', { campaign: campaignHelpers.getCampaignView(r), content: content });
    return next();
});

server.get('Draw', server.middleware.https, requireEnabled, function (req, res, next) {
    var CustomObjectMgr = require('dw/object/CustomObjectMgr');
    var record = CustomObjectMgr.getCustomObject('LuckyDrawExecution', String(req.querystring.id || ''));
    var campaign = record ? CustomObjectMgr.getCustomObject('LuckyDrawCampaign', record.custom.campaignId) : null;
    if (!record || !campaign || ['DRAFT', 'CANCELLED'].indexOf(campaign.custom.status) >= 0) {
        renderUnavailable(res);
        return next();
    }
    res.render('luckydraw/draw', { draw: require('*/cartridge/scripts/helpers/luckyDrawDrawHelpers').getDrawView(record, true), campaignName: campaign.custom.name });
    return next();
});

// The frozen snapshot of a finished draw (entry ID, participant token, weight), for independent verification.
server.get('Snapshot', server.middleware.https, requireEnabled, function (req, res, next) {
    var drawHelpers = require('*/cartridge/scripts/helpers/luckyDrawDrawHelpers');
    var record = require('dw/object/CustomObjectMgr').getCustomObject('LuckyDrawExecution', String(req.querystring.id || ''));
    if (!record || ['FINALIZED', 'VOID'].indexOf(record.custom.status) < 0) {
        renderUnavailable(res);
        return next();
    }
    var file = drawHelpers.getSnapshotFile(record.custom);
    res.setContentType('text/csv');
    res.setHttpHeader('Content-Disposition', 'attachment; filename="' + record.custom.executionId + '.csv"');
    res.print(file.exists() ? drawHelpers.readSnapshotText(file) : '');
    return next();
});

server.post('FreeEntry', server.middleware.https, requireEnabled, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var form = server.forms.getForm('luckyDrawFreeEntry');
    var campaignId = form.campaignId.value || '';
    var result;
    if (!form.valid) {
        result = require('*/cartridge/scripts/helpers/luckyDrawHelpers').errorResult('invalid');
    } else {
        result = require('*/cartridge/scripts/helpers/luckyDrawEntryHelpers').createFreeEntry(campaignId, req.currentCustomer.raw, {
            acceptTerms: form.acceptTerms.checked,
            termsVersion: form.termsVersion.value,
            ageConfirmed: form.ageConfirmed.checked,
            region: form.region.value
        });
    }
    finish(req, res, result, 'free-entry-created', URLUtils.url('LuckyDraw-Campaign', 'id', campaignId));
    return next();
});

server.post('OptOut', server.middleware.https, requireEnabled, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var campaignId = String(req.form.campaignId || '');
    var result = require('*/cartridge/scripts/helpers/luckyDrawEntryHelpers').optOut(campaignId, req.currentCustomer.raw);
    finish(req, res, result, 'opted-out', URLUtils.url('LuckyDraw-Campaign', 'id', campaignId));
    return next();
});

server.post('MarkRead', server.middleware.https, requireEnabled, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var result = require('*/cartridge/scripts/helpers/luckyDrawHelpers').markNotificationRead(req.currentCustomer.profile.customerNo, String(req.form.id || ''));
    finish(req, res, result, 'saved', URLUtils.url('LuckyDraw-Show'));
    return next();
});

module.exports = server.exports();
