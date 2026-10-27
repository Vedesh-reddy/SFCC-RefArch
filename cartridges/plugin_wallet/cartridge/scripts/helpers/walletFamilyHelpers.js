'use strict';

/**
 * Family wallet: an owner lets invited family members pay from the owner's wallet within
 * limits (per order, per day, per month) and, optionally, only for some categories.
 * Members never see the owner's balance or history, only their own remaining limits.
 * Revocation or a freeze takes effect on the next authorization.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Resource = require('dw/web/Resource');
var walletHelpers = require('*/cartridge/scripts/helpers/walletHelpers');
var walletAccountHelpers = require('*/cartridge/scripts/helpers/walletAccountHelpers');

var MEMBER_FLOW = {
    ACTIVE: ['FROZEN', 'REVOKED'],
    FROZEN: ['ACTIVE', 'REVOKED'],
    REVOKED: ['ACTIVE']
};
var EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[A-Za-z]{2,24}$/;

/**
 * @param {string} email - address
 * @returns {string} hash used to match an invitation to the invitee's account e-mail
 */
function getEmailHash(email) {
    return walletHelpers.sha256('invite:' + String(email).trim().toLowerCase());
}

/**
 * @returns {boolean} true when family wallets are switched on
 */
function isFamilyEnabled() {
    return walletHelpers.isWalletEnabled() && walletHelpers.getPreference('walletFamilyEnabled') === true;
}

/**
 * Checks member limit fields. Amounts are dollars; with `partial`, only present fields are checked.
 * @param {Object} data - {nickname, dailyLimit, monthlyLimit, perOrderLimit, allowedCategoryIds, requireOwnerApproval}
 * @param {boolean} partial - true when changing an existing member
 * @returns {{value: Object, invalid: Object}} clean values (amounts in cents) and problems
 */
function checkMemberFields(data, partial) {
    var value = {};
    var invalid = {};
    var has = function (name) { return data[name] !== undefined && data[name] !== null && data[name] !== ''; };
    if (has('nickname')) {
        value.nickname = walletHelpers.cleanText(data.nickname);
        if (!value.nickname || value.nickname.length > 40 || /[\r\n]/.test(value.nickname)) invalid.nickname = 'invalid';
    }
    [['dailyLimit', 'dailyLimitCents'], ['monthlyLimit', 'monthlyLimitCents'], ['perOrderLimit', 'perOrderLimitCents']].forEach(function (pair) {
        if (!has(pair[0])) return;
        var cents = walletHelpers.toCents(data[pair[0]]);
        if (cents === null) invalid[pair[0]] = 'invalid';
        else value[pair[1]] = cents;
    });
    if (data.allowedCategoryIds !== undefined) {
        var ids = (Array.isArray(data.allowedCategoryIds) ? data.allowedCategoryIds : String(data.allowedCategoryIds || '').split(/[\n,]/)).map(walletHelpers.cleanText).filter(Boolean);
        if (ids.length > 20 || ids.some(function (id) { return !/^[A-Za-z0-9._-]{1,256}$/.test(id); })) invalid.allowedCategoryIds = 'invalid';
        else value.allowedCategoryIds = ids;
    }
    if (data.requireOwnerApproval !== undefined) value.requireOwnerApproval = [true, 'true', 'on'].indexOf(data.requireOwnerApproval) >= 0;
    if (!partial && !has('nickname')) value.nickname = Resource.msg('family.default.nickname', 'wallet', null);
    return { value: value, invalid: invalid };
}

/**
 * @param {string} walletId - owner wallet
 * @returns {dw.object.CustomObject[]} members that are active, paused or removed
 */
function getMembers(walletId) {
    return walletHelpers.queryPage('WalletMember', 'custom.walletId = {0} AND (custom.status = {1} OR custom.status = {2} OR custom.status = {3})', 'custom.acceptedAt asc', [walletId, 'ACTIVE', 'FROZEN', 'REVOKED'], 0, 50).items;
}

/**
 * @param {dw.object.CustomObject} member - member
 * @returns {Object} owner-facing view
 */
function getMemberView(member) {
    var c = member.custom;
    return {
        customerNo: c.customerNo,
        nickname: c.nickname,
        status: c.status,
        dailyLimitCents: c.dailyLimitCents,
        monthlyLimitCents: c.monthlyLimitCents,
        perOrderLimitCents: c.perOrderLimitCents,
        allowedCategoryIds: Array.prototype.slice.call(c.allowedCategoryIds || []),
        requireOwnerApproval: !!c.requireOwnerApproval,
        acceptedAt: c.acceptedAt || null,
        revision: c.revision || 0
    };
}

/**
 * The owner invites a family member by e-mail.
 * @param {Object} context - owner wallet context
 * @param {Object} data - {email} plus member limit fields (dollars)
 * @returns {Object} result with invitationId
 */
function invite(context, data) {
    if (!isFamilyEnabled()) return walletHelpers.errorResult('disabled');
    var active = walletAccountHelpers.checkWalletActive(context.wallet);
    if (active.error) return active;
    var check = checkMemberFields(data || {}, false);
    var email = walletHelpers.cleanText(data && data.email).toLowerCase();
    if (!EMAIL.test(email)) check.invalid.email = email ? 'invalid' : 'required';
    if (Object.keys(check.invalid).length) return walletHelpers.errorResult('invalid', check.invalid);
    var owner = require('dw/customer/CustomerMgr').getCustomerByCustomerNumber(context.customerNo);
    if (owner && owner.profile && String(owner.profile.email).toLowerCase() === email) return walletHelpers.errorResult('invalid', { email: 'self' });
    var open = getMembers(context.walletId).filter(function (m) { return m.custom.status !== 'REVOKED'; }).length
        + walletHelpers.queryCount('WalletInvitation', 'custom.walletId = {0} AND custom.status = {1}', [context.walletId, 'INVITED']);
    if (open >= walletHelpers.getPreference('walletFamilyMaxMembers')) return walletHelpers.errorResult('limit-reached', { limit: 'members' });
    if (!walletHelpers.checkRateLimit('family-invite', context.walletId, walletHelpers.getPreference('walletWriteRateLimitPerHour'), 3600)) return walletHelpers.errorResult('rate-limited');
    var v = check.value;
    var token = walletHelpers.randomHex(24);
    var id = walletHelpers.createId('INV');
    Transaction.wrap(function () {
        var invitation = CustomObjectMgr.createCustomObject('WalletInvitation', id);
        var c = invitation.custom;
        c.walletId = context.walletId;
        c.emailHash = getEmailHash(email);
        c.tokenHash = walletHelpers.sha256(token);
        c.status = 'INVITED';
        c.limits = JSON.stringify({
            nickname: v.nickname,
            dailyLimitCents: v.dailyLimitCents !== undefined ? v.dailyLimitCents : walletHelpers.getPreference('walletFamilyDefaultDailyLimitCents'),
            monthlyLimitCents: v.monthlyLimitCents !== undefined ? v.monthlyLimitCents : walletHelpers.getPreference('walletFamilyDefaultMonthlyLimitCents'),
            perOrderLimitCents: v.perOrderLimitCents !== undefined ? v.perOrderLimitCents : walletHelpers.getPreference('walletFamilyDefaultPerOrderLimitCents'),
            allowedCategoryIds: v.allowedCategoryIds || [],
            requireOwnerApproval: !!v.requireOwnerApproval
        });
        c.expiresAt = new Date(Date.now() + walletHelpers.getPreference('walletInvitationTtlHours') * 3600000);
        c.createdAt = new Date();
        walletHelpers.logAudit({ entityType: 'INVITATION', entityId: id, walletId: context.walletId, action: 'INVITE', actor: context.actor });
    });
    var from = walletHelpers.getPreference('walletFromEmail');
    if (from) {
        require('*/cartridge/scripts/helpers/emailHelpers').sendEmail({ to: email, from: from, subject: Resource.msg('email.invite.subject', 'wallet', null) },
            'wallet/email/invitation', { url: require('dw/web/URLUtils').https('Wallet-Invitation', 'token', token).toString(), hours: String(walletHelpers.getPreference('walletInvitationTtlHours')) });
    }
    return { error: false, invitationId: id };
}

/**
 * @param {string} token - token from the invitation link
 * @returns {?dw.object.CustomObject} the open invitation
 */
function getInvitation(token) {
    if (!/^[a-f0-9]{48}$/.test(String(token || ''))) return null;
    var found = walletHelpers.queryPage('WalletInvitation', 'custom.tokenHash = {0}', null, [walletHelpers.sha256(token)], 0, 1).items[0];
    return found && found.custom.status === 'INVITED' && found.custom.expiresAt.getTime() >= Date.now() ? found : null;
}

/**
 * @param {dw.customer.Customer} customer - invitee
 * @param {string} token - invitation token
 * @returns {Object} {error: false, invitation, customerNo}, or an error result
 */
function getInviteeContext(customer, token) {
    if (!isFamilyEnabled()) return walletHelpers.errorResult('disabled');
    var customerNo = walletAccountHelpers.getCustomerNo(customer);
    if (!customerNo) return walletHelpers.errorResult('unauthenticated');
    var invitation = getInvitation(token);
    if (!invitation) return walletHelpers.errorResult('not-found');
    // Only the account with the invited e-mail address may answer.
    if (invitation.custom.emailHash !== getEmailHash(customer.profile.email)) return walletHelpers.errorResult('forbidden');
    return { error: false, invitation: invitation, customerNo: customerNo };
}

/**
 * The invitee (signed in with the invited e-mail) asks for a code to confirm.
 * @param {dw.customer.Customer} customer - invitee
 * @param {string} token - invitation token
 * @param {string} sessionRef - session ID
 * @returns {Object} result
 */
function sendAcceptCode(customer, token, sessionRef) {
    var invitee = getInviteeContext(customer, token);
    if (invitee.error) return invitee;
    return walletHelpers.sendCode('family-accept', invitee.customerNo, sessionRef, customer.profile.email, 'email.code.subject', {});
}

/**
 * @param {dw.customer.Customer} customer - invitee
 * @param {string} token - invitation token
 * @param {string} code - verification code
 * @param {string} sessionRef - session ID
 * @returns {Object} result with memberView
 */
function acceptInvitation(customer, token, code, sessionRef) {
    var invitee = getInviteeContext(customer, token);
    if (invitee.error) return invitee;
    var invitation = invitee.invitation;
    var customerNo = invitee.customerNo;
    if (invitation.custom.walletId === customerNo) return walletHelpers.errorResult('invalid', { invitation: 'own-wallet' });
    if (walletHelpers.getPreference('walletFamilyRequireCode') !== false) {
        var checked = walletHelpers.checkCode('family-accept', customerNo, code, sessionRef);
        if (checked.error) return checked;
    }
    var existing = CustomObjectMgr.getCustomObject('WalletMember', customerNo);
    if (existing && existing.custom.walletId !== invitation.custom.walletId && existing.custom.status !== 'REVOKED') return walletHelpers.errorResult('conflict');
    var limits = walletHelpers.parseJson(invitation.custom.limits, {});
    var member;
    Transaction.wrap(function () {
        member = existing || CustomObjectMgr.createCustomObject('WalletMember', customerNo);
        var c = member.custom;
        c.walletId = invitation.custom.walletId;
        c.status = 'ACTIVE';
        c.nickname = limits.nickname;
        c.dailyLimitCents = limits.dailyLimitCents;
        c.monthlyLimitCents = limits.monthlyLimitCents;
        c.perOrderLimitCents = limits.perOrderLimitCents;
        c.allowedCategoryIds = limits.allowedCategoryIds || [];
        c.requireOwnerApproval = !!limits.requireOwnerApproval;
        c.acceptedAt = new Date();
        c.revokedAt = null;
        c.revision = existing ? (c.revision || 0) + 1 : 0;
        invitation.custom.status = 'ACCEPTED';
        invitation.custom.acceptedBy = customerNo;
        walletHelpers.logAudit({ entityType: 'MEMBER', entityId: customerNo, walletId: c.walletId, action: 'ACCEPT', actor: walletHelpers.actor('MEMBER', customerNo), to: 'ACTIVE' });
        walletHelpers.notify(c.walletId, 'FAMILY_JOINED', { nickname: limits.nickname });
    });
    return { error: false, memberView: getMemberView(member) };
}

/**
 * @param {dw.customer.Customer} customer - invitee
 * @param {string} token - invitation token
 * @returns {Object} result
 */
function declineInvitation(customer, token) {
    var invitee = getInviteeContext(customer, token);
    if (invitee.error) return invitee;
    Transaction.wrap(function () {
        invitee.invitation.custom.status = 'DECLINED';
        walletHelpers.notify(invitee.invitation.custom.walletId, 'FAMILY_DECLINED', {});
    });
    return { error: false };
}

/**
 * @param {Object} context - owner wallet context
 * @param {string} memberNo - member customer number
 * @returns {?dw.object.CustomObject} the member, only when it belongs to this wallet
 */
function getOwnMember(context, memberNo) {
    var member = CustomObjectMgr.getCustomObject('WalletMember', String(memberNo || ''));
    return member && member.custom.walletId === context.walletId ? member : null;
}

/**
 * @param {Object} context - owner wallet context
 * @param {string} memberNo - member
 * @param {Object} data - member limit fields (dollars)
 * @param {?number} revision - revision the form showed
 * @returns {Object} result with memberView
 */
function updateMember(context, memberNo, data, revision) {
    var member = getOwnMember(context, memberNo);
    if (!member) return walletHelpers.errorResult('not-found');
    var check = checkMemberFields(data || {}, true);
    if (Object.keys(check.invalid).length) return walletHelpers.errorResult('invalid', check.invalid);
    var c = member.custom;
    if (revision !== null && revision !== undefined && revision !== (c.revision || 0)) return walletHelpers.errorResult('stale');
    Transaction.wrap(function () {
        Object.keys(check.value).forEach(function (name) { c[name] = check.value[name]; });
        c.revision = (c.revision || 0) + 1;
        walletHelpers.logAudit({ entityType: 'MEMBER', entityId: memberNo, walletId: context.walletId, action: 'UPDATE_LIMITS', actor: context.actor, detail: { fields: Object.keys(check.value).join(',') } });
    });
    return { error: false, memberView: getMemberView(member) };
}

/**
 * Revoke, pause or reactivate a member. Open approvals of the member expire at once.
 * @param {Object} context - owner wallet context
 * @param {string} memberNo - member
 * @param {string} to - REVOKED | FROZEN | ACTIVE
 * @returns {Object} result
 */
function setMemberStatus(context, memberNo, to) {
    var member = getOwnMember(context, memberNo);
    if (!member) return walletHelpers.errorResult('not-found');
    var c = member.custom;
    var from = c.status;
    if (!walletHelpers.canMove(MEMBER_FLOW, from, to)) return walletHelpers.errorResult('not-allowed-now');
    Transaction.wrap(function () {
        c.status = to;
        if (to === 'REVOKED') c.revokedAt = new Date();
        c.revision = (c.revision || 0) + 1;
        if (to !== 'ACTIVE') {
            walletHelpers.queryPage('WalletApproval', 'custom.memberCustomerNo = {0} AND (custom.status = {1} OR custom.status = {2})', null, [memberNo, 'PENDING', 'APPROVED'], 0, 100).items.forEach(function (a) {
                a.custom.status = 'EXPIRED'; // eslint-disable-line no-param-reassign
            });
        }
        walletHelpers.logAudit({ entityType: 'MEMBER', entityId: memberNo, walletId: context.walletId, action: 'STATUS', actor: context.actor, from: from, to: to });
        walletHelpers.notify(memberNo, to === 'ACTIVE' ? 'FAMILY_REACTIVATED' : 'FAMILY_ACCESS_CHANGED', {});
    });
    return { error: false };
}

/**
 * The family membership of the signed-in customer, for paying.
 * @param {dw.customer.Customer} customer - member
 * @returns {Object} {error: false, walletId, wallet, customerNo, member, actor}, or an error result
 */
function getMemberContext(customer) {
    if (!isFamilyEnabled()) return walletHelpers.errorResult('disabled');
    var customerNo = walletAccountHelpers.getCustomerNo(customer);
    if (!customerNo) return walletHelpers.errorResult('unauthenticated');
    var member = CustomObjectMgr.getCustomObject('WalletMember', customerNo);
    if (!member || member.custom.status !== 'ACTIVE') return walletHelpers.errorResult('forbidden', { reason: 'not-a-member' });
    var wallet = CustomObjectMgr.getCustomObject('WalletAccount', member.custom.walletId);
    if (!wallet) return walletHelpers.errorResult('not-found');
    return { error: false, walletId: member.custom.walletId, wallet: wallet, customerNo: customerNo, member: member, actor: walletHelpers.actor('MEMBER', customerNo) };
}

/**
 * @param {string} productId - product
 * @returns {string[]} category IDs of the product and their parents (variants use the master)
 */
function getCategoryIds(productId) {
    var product = require('dw/catalog/ProductMgr').getProduct(productId);
    if (!product) return [];
    var owner = product.isVariant() ? product.masterProduct : product;
    var ids = [];
    owner.categories.toArray().forEach(function (category) {
        var current = category;
        while (current && ids.indexOf(current.ID) < 0) {
            ids.push(current.ID);
            current = current.root ? null : current.parent;
        }
    });
    return ids;
}

/**
 * Member limits for a payment, including the categories of every product in the basket.
 * @param {dw.object.CustomObject} member - member
 * @param {number} amountCents - payment
 * @param {string[]} productIds - products being paid for
 * @returns {Object} result; limit-reached with fields.limit
 */
function checkMemberLimits(member, amountCents, productIds) {
    var c = member.custom;
    if (c.status !== 'ACTIVE') return walletHelpers.errorResult('forbidden', { reason: 'member-' + String(c.status).toLowerCase() });
    var w = walletAccountHelpers.getWindows(Date.now());
    var allowed = Array.prototype.slice.call(c.allowedCategoryIds || []);
    var limit = null;
    if (amountCents > c.perOrderLimitCents) limit = 'member-order';
    else if (walletAccountHelpers.getSpentSince(c.walletId, w.day, c.customerNo) + amountCents > c.dailyLimitCents) limit = 'member-daily';
    else if (walletAccountHelpers.getSpentSince(c.walletId, w.month, c.customerNo) + amountCents > c.monthlyLimitCents) limit = 'member-monthly';
    else if (allowed.length && productIds.some(function (id) { return !getCategoryIds(id).some(function (cat) { return allowed.indexOf(cat) >= 0; }); })) limit = 'member-category';
    return limit ? walletHelpers.errorResult('limit-reached', { limit: limit }) : { error: false };
}

/**
 * The member's own remaining allowance, without anything about the owner's balance.
 * @param {Object} memberContext - member context
 * @returns {Object} remaining limits
 */
function getAllowance(memberContext) {
    var c = memberContext.member.custom;
    var w = walletAccountHelpers.getWindows(Date.now());
    return {
        nickname: c.nickname,
        perOrderLimitCents: c.perOrderLimitCents,
        remainingTodayCents: Math.max(0, c.dailyLimitCents - walletAccountHelpers.getSpentSince(c.walletId, w.day, c.customerNo)),
        remainingThisMonthCents: Math.max(0, c.monthlyLimitCents - walletAccountHelpers.getSpentSince(c.walletId, w.month, c.customerNo)),
        requireOwnerApproval: !!c.requireOwnerApproval
    };
}

/**
 * Job helper: expires stale invitations.
 * @param {number} limit - maximum invitations
 * @returns {number} expired
 */
function expireInvitations(limit) {
    var due = walletHelpers.queryPage('WalletInvitation', 'custom.status = {0} AND custom.expiresAt <= {1}', null, ['INVITED', new Date()], 0, limit).items;
    due.forEach(function (i) {
        Transaction.wrap(function () { i.custom.status = 'EXPIRED'; });
    });
    return due.length;
}

module.exports = {
    MEMBER_FLOW: MEMBER_FLOW,
    isFamilyEnabled: isFamilyEnabled,
    checkMemberFields: checkMemberFields,
    getEmailHash: getEmailHash,
    getMembers: getMembers,
    getMemberView: getMemberView,
    invite: invite,
    getInvitation: getInvitation,
    sendAcceptCode: sendAcceptCode,
    acceptInvitation: acceptInvitation,
    declineInvitation: declineInvitation,
    getOwnMember: getOwnMember,
    updateMember: updateMember,
    setMemberStatus: setMemberStatus,
    getMemberContext: getMemberContext,
    getCategoryIds: getCategoryIds,
    checkMemberLimits: checkMemberLimits,
    getAllowance: getAllowance,
    expireInvitations: expireInvitations
};
