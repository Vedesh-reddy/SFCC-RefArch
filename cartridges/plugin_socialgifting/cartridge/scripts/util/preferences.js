'use strict';

var Site = require('dw/system/Site');
var defaults = {
    RegistryReservationMinutes: 15, RegistryArchiveDays: 90, InvitationExpirationHours: 72,
    GroupGiftExpirationDays: 30, MaxRegistryItems: 100, MaxRegistryCollaborators: 20,
    MaxPollOptions: 6, MaxRegistriesPerCustomer: 10, MaxCommentLength: 2000,
    RegistryPageSize: 20, RegistryJobBatchSize: 100, GroupGiftPaymentHoldMinutes: 15,
    RegistryActivityRetentionDays: 180, RegistryInvitationRetentionDays: 30, RegistryEventReminderDays: 7, RegistryPollReminderHours: 24
};
/**
 * Enabled the preferences domain operation.
 * @param {*} name - name input
 * @returns {*} Domain result
 */
function enabled(name) { return Site.current.getCustomPreferenceValue(name) === true; }
/**
 * Number the preferences domain operation.
 * @param {*} name - name input
 * @returns {*} Domain result
 */
function number(name) {
    var value = Number(Site.current.getCustomPreferenceValue(name));
    return value > 0 && value <= 10000 && Math.floor(value) === value ? value : defaults[name];
}
/**
 * RequireFeature the preferences domain operation.
 * @param {*} name - name input
 */
function requireFeature(name) {
    if (!enabled('SocialGiftingEnabled') || (name && !enabled(name))) require('./validation').fail('FEATURE_DISABLED', 404);
}
module.exports = { enabled: enabled, number: number, requireFeature: requireFeature };
