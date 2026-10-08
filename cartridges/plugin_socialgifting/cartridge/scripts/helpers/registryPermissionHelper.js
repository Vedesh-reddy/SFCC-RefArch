'use strict';

var store = require('./store');
var token = require('../util/token');
var fail = require('../util/validation').fail;
var rights = {
    edit: ['OWNER', 'CO_OWNER'], archive: ['OWNER'], invite: ['OWNER', 'CO_OWNER'],
    add: ['OWNER', 'CO_OWNER', 'EDITOR'], remove: ['OWNER', 'CO_OWNER'],
    poll: ['OWNER', 'CO_OWNER'], moderate: ['OWNER', 'CO_OWNER'],
    comment: ['OWNER', 'CO_OWNER', 'EDITOR', 'VIEWER']
};
/**
 * Resolve authoritative membership from native ownership or an active membership.
 * @param {*} registry - registry input
 * @param {*} actor - actor input
 * @returns {*} Domain result
 */
function role(registry, actor) {
    if (!actor.customerNo) return null;
    if (registry.custom.ownerNo === actor.customerNo) return 'OWNER';
    var member = store.get('RegistryMember', token.key([registry.custom.publicKey, actor.customerNo]));
    return member && member.custom.status === 'ACTIVE' ? member.custom.role : null;
}
/**
 * Apply visibility, link capability and archive rules.
 * @param {*} registry - registry input
 * @param {*} actor - actor input
 * @returns {*} Domain result
 */
function canView(registry, actor) {
    var memberRole = role(registry, actor);
    if (registry.custom.status === 'ARCHIVED') return memberRole === 'OWNER' || memberRole === 'CO_OWNER';
    if (memberRole) return true;
    if (registry.custom.status !== 'ACTIVE' && registry.custom.status !== 'EVENT_COMPLETED') return false;
    return registry.custom.visibility === 'PUBLIC' || (registry.custom.visibility === 'LINK_ONLY'
        && actor.shareHash && actor.shareHash === registry.custom.shareHash);
}
/**
 * View the registryPermissionHelper domain operation.
 * @param {*} registry - registry input
 * @param {*} actor - actor input
 */
function view(registry, actor) { if (!registry || !canView(registry, actor)) fail('NOT_FOUND', 404); }
/**
 * Require the server-side role for a mutation.
 * @param {*} registry - registry input
 * @param {*} actor - actor input
 * @param {*} action - action input
 */
function requireRight(registry, actor, action) {
    view(registry, actor);
    if (registry.custom.status === 'ARCHIVED') fail('REGISTRY_ARCHIVED', 409);
    if (!rights[action] || rights[action].indexOf(role(registry, actor)) === -1) fail('NOT_FOUND', 404);
}
/**
 * Require an active, accessible registry.
 * @param {*} registry - registry input
 * @param {*} actor - actor input
 */
function active(registry, actor) {
    view(registry, actor);
    if (registry.custom.status !== 'ACTIVE') fail('REGISTRY_NOT_ACTIVE', 409);
}
module.exports = { role: role, view: view, canView: canView, requireRight: requireRight, active: active };
