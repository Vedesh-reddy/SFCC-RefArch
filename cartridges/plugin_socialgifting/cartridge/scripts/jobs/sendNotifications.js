'use strict';

var store = require('../helpers/store');
var prefs = require('../util/preferences');
var CustomerMgr = require('dw/customer/CustomerMgr');
var URLUtils = require('dw/web/URLUtils');
var Status = require('dw/system/Status');
/**
 * Process a bounded job batch and report partial failures.
 * @returns {*} Domain result
 */
function execute() {
    var failed = false;
    var now = new Date();
    store.query('Notification', '(custom.status = {0} OR custom.status = {1}) AND custom.nextAttemptAt <= {2}', ['PENDING', 'SENDING', now], prefs.number('RegistryJobBatchSize'))
        .forEach(function (notice) {
            var leased = false;
            try {
                store.transaction(function () {
                    store.mutate('notice:' + notice.UUID, notice);
                    if (notice.custom.nextAttemptAt > now) throw new Error('NOTICE_LEASED');
                    notice.custom.status = 'SENDING';
                    notice.custom.attempts += 1;
                    notice.custom.nextAttemptAt = new Date(Date.now() + 600000);
                });
                leased = true;
                var registry = require('../helpers/registryHelper').get(notice.custom.registryKey);
                var customer = CustomerMgr.getCustomerByCustomerNumber(registry.custom.ownerNo);
                if (customer && customer.profile.email) {
                    require('../helpers/notificationHelper').send(customer.profile.email, notice.custom.eventType, {
                        registryURL: URLUtils.https('Registry-View', 'slug', registry.custom.slug).toString()
                    }); // Generic notification has no donor, item, quantity or address details.
                }
                store.transaction(function () { notice.custom.status = 'SENT'; });
            } catch (e) {
                failed = true;
                if (leased) store.transaction(function () { notice.custom.status = notice.custom.attempts >= 5 ? 'FAILED' : 'PENDING'; });
            }
        });
    return new Status(failed ? Status.ERROR : Status.OK);
}
module.exports = { execute: execute };
