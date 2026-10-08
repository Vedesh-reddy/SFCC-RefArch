'use strict';

/**
 * Sends plugin emails through the storefront email helper, so an
 * app.customer.email hook (ESP integration) receives them too.
 * @module scripts/smartMail
 */

var Resource = require('dw/web/Resource');
var Site = require('dw/system/Site');
var emailHelpers = require('*/cartridge/scripts/helpers/emailHelpers');

/**
 * @param {string} to - Recipient
 * @param {string} subjectKey - smartcommerce resource key
 * @param {string} template - Email template
 * @param {Object} context - Template pdict
 */
function send(to, subjectKey, template, context) {
    emailHelpers.sendEmail({
        to: to,
        subject: Resource.msg(subjectKey, 'smartcommerce', null),
        from: Site.current.getCustomPreferenceValue('customerServiceEmail') || 'no-reply@testorganization.com',
        type: subjectKey
    }, template, context);
}

/**
 * @param {string} to - Recipient
 * @param {string} code - One-time code
 * @param {string} reason - smartcommerce resource key explaining what the code is for
 */
function sendCode(to, code, reason) {
    send(to, 'email.code.subject', 'smart/email/code', { code: code, reason: Resource.msg(reason, 'smartcommerce', null) });
}

module.exports = {
    send: send,
    sendCode: sendCode
};
