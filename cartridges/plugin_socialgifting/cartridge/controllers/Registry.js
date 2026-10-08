'use strict';

var server = require('server');
var URLUtils = require('dw/web/URLUtils');
var security = require('*/cartridge/scripts/middleware/socialGifting');
var csrf = require('*/cartridge/scripts/middleware/csrf');
var helper = require('*/cartridge/scripts/helpers/registryHelper');
var store = require('*/cartridge/scripts/helpers/store');
var permission = require('*/cartridge/scripts/helpers/registryPermissionHelper');
var Model = require('*/cartridge/models/registry');
var token = require('*/cartridge/scripts/util/token');
var v = require('*/cartridge/scripts/util/validation');
/**
 * Login the Registry domain operation.
 * @param {*} req - req input
 * @param {*} res - res input
 * @returns {*} Domain result
 */
function login(req, res) {
    var actor = security.actor(req);
    if (!actor.customerNo) { res.redirect(URLUtils.https('Login-Show')); return null; }
    return actor;
}
server.get('Button', server.middleware.include, csrf.generateToken, security.page(function (req, res) {
    var actor = security.actor(req);
    var registries = actor.customerNo ? helper.dashboard(actor).filter(function (record) {
        return record.custom.status !== 'ARCHIVED' && ['OWNER', 'CO_OWNER', 'EDITOR'].indexOf(permission.role(record, actor)) !== -1;
    }).map(function (record) { return { key: record.custom.publicKey, name: record.custom.name }; }) : [];
    res.render('registry/button', { registries: registries, pid: v.text(req.querystring.pid, 100), loggedIn: !!actor.customerNo });
}));
server.get('Dashboard', server.middleware.https, csrf.generateToken, security.page(function (req, res) {
    var actor = login(req, res);
    if (actor) res.render('registry/dashboard', { registries: helper.dashboard(actor).map(function (record) { return new Model(record, actor, false); }) });
}));
server.get('Create', server.middleware.https, csrf.generateToken, security.page(function (req, res) {
    var actor = login(req, res);
    if (actor) res.render('registry/edit', { registry: null, privacyFields: helper.privacyFields, addresses: actor.customer.addressBook.addresses.toArray().map(function (address) { return { id: address.ID }; }) });
}));
server.get('Edit', server.middleware.https, csrf.generateToken, security.page(function (req, res) {
    var actor = login(req, res);
    if (!actor) return;
    var record = helper.get(req.querystring.key);
    permission.requireRight(record, actor, 'edit');
    // Explicit editable fields, never pass a raw persistent object to ISML.
    var edit = { key: record.custom.publicKey };
    ['name', 'description', 'eventType', 'visibility', 'status', 'slug', 'partnerName'].concat(helper.privacyFields).forEach(function (name) { edit[name] = record.custom[name]; });
    edit.eventAt = record.custom.eventAt.toISOString();
    res.render('registry/edit', { registry: edit, privacyFields: helper.privacyFields, addresses: record.custom.ownerNo === actor.customerNo ? actor.customer.addressBook.addresses.toArray().map(function (address) { return { id: address.ID }; }) : [] });
}));
server.get('View', server.middleware.https, csrf.generateToken, security.page(function (req, res) {
    var slug = v.text(req.querystring.slug, 80, true);
    var claim = store.get('RegistrySlug', slug);
    if (!claim) v.fail('NOT_FOUND', 404);
    var record = helper.get(claim.custom.registryKey);
    if (record.custom.slug !== slug) v.fail('NOT_FOUND', 404);
    if (req.querystring.token) {
        var hash = token.hash(v.text(req.querystring.token, 64, true));
        if (hash !== record.custom.shareHash || record.custom.status === 'ARCHIVED') v.fail('NOT_FOUND', 404);
        req.session.privacyCache.set('sgShare:' + record.custom.publicKey, hash);
        res.redirect(URLUtils.https('Registry-View', 'slug', slug));
        return;
    }
    res.render('registry/registryPage', { registry: new Model(record, security.actor(req, record.custom.publicKey), true) });
}));
server.get('AcceptInvite', server.middleware.https, csrf.generateToken, security.page(function (req, res) {
    if (req.querystring.token) {
        var raw = v.text(req.querystring.token, 64, true);
        if (!/^[a-f0-9]{64}$/i.test(raw)) v.fail('INVALID_INVITATION', 404);
        req.session.privacyCache.set('sgInvite', token.hash(raw));
        res.redirect(URLUtils.https('Registry-AcceptInvite'));
        return;
    }
    res.render('registry/invitation', { loggedIn: !!security.actor(req).customerNo });
}));
server.post('Save', server.middleware.https, security.post('save', function (req, res, actor) {
    var key = helper.save(actor, req.form);
    return { redirectUrl: URLUtils.https('Registry-View', 'slug', helper.get(key).custom.slug).toString() };
}));
server.post('Archive', server.middleware.https, security.post('archive', function (req, res, actor) { helper.archive(actor, req.form.registryKey); return { redirectUrl: URLUtils.https('Registry-Dashboard').toString() }; }));
server.post('Share', server.middleware.https, security.post('share', function (req, res, actor) {
    var value = helper.share(actor, req.form.registryKey);
    return { shareURL: URLUtils.https('Registry-View', 'slug', helper.get(req.form.registryKey).custom.slug, 'token', value).toString() };
}));
server.post('AddProduct', server.middleware.https, security.post('add', function (req, res, actor) { return { itemKey: require('*/cartridge/scripts/helpers/registryItemHelper').add(actor, req.form) }; }));
server.post('RemoveProduct', server.middleware.https, security.post('remove', function (req, res, actor) { require('*/cartridge/scripts/helpers/registryItemHelper').update(actor, req.form, true); }));
server.post('UpdateProduct', server.middleware.https, security.post('update', function (req, res, actor) { require('*/cartridge/scripts/helpers/registryItemHelper').update(actor, req.form, false); }));
server.post('Invite', server.middleware.https, security.post('invite', function (req, res, actor) { require('*/cartridge/scripts/helpers/invitationHelper').invite(actor, req.form); return { message: 'Invitation sent.' }; }));
server.post('ConfirmInvite', server.middleware.https, security.post('accept', function (req, res, actor) {
    var key = require('*/cartridge/scripts/helpers/invitationHelper').accept(actor, req.session.privacyCache.get('sgInvite'));
    req.session.privacyCache.set('sgInvite', null);
    return { redirectUrl: URLUtils.https('Registry-View', 'slug', helper.get(key).custom.slug).toString() };
}));
server.post('RevokeMember', server.middleware.https, security.post('revoke', function (req, res, actor) { require('*/cartridge/scripts/helpers/invitationHelper').revoke(actor, req.form); }));
module.exports = server.exports();
