'use strict';

var store = require('./store');
var registryHelper = require('./registryHelper');
var permission = require('./registryPermissionHelper');
var items = require('./registryItemHelper');
var token = require('../util/token');
var prefs = require('../util/preferences');
var v = require('../util/validation');
/**
 * Create the pollHelper domain operation.
 * @param {*} actor - actor input
 * @param {*} input - input input
 * @returns {*} Domain result
 */
function create(actor, input) {
    prefs.requireFeature('RegistryPollsEnabled');
    return store.transaction(function () {
        var registry = registryHelper.get(input.registryKey);
        permission.requireRight(registry, actor, 'poll');
        var keys = v.text(input.options, 1000, true).split(',').map(function (key) { return key.trim(); });
        if (keys.length < 2 || keys.length > prefs.number('MaxPollOptions')) v.fail('INVALID_OPTIONS');
        keys.forEach(function (key, index) {
            if (keys.indexOf(key) !== index || items.resolve(registry, key).item.custom.sgStatus !== 'ACTIVE') v.fail('INVALID_OPTIONS');
        });
        var start = input.startAt ? v.date(input.startAt) : new Date();
        var end = v.date(input.endAt);
        if (end <= start || end.getTime() <= Date.now()) v.fail('INVALID_DATE');
        var id = token.random();
        store.create('RegistryPoll', id, { publicKey: id, registryKey: input.registryKey, title: v.text(input.title, 150, true),
            description: v.text(input.description, 1000), options: JSON.stringify(keys), counts: JSON.stringify(keys.map(function () { return 0; })),
            startAt: start, endAt: end, visibility: v.choice(input.visibility || 'MEMBERS', ['MEMBERS', 'REGISTRY']),
            allowGuest: v.bool(input.allowGuest), multiple: v.bool(input.multiple), resultsEarly: v.bool(input.resultsEarly), status: 'OPEN', revision: 0, reminderSent: false });
        var event = require('./activityHelper').record(input.registryKey, 'POLL_CREATED');
        require('./notificationHelper').enqueue(input.registryKey, event, 'poll');
        return id;
    });
}
/**
 * Visible the pollHelper domain operation.
 * @param {*} registry - registry input
 * @param {*} actor - actor input
 * @param {*} poll - poll input
 */
function visible(registry, actor, poll) {
    permission.view(registry, actor);
    if (!poll || poll.custom.registryKey !== registry.custom.publicKey || !registry.custom.showPolls
        || (poll.custom.visibility === 'MEMBERS' && !permission.role(registry, actor))) v.fail('NOT_FOUND', 404);
}
/**
 * Vote the pollHelper domain operation.
 * @param {*} actor - actor input
 * @param {*} input - input input
 * @returns {*} Domain result
 */
function vote(actor, input) {
    prefs.requireFeature('RegistryPollsEnabled');
    return store.transaction(function () {
        var registry = registryHelper.get(input.registryKey);
        permission.active(registry, actor);
        var poll = store.get('RegistryPoll', input.pollKey);
        visible(registry, actor, poll);
        var now = Date.now();
        if (poll.custom.status !== 'OPEN' || now < poll.custom.startAt.getTime() || now >= poll.custom.endAt.getTime()) v.fail('POLL_CLOSED', 409);
        if (!actor.customerNo && !(poll.custom.allowGuest && registry.custom.allowGuestVoting && prefs.enabled('GuestVotingEnabled'))) v.fail('LOGIN_REQUIRED', 401);
        var voter = actor.customerNo ? token.key(['customer', actor.customerNo]) : actor.actorHash;
        var key = token.key([input.pollKey, voter]);
        if (store.get('RegistryVote', key)) v.fail('ALREADY_VOTED', 409);
        var options = JSON.parse(poll.custom.options);
        var choices = v.text(input.choices, 1000, true).split(',');
        if ((!poll.custom.multiple && choices.length !== 1) || choices.length > options.length) v.fail('INVALID_OPTIONS');
        choices.forEach(function (choice, index) { if (options.indexOf(choice) === -1 || choices.indexOf(choice) !== index) v.fail('INVALID_OPTIONS'); });
        store.mutate('poll:' + input.pollKey, poll);
        store.create('RegistryVote', key, { pollKey: input.pollKey, choices: JSON.stringify(choices) });
        var counts = JSON.parse(poll.custom.counts);
        choices.forEach(function (choice) { counts[options.indexOf(choice)] += 1; });
        poll.custom.counts = JSON.stringify(counts);
        require('./activityHelper').record(input.registryKey, 'VOTE_CAST');
    });
}
/**
 * Close the pollHelper domain operation.
 * @param {*} actor - actor input
 * @param {*} input - input input
 */
function close(actor, input) {
    store.transaction(function () {
        var registry = registryHelper.get(input.registryKey);
        permission.requireRight(registry, actor, 'poll');
        var poll = store.get('RegistryPoll', input.pollKey);
        if (!poll || poll.custom.registryKey !== input.registryKey) v.fail('NOT_FOUND', 404);
        store.mutate('poll:' + input.pollKey, poll);
        poll.custom.status = 'CLOSED';
    });
}
module.exports = { create: create, vote: vote, close: close, visible: visible };
