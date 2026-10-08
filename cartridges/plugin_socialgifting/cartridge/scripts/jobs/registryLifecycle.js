'use strict';

var store = require('../helpers/store');
var prefs = require('../util/preferences');
var Status = require('dw/system/Status');
var Logger = require('dw/system/Logger');
/**
 * Process a bounded job batch and report partial failures.
 * @returns {*} Domain result
 */
function execute() {
    if (!prefs.enabled('SocialGiftingEnabled')) return new Status(Status.OK);
    var now = new Date();
    var limit = prefs.number('RegistryJobBatchSize');
    var failed = false;
    /**
     * Each the registryLifecycle domain operation.
     * @param {*} type - type input
     * @param {*} query - query input
     * @param {*} args - args input
     * @param {*} callback - callback input
     */
    function each(type, query, args, callback) {
        store.query(type, query, args, limit).forEach(function (record) {
            try { store.transaction(function () { callback(record); }); }
            catch (e) { failed = true; Logger.getLogger('social-gifting', 'registry').error('Lifecycle action failed for type {0}', type); }
        });
    }
    each('Registry', 'custom.status = {0} AND custom.eventAt > {1} AND custom.eventAt <= {2} AND custom.eventReminderSent = {3}',
        ['ACTIVE', now, new Date(now.getTime() + prefs.number('RegistryEventReminderDays') * 86400000), false], function (record) {
            store.mutate('registry:' + record.custom.publicKey, record);
            require('../helpers/notificationHelper').enqueue(record.custom.publicKey, record.custom.publicKey + ':' + record.custom.eventAt.getTime(), 'eventReminder');
            record.custom.eventReminderSent = true;
        });
    each('RegistryPoll', 'custom.status = {0} AND custom.endAt > {1} AND custom.endAt <= {2} AND custom.reminderSent = {3}',
        ['OPEN', now, new Date(now.getTime() + prefs.number('RegistryPollReminderHours') * 3600000), false], function (record) {
            store.mutate('poll:' + record.custom.publicKey, record);
            require('../helpers/notificationHelper').enqueue(record.custom.registryKey, record.custom.publicKey, 'pollReminder');
            record.custom.reminderSent = true;
        });
    each('RegistryInvitation', 'custom.status = {0} AND custom.expiresAt <= {1}', ['PENDING', now], function (record) { record.custom.status = 'EXPIRED'; });
    each('RegistryPoll', 'custom.status = {0} AND custom.endAt <= {1}', ['OPEN', now], function (record) {
        store.mutate('poll:' + record.custom.publicKey, record); record.custom.status = 'CLOSED';
    });
    each('RegistryReservation', 'custom.status = {0} AND custom.expiresAt <= {1}', ['ACTIVE', now], function (record) {
        require('../helpers/reservationHelper').release(record, 'EXPIRED');
        require('../helpers/notificationHelper').enqueue(record.custom.registryKey, record.custom.publicKey, 'reservationExpiration');
    });
    each('Contribution', 'custom.status = {0} AND custom.holdExpiresAt <= {1}', ['CREATED', now], function (record) {
        require('../helpers/contributionHelper').fail(record);
    });
    each('GroupGift', 'custom.status = {0} AND custom.expiresAt <= {1}', ['OPEN', now], function (record) {
        store.mutate('gift:' + record.custom.publicKey, record); record.custom.status = 'EXPIRED';
        require('../helpers/groupGiftHelper').releaseUnit(record);
    });
    each('Registry', 'custom.status = {0} AND custom.activateAt <= {1}', ['DRAFT', now], function (record) {
        store.mutate('registry:' + record.custom.publicKey, record); record.custom.status = 'ACTIVE';
    });
    each('Registry', 'custom.status = {0} AND custom.eventAt <= {1}', ['ACTIVE', now], function (record) {
        store.mutate('registry:' + record.custom.publicKey, record); record.custom.status = 'EVENT_COMPLETED';
    });
    each('Registry', 'custom.status = {0} AND custom.eventAt <= {1}', ['EVENT_COMPLETED', new Date(now.getTime() - prefs.number('RegistryArchiveDays') * 86400000)], function (record) {
        store.mutate('registry:' + record.custom.publicKey, record); record.custom.status = 'ARCHIVED'; record.custom.shareHash = null;
    });
    each('RegistryInvitation', '(custom.status = {0} OR custom.status = {1}) AND custom.expiresAt <= {2}', ['EXPIRED', 'ACCEPTED', new Date(now.getTime() - prefs.number('RegistryInvitationRetentionDays') * 86400000)], function (record) { store.remove(record); });
    each('Mutation', 'custom.expiresAt <= {0}', [now], function (record) { store.remove(record); });
    each('AbuseBucket', 'custom.expiresAt <= {0}', [now], function (record) { store.remove(record); });
    each('RegistryActivity', 'custom.occurredAt <= {0}', [new Date(now.getTime() - prefs.number('RegistryActivityRetentionDays') * 86400000)], function (record) { store.remove(record); });
    return new Status(failed ? Status.ERROR : Status.OK);
}
module.exports = { execute: execute };
