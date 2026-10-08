'use strict';

var ProductMgr = require('dw/catalog/ProductMgr');
var registryHelper = require('./registryHelper');
var permission = require('./registryPermissionHelper');
var store = require('./store');
var activity = require('./activityHelper');
var token = require('../util/token');
var prefs = require('../util/preferences');
var v = require('../util/validation');
/**
 * Resolve an item inside its registry, rejecting foreign identifiers.
 * @param {*} registry - registry input
 * @param {*} itemKey - itemKey input
 * @returns {*} Domain result
 */
function resolve(registry, itemKey) {
    var state = store.get('RegistryItemState', itemKey);
    if (!state || state.custom.registryKey !== registry.custom.publicKey) v.fail('NOT_FOUND', 404);
    var item = registryHelper.list(registry).getItem(state.custom.itemID);
    if (!item || item.custom.sgItemKey !== itemKey) v.fail('NOT_FOUND', 404);
    return { item: item, state: state };
}
/**
 * Add the registryItemHelper domain operation.
 * @param {*} actor - actor input
 * @param {*} input - input input
 * @returns {*} Domain result
 */
function add(actor, input) {
    return store.transaction(function () {
        var registry = registryHelper.get(input.registryKey);
        permission.requireRight(registry, actor, 'add');
        store.mutate('registry:' + input.registryKey, registry);
        var list = registryHelper.list(registry);
        if (list.productItems.length >= prefs.number('MaxRegistryItems')) v.fail('ITEM_LIMIT', 409);
        var product = ProductMgr.getProduct(v.text(input.pid, 100, true));
        if (!product || !product.online || product.master || product.variationGroup || product.bundle || product.productSet || product.optionProduct) v.fail('EXACT_PRODUCT_REQUIRED');
        if (list.productItems.toArray().some(function (item) { return item.productID === product.ID && item.custom.sgStatus !== 'REMOVED'; })) v.fail('PRODUCT_ALREADY_ADDED', 409);
        var quantity = v.integer(input.quantity, 1, 1000);
        var item = list.createProductItem(product);
        var key = token.random();
        item.setQuantityValue(quantity);
        item.setPriority(v.integer(input.priority || '1', 1, 5));
        item.custom.sgItemKey = key;
        item.custom.sgNotes = v.text(input.notes, 1000);
        item.custom.sgAddedBy = actor.customerNo;
        item.custom.sgStatus = 'ACTIVE';
        item.custom.sgAllowGroupGifting = v.bool(input.allowGroupGifting);
        store.create('RegistryItemState', key, { publicKey: key, registryKey: input.registryKey, itemID: item.ID,
            desired: quantity, purchased: 0, reserved: 0, revision: 0 });
        activity.record(input.registryKey, 'PRODUCT_ADDED', key);
        return key;
    });
}
/**
 * Update the registryItemHelper domain operation.
 * @param {*} actor - actor input
 * @param {*} input - input input
 * @param {*} remove - remove input
 * @returns {*} Domain result
 */
function update(actor, input, remove) {
    return store.transaction(function () {
        var registry = registryHelper.get(input.registryKey);
        permission.requireRight(registry, actor, 'remove');
        var pair = resolve(registry, input.itemKey);
        store.mutate('item:' + input.itemKey, pair.state);
        var quantity = remove ? 0 : v.integer(input.quantity, 1, 1000);
        if (quantity < pair.state.custom.purchased + pair.state.custom.reserved || pair.item.custom.sgGroupGiftKey) v.fail('ITEM_COMMITTED', 409);
        pair.state.custom.desired = quantity;
        if (remove) {
            pair.item.custom.sgStatus = 'REMOVED';
            activity.record(input.registryKey, 'PRODUCT_REMOVED', input.itemKey);
        } else {
            pair.item.setQuantityValue(quantity);
            pair.item.custom.sgNotes = v.text(input.notes, 1000);
        }
    });
}
module.exports = { resolve: resolve, add: add, update: update };
