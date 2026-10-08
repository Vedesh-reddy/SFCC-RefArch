'use strict';

var store = require('./store');
var registryHelper = require('./registryHelper');
var permission = require('./registryPermissionHelper');
var token = require('../util/token');
var prefs = require('../util/preferences');
var v = require('../util/validation');
var URLUtils = require('dw/web/URLUtils');
/**
 * Invite the invitationHelper domain operation.
 * @param {*} actor - actor input
 * @param {*} input - input input
 */
function invite(actor, input) {
    var raw = token.random();
    var email = v.text(input.email, 254, true).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) v.fail('INVALID_EMAIL');
    var role = v.choice(input.role, ['CO_OWNER', 'EDITOR', 'VIEWER']);
    store.transaction(function () {
        var registry = registryHelper.get(input.registryKey);
        permission.requireRight(registry, actor, 'invite');
        store.mutate('registry:' + input.registryKey, registry);
        var pending = store.query('RegistryInvitation', 'custom.registryKey = {0} AND custom.status = {1}', [input.registryKey, 'PENDING'], prefs.number('MaxRegistryCollaborators'));
        if (pending.length >= prefs.number('MaxRegistryCollaborators')) v.fail('COLLABORATOR_LIMIT', 409);
        store.create('RegistryInvitation', token.hash(raw), { registryKey: input.registryKey, invitedEmail: email, role: role,
            expiresAt: new Date(Date.now() + prefs.number('InvitationExpirationHours') * 3600000), status: 'PENDING' });
    });
    // Plaintext invitation capabilities exist only in memory and the delivered email.
    require('./notificationHelper').send(email, 'invitation', { invitationURL: URLUtils.https('Registry-AcceptInvite', 'token', raw).toString() });
}
/**
 * Accept the invitationHelper domain operation.
 * @param {*} actor - actor input
 * @param {*} raw - raw input
 * @returns {*} Domain result
 */
function accept(actor, raw) {
    if (!actor.customerNo) v.fail('LOGIN_REQUIRED', 401);
    if (!/^[a-f0-9]{64}$/i.test(String(raw))) v.fail('INVALID_INVITATION', 404);
    return store.transaction(function () {
        var invitation = store.get('RegistryInvitation', raw);
        if (!invitation || invitation.custom.status !== 'PENDING' || invitation.custom.expiresAt.getTime() <= Date.now()
            || String(actor.customer.profile.email).toLowerCase() !== invitation.custom.invitedEmail) v.fail('INVALID_INVITATION', 404);
        var registry = registryHelper.get(invitation.custom.registryKey);
        if (registry.custom.status === 'ARCHIVED') v.fail('INVALID_INVITATION', 404);
        store.mutate('registry:' + registry.custom.publicKey, registry);
        var members = store.query('RegistryMember', 'custom.registryKey = {0} AND custom.status = {1}', [registry.custom.publicKey, 'ACTIVE'], prefs.number('MaxRegistryCollaborators'));
        if (members.length >= prefs.number('MaxRegistryCollaborators')) v.fail('COLLABORATOR_LIMIT', 409);
        var key = token.key([registry.custom.publicKey, actor.customerNo]);
        var member = store.get('RegistryMember', key);
        // Invitations cannot promote existing memberships or replace native ownership.
        if (member && member.custom.status === 'ACTIVE') v.fail('ALREADY_MEMBER', 409);
        if (member) { member.custom.role = invitation.custom.role; member.custom.status = 'ACTIVE'; }
        else store.create('RegistryMember', key, { registryKey: registry.custom.publicKey, customerNo: actor.customerNo, role: invitation.custom.role, status: 'ACTIVE' });
        invitation.custom.status = 'ACCEPTED';
        invitation.custom.acceptedAt = new Date();
        require('./notificationHelper').enqueue(registry.custom.publicKey, key, 'collaborator');
        return registry.custom.publicKey;
    });
}
/**
 * Revoke the invitationHelper domain operation.
 * @param {*} actor - actor input
 * @param {*} input - input input
 * @returns {*} Domain result
 */
function revoke(actor, input) {
    return store.transaction(function () {
        var registry = registryHelper.get(input.registryKey);
        permission.requireRight(registry, actor, 'invite');
        store.mutate('registry:' + input.registryKey, registry);
        var member = store.get('RegistryMember', input.memberKey);
        if (!member || member.custom.registryKey !== input.registryKey || member.custom.role === 'OWNER') v.fail('NOT_FOUND', 404);
        member.custom.status = 'REVOKED';
    });
}
module.exports = { invite: invite, accept: accept, revoke: revoke };
