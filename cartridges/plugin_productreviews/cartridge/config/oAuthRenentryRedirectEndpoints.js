'use strict';

/**
 * Extend SFRA's endpoint mapping without discarding the base login/checkout entries.
 * Slot 3 belongs to Reviews-Return; reconcile this slot with other overlay cartridges.
 * @module config/oAuthRenentryRedirectEndpoints
 */

var endpoints = {};
Object.keys(module.superModule).forEach(function (key) {
    endpoints[key] = module.superModule[key];
});
endpoints[3] = 'Reviews-Return';
module.exports = endpoints;
