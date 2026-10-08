'use strict';

var ProductListMgr = require('dw/customer/ProductListMgr');
var ProductList = require('dw/customer/ProductList');
var store = require('./store');
var permission = require('./registryPermissionHelper');
var token = require('../util/token');
var v = require('../util/validation');
var prefs = require('../util/preferences');
var activity = require('./activityHelper');
var privacyFields = ['showOwnerNames', 'showEventDate', 'showContributorNames', 'showComments', 'showPolls', 'showPurchasedItems', 'allowAnonymousGifts', 'allowGuestVoting', 'allowGroupGifting', 'secretGiftMode'];
/**
 * Get the registryHelper domain operation.
 * @param {*} key - key input
 * @returns {*} Domain result
 */
function get(key) {
    var record = store.get('Registry', key);
    if (!record) v.fail('NOT_FOUND', 404);
    return record;
}
/**
 * List the registryHelper domain operation.
 * @param {*} record - record input
 * @returns {*} Domain result
 */
function list(record) {
    var result = ProductListMgr.getProductList(record.custom.listID);
    if (!result) v.fail('NOT_FOUND', 404);
    return result;
}
/**
 * Slug the registryHelper domain operation.
 * @param {*} value - value input
 * @returns {*} Domain result
 */
function slug(value) {
    var normalized = v.text(value, 80, true).toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) v.fail('INVALID_SLUG');
    return normalized;
}
/**
 * Fields the registryHelper domain operation.
 * @param {*} input - input input
 * @returns {*} Domain result
 */
function fields(input) {
    var type = v.choice(input.eventType, ['WEDDING', 'BIRTHDAY', 'ANNIVERSARY', 'BABY_SHOWER', 'HOUSEWARMING', 'FESTIVAL', 'CUSTOM']);
    if (type === 'WEDDING') prefs.requireFeature('WeddingRegistryEnabled');
    var eventAt = v.date(input.eventAt);
    var revealAt = input.revealAt ? v.date(input.revealAt) : eventAt;
    return { name: v.text(input.name, 120, true), description: v.text(input.description, 2000), eventType: type,
        eventAt: eventAt, revealAt: revealAt, visibility: v.choice(input.visibility, ['PRIVATE', 'LINK_ONLY', 'PUBLIC']),
        status: v.choice(input.status, ['DRAFT', 'ACTIVE']), slug: slug(input.slug),
        partnerName: v.text(input.partnerName, 100), coverReference: v.text(input.coverReference, 120),
        activateAt: input.activateAt ? v.date(input.activateAt) : null, eventReminderSent: false };
}
/**
 * Save the registryHelper domain operation.
 * @param {*} actor - actor input
 * @param {*} input - input input
 * @returns {*} Domain result
 */
function save(actor, input) {
    if (!actor.customerNo) v.fail('LOGIN_REQUIRED', 401);
    var data = fields(input);
    return store.transaction(function () {
        var registry;
        var nativeList;
        if (input.registryKey) {
            registry = get(input.registryKey);
            permission.requireRight(registry, actor, 'edit');
            if (registry.custom.status === 'EVENT_COMPLETED') v.fail('REGISTRY_COMPLETED', 409);
            nativeList = list(registry);
            store.mutate('registry:' + input.registryKey, registry);
        } else {
            // Native list count is bounded by per-customer limits; no global scan.
            var lists = ProductListMgr.getProductLists(actor.customer, ProductList.TYPE_GIFT_REGISTRY);
            if (lists.length >= prefs.number('MaxRegistriesPerCustomer')) v.fail('REGISTRY_LIMIT', 409);
            nativeList = ProductListMgr.createProductList(actor.customer, ProductList.TYPE_GIFT_REGISTRY);
            var id = token.random();
            registry = store.create('Registry', id, { publicKey: id, listID: nativeList.ID, ownerNo: actor.customerNo, revision: 0 });
            store.create('RegistryMember', token.key([id, actor.customerNo]), { registryKey: id, customerNo: actor.customerNo, role: 'OWNER', status: 'ACTIVE' });
            nativeList.custom.sgRegistryKey = id;
            activity.record(id, 'REGISTRY_CREATED');
        }
        var existing = store.get('RegistrySlug', data.slug);
        if (existing && existing.custom.registryKey !== registry.custom.publicKey) v.fail('SLUG_UNAVAILABLE', 409);
        if (!existing) store.create('RegistrySlug', data.slug, { registryKey: registry.custom.publicKey });
        // Old slugs stay claimed, but View only accepts the current slug.
        Object.keys(data).forEach(function (name) { registry.custom[name] = data[name]; });
        privacyFields.forEach(function (name) { registry.custom[name] = v.bool(input[name]); });
        nativeList.name = data.name;
        nativeList.description = data.description;
        nativeList.eventDate = data.eventAt;
        nativeList.eventType = data.eventType;
        // All native lists stay private; only the explicit safe storefront projection is public.
        nativeList.public = false;
        if (input.addressID) {
            var address = actor.customer.addressBook.getAddress(v.text(input.addressID, 100, true));
            if (!address || registry.custom.ownerNo !== actor.customerNo) v.fail('INVALID_ADDRESS');
            nativeList.shippingAddress = address;
            nativeList.postEventShippingAddress = address;
        }
        return registry.custom.publicKey;
    });
}
/**
 * Archive the registryHelper domain operation.
 * @param {*} actor - actor input
 * @param {*} key - key input
 * @returns {*} Domain result
 */
function archive(actor, key) {
    return store.transaction(function () {
        var registry = get(key);
        permission.requireRight(registry, actor, 'archive');
        store.mutate('registry:' + key, registry);
        registry.custom.status = 'ARCHIVED';
        registry.custom.shareHash = null;
    });
}
/**
 * Share the registryHelper domain operation.
 * @param {*} actor - actor input
 * @param {*} key - key input
 * @returns {*} Domain result
 */
function share(actor, key) {
    var value = token.random();
    store.transaction(function () {
        var registry = get(key);
        permission.requireRight(registry, actor, 'edit');
        store.mutate('registry:' + key, registry);
        registry.custom.shareHash = token.hash(value);
    });
    return value;
}
/**
 * Dashboard the registryHelper domain operation.
 * @param {*} actor - actor input
 * @returns {*} Domain result
 */
function dashboard(actor) {
    if (!actor.customerNo) v.fail('LOGIN_REQUIRED', 401);
    return store.query('RegistryMember', 'custom.customerNo = {0} AND custom.status = {1}', [actor.customerNo, 'ACTIVE'], 100)
        .map(function (member) { return get(member.custom.registryKey); })
        .filter(function (record) { return permission.canView(record, actor); });
}
module.exports = { get: get, list: list, save: save, archive: archive, share: share, dashboard: dashboard, privacyFields: privacyFields };
