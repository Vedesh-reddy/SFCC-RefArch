'use strict';

var store = require('./store');
var token = require('../util/token');
/**
 * Persist an idempotent event or purchase in the caller domain.
 * @param {*} registryKey - registryKey input
 * @param {*} type - type input
 * @param {*} itemKey - itemKey input
 * @param {*} anonymous - anonymous input
 * @returns {*} Domain result
 */
function record(registryKey, type, itemKey, anonymous) {
    var id = token.random();
    store.create('RegistryActivity', id, { publicKey: id, registryKey: registryKey, type: type, itemKey: itemKey || '', anonymous: !!anonymous, occurredAt: new Date() });
    return id;
}
module.exports = { record: record };
