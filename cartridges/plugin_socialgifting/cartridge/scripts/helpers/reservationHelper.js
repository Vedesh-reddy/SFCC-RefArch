'use strict';

var store = require('./store');
var registryHelper = require('./registryHelper');
var permission = require('./registryPermissionHelper');
var items = require('./registryItemHelper');
var token = require('../util/token');
var prefs = require('../util/preferences');
var v = require('../util/validation');
/**
 * Create the reservationHelper domain operation.
 * @param {*} actor - actor input
 * @param {*} input - input input
 * @returns {*} Domain result
 */
function create(actor, input) {
    prefs.requireFeature('RegistryReservationEnabled');
    return store.transaction(function () {
        var registry = registryHelper.get(input.registryKey);
        permission.active(registry, actor);
        var pair = items.resolve(registry, input.itemKey);
        if (pair.item.custom.sgStatus !== 'ACTIVE' || pair.item.custom.sgGroupGiftKey) v.fail('ITEM_UNAVAILABLE', 409);
        var quantity = v.integer(input.quantity, 1, 1000);
        if (v.remaining(pair.state.custom.desired, pair.state.custom.purchased, pair.state.custom.reserved) < quantity) v.fail('GIFT_ALREADY_PURCHASED', 409);
        var owned = store.query('RegistryReservation', 'custom.actorHash = {0} AND custom.itemKey = {1} AND custom.status = {2}', [actor.actorHash, input.itemKey, 'ACTIVE'], 1);
        if (owned.length) v.fail('ALREADY_RESERVED', 409);
        store.mutate('item:' + input.itemKey, pair.state);
        pair.state.custom.reserved += quantity;
        var id = token.random();
        var expires = new Date(Date.now() + prefs.number('RegistryReservationMinutes') * 60000);
        store.create('RegistryReservation', id, { publicKey: id, registryKey: input.registryKey, itemKey: input.itemKey,
            actorHash: actor.actorHash, quantity: quantity, expiresAt: expires, status: 'ACTIVE' });
        require('./activityHelper').record(input.registryKey, 'PRODUCT_RESERVED', input.itemKey, true);
        return { reservationKey: id, expiresAt: expires.toISOString() };
    });
}
/**
 * Release the reservationHelper domain operation.
 * @param {*} record - record input
 * @param {*} status - status input
 */
function release(record, status) {
    if (record.custom.status !== 'ACTIVE') return;
    var registry = registryHelper.get(record.custom.registryKey);
    var pair = items.resolve(registry, record.custom.itemKey);
    store.mutate('item:' + record.custom.itemKey, pair.state);
    pair.state.custom.reserved -= record.custom.quantity;
    record.custom.status = status;
}
/**
 * Cancel the reservationHelper domain operation.
 * @param {*} actor - actor input
 * @param {*} input - input input
 */
function cancel(actor, input) {
    store.transaction(function () {
        var record = store.get('RegistryReservation', input.reservationKey);
        if (!record || record.custom.actorHash !== actor.actorHash) v.fail('NOT_FOUND', 404);
        release(record, 'CANCELLED');
    });
}
module.exports = { create: create, cancel: cancel, release: release };
