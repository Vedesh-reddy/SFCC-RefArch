'use strict';

var store = require('./store');
var registryHelper = require('./registryHelper');
var permission = require('./registryPermissionHelper');
var items = require('./registryItemHelper');
var token = require('../util/token');
var prefs = require('../util/preferences');
var v = require('../util/validation');
/**
 * Add the registryCommentHelper domain operation.
 * @param {*} actor - actor input
 * @param {*} input - input input
 * @returns {*} Domain result
 */
function add(actor, input) {
    prefs.requireFeature('RegistryCommentsEnabled');
    return store.transaction(function () {
        var registry = registryHelper.get(input.registryKey);
        permission.requireRight(registry, actor, 'comment');
        if (!registry.custom.showComments) v.fail('COMMENTS_DISABLED', 409);
        items.resolve(registry, input.itemKey);
        var id = token.random();
        store.create('RegistryComment', id, { publicKey: id, registryKey: input.registryKey, itemKey: input.itemKey,
            authorNo: actor.customerNo, text: v.text(input.text, prefs.number('MaxCommentLength'), true), state: 'ACTIVE' });
        var event = require('./activityHelper').record(input.registryKey, 'COMMENT_ADDED', input.itemKey);
        require('./notificationHelper').enqueue(input.registryKey, event, 'comment');
        return id;
    });
}
/**
 * Remove the registryCommentHelper domain operation.
 * @param {*} actor - actor input
 * @param {*} input - input input
 * @returns {*} Domain result
 */
function remove(actor, input) {
    return store.transaction(function () {
        var registry = registryHelper.get(input.registryKey);
        permission.requireRight(registry, actor, 'comment');
        var comment = store.get('RegistryComment', input.commentKey);
        if (!comment || comment.custom.registryKey !== input.registryKey) v.fail('NOT_FOUND', 404);
        if (comment.custom.authorNo !== actor.customerNo) permission.requireRight(registry, actor, 'moderate');
        comment.custom.state = 'DELETED';
        comment.custom.text = '';
        comment.custom.editedAt = new Date();
    });
}
module.exports = { add: add, remove: remove };
