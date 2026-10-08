'use strict';

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var token = require('../util/token');
/**
 * Get the store domain operation.
 * @param {*} type - type input
 * @param {*} key - key input
 * @returns {*} Domain result
 */
function get(type, key) { return key ? CustomObjectMgr.getCustomObject('SG' + type, String(key)) : null; }
/**
 * Create the store domain operation.
 * @param {*} type - type input
 * @param {*} key - key input
 * @param {*} fields - fields input
 * @returns {*} Domain result
 */
function create(type, key, fields) {
    var object = CustomObjectMgr.createCustomObject('SG' + type, key);
    Object.keys(fields).forEach(function (name) { object.custom[name] = fields[name]; });
    return object;
}
/**
 * Read a bounded page and always close the platform iterator.
 * @param {*} type - type input
 * @param {*} condition - condition input
 * @param {*} args - args input
 * @param {*} limit - limit input
 * @param {*} sort - sort input
 * @returns {*} Domain result
 */
function query(type, condition, args, limit, sort) {
    var iterator = CustomObjectMgr.queryCustomObjects.apply(CustomObjectMgr, ['SG' + type, condition, sort || 'creationDate asc'].concat(args || []));
    var result = [];
    try { while (iterator.hasNext() && result.length < limit) result.push(iterator.next()); } finally { iterator.close(); }
    return result;
}
/**
 * Claim the current revision atomically with the caller transaction.
 * @param {*} scope - scope input
 * @param {*} object - object input
 */
function mutate(scope, object) {
    // A durable unique revision claim makes stale writers fail instead of losing updates.
    // Do not prune claims while their aggregate is live. Sandbox concurrency is a release gate.
    var revision = object.custom.revision || 0;
    create('Mutation', token.key([scope, revision]), { scope: scope, expiresAt: scope.indexOf('abuse:') === 0 ? new Date(Date.now() + 86400000) : null });
    object.custom.revision = revision + 1;
}
module.exports = { get: get, create: create, query: query, mutate: mutate, transaction: Transaction.wrap, remove: function (object) { CustomObjectMgr.remove(object); } };
