'use strict';

var store = require('../scripts/helpers/store');
var helper = require('../scripts/helpers/registryHelper');
var permissions = require('../scripts/helpers/registryPermissionHelper');
var prefs = require('../scripts/util/preferences');
var URLUtils = require('dw/web/URLUtils');
/**
 * Registry the registry domain operation.
 * @param {*} record - record input
 * @param {*} actor - actor input
 * @param {*} details - details input
 */
function Registry(record, actor, details) {
    permissions.view(record, actor);
    var c = record.custom;
    var role = permissions.role(record, actor);
    var manager = role === 'OWNER' || role === 'CO_OWNER';
    var secret = manager && c.secretGiftMode && c.revealAt && c.revealAt.getTime() > Date.now();
    this.key = c.publicKey;
    this.name = c.showOwnerNames || manager ? c.name : 'Gift registry';
    this.description = c.description;
    this.eventType = c.eventType;
    this.eventAt = c.showEventDate || manager ? c.eventAt.toISOString() : null;
    this.status = c.status;
    this.url = URLUtils.https('Registry-View', 'slug', c.slug).toString();
    this.role = role;
    this.canManage = manager && c.status !== 'ARCHIVED';
    this.canAdd = ['OWNER', 'CO_OWNER', 'EDITOR'].indexOf(role) !== -1 && c.status !== 'ARCHIVED';
    this.canComment = !!role && c.showComments && prefs.enabled('RegistryCommentsEnabled') && c.status !== 'ARCHIVED';
    this.canGift = c.status === 'ACTIVE';
    this.canReserve = this.canGift && prefs.enabled('RegistryReservationEnabled');
    this.canPurchase = this.canGift && prefs.enabled('RegistryPurchaseEnabled');
    this.canGroupGift = this.canGift && c.allowGroupGifting && prefs.enabled('GroupGiftingEnabled');
    this.allowAnonymous = c.allowAnonymousGifts && prefs.enabled('AnonymousGiftingEnabled');
    this.secret = secret;
    this.items = [];
    this.polls = [];
    this.activity = [];
    this.giftCount = 0;
    this.members = [];
    if (manager && details) {
        this.members = store.query('RegistryMember', 'custom.registryKey = {0} AND custom.status = {1}', [c.publicKey, 'ACTIVE'], prefs.number('MaxRegistryCollaborators')).map(function (member) {
            var customer = require('dw/customer/CustomerMgr').getCustomerByCustomerNumber(member.custom.customerNo);
            var profile = customer && customer.profile;
            var name = profile ? ((profile.firstName || '') + ' ' + (profile.lastName || '')).trim() : '';
            return { key: require('../scripts/util/token').key([c.publicKey, member.custom.customerNo]), role: member.custom.role, name: name || 'Collaborator' };
        });
    }
    if (!details) {
        var states = store.query('RegistryItemState', 'custom.registryKey = {0}', [c.publicKey], prefs.number('MaxRegistryItems'));
        this.itemCount = states.filter(function (state) { return state.custom.desired > 0; }).length;
        this.giftCount = states.reduce(function (total, state) { return total + state.custom.purchased; }, 0);
        this.reservedCount = secret ? null : states.reduce(function (total, state) { return total + state.custom.reserved; }, 0);
        if (!manager && !c.showPurchasedItems) { this.giftCount = null; this.reservedCount = null; }
        return;
    }
    var model = this;
    var mine = store.query('RegistryReservation', 'custom.registryKey = {0} AND custom.actorHash = {1} AND custom.status = {2}', [c.publicKey, actor.actorHash, 'ACTIVE'], 100);
    helper.list(record).productItems.toArray().forEach(function (item) {
        if (item.custom.sgStatus !== 'ACTIVE') return;
        var state = store.get('RegistryItemState', item.custom.sgItemKey);
        if (!state) return;
        model.giftCount += state.custom.purchased;
        var held = mine.filter(function (reservation) { return reservation.custom.itemKey === item.custom.sgItemKey && reservation.custom.expiresAt.getTime() > Date.now(); })[0];
        var product = item.product;
        var image = product && product.getImage('small', 0);
        var price = product && product.priceModel.price;
        var showCounts = !secret && (manager || c.showPurchasedItems);
        var row = { key: item.custom.sgItemKey, name: product ? product.name : 'Unavailable product', pid: product ? product.ID : null,
            reservationKey: held ? held.custom.publicKey : '', quantity: state.custom.desired, purchased: showCounts ? state.custom.purchased : null,
            reserved: showCounts ? state.custom.reserved : null,
            remaining: secret ? null : require('../scripts/util/validation').remaining(state.custom.desired, state.custom.purchased, state.custom.reserved),
            price: price && price.available ? price.toFormattedString() : '',
            notes: item.custom.sgNotes, priority: item.priority, image: image ? image.absURL.toString() : null,
            groupGift: null, allowGroupGifting: item.custom.sgAllowGroupGifting, comments: [] };
        if (item.custom.sgGroupGiftKey && !secret) row.groupGift = new (require('./groupGift'))(store.get('GroupGift', item.custom.sgGroupGiftKey), actor);
        if (c.showComments && prefs.enabled('RegistryCommentsEnabled')) {
            row.comments = store.query('RegistryComment', 'custom.registryKey = {0} AND custom.itemKey = {1} AND custom.state = {2}', [c.publicKey, row.key, 'ACTIVE'], 20, 'creationDate desc')
                .map(function (comment) { return { key: comment.custom.publicKey, text: comment.custom.text, author: 'Collaborator', canDelete: manager || actor.customerNo === comment.custom.authorNo }; });
        }
        model.items.push(row);
    });
    this.items.sort(function (a, b) { return a.priority - b.priority; });
    if (c.showPolls && prefs.enabled('RegistryPollsEnabled')) {
        store.query('RegistryPoll', 'custom.registryKey = {0}', [c.publicKey], 20, 'creationDate desc').forEach(function (poll) {
            if (poll.custom.visibility === 'MEMBERS' && !role) return;
            var options = JSON.parse(poll.custom.options);
            var counts = JSON.parse(poll.custom.counts);
            var total = counts.reduce(function (sum, value) { return sum + value; }, 0);
            var closed = poll.custom.status !== 'OPEN' || poll.custom.endAt.getTime() <= Date.now();
            var show = poll.custom.resultsEarly || closed;
            model.polls.push({ key: poll.custom.publicKey, title: poll.custom.title, endAt: poll.custom.endAt.toISOString(), multiple: poll.custom.multiple,
                canVote: !closed && poll.custom.startAt.getTime() <= Date.now() && (!!role || !!actor.customerNo || (poll.custom.allowGuest && c.allowGuestVoting && prefs.enabled('GuestVotingEnabled'))),
                options: options.map(function (key, index) {
                    var item = model.items.filter(function (row) { return row.key === key; })[0];
                    var percent = total ? Math.round(counts[index] * 100 / total) : 0;
                    return { key: key, name: item ? item.name : 'Unavailable product', percent: show ? percent : null };
                }) });
        });
    }
    if (!secret) this.activity = store.query('RegistryActivity', 'custom.registryKey = {0}', [c.publicKey], 20, 'creationDate desc')
        .filter(function (event) { return c.showPurchasedItems || !/PURCHASED|CONTRIBUTION|FUNDED|RESERVED/.test(event.custom.type); })
        .map(function (event) { return { type: event.custom.type, at: event.custom.occurredAt.toISOString(), actor: event.custom.anonymous ? 'Anonymous Guest' : 'A participant' }; });
    if (!c.showPurchasedItems && !manager) this.giftCount = null;
}
module.exports = Registry;
