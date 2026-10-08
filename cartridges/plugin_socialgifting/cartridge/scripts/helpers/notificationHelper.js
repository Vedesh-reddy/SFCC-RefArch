'use strict';

var store = require('./store');
var token = require('../util/token');
var Site = require('dw/system/Site');
var Resource = require('dw/web/Resource');
var emailHelpers = require('*/cartridge/scripts/helpers/emailHelpers');
/**
 * Send the notificationHelper domain operation.
 * @param {*} to - to input
 * @param {*} type - type input
 * @param {*} context - context input
 */
function send(to, type, context) {
    var sender = Site.current.getCustomPreferenceValue('customerServiceEmail');
    if (!sender) throw new Error('MAIL_SENDER_NOT_CONFIGURED');
    emailHelpers.sendEmail({ to: to, from: sender, subject: Resource.msg('email.' + type, 'socialgifting', 'Registry update'), type: 'socialGifting.' + type },
        'socialGifting/email/' + type, context);
}
/**
 * Enqueue the notificationHelper domain operation.
 * @param {*} registryKey - registryKey input
 * @param {*} eventKey - eventKey input
 * @param {*} type - type input
 */
function enqueue(registryKey, eventKey, type) {
    var key = token.key([eventKey, type]);
    if (!store.get('Notification', key)) store.create('Notification', key, {
        registryKey: registryKey, eventType: type, status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), revision: 0
    });
}
module.exports = { send: send, enqueue: enqueue };
