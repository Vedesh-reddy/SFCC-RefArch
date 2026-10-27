'use strict';

// Slot 8 returns customers to their wallet after login; lower slots belong to other plugins.
var endpoints = {};
Object.keys(module.superModule).forEach(function (key) {
    endpoints[key] = module.superModule[key];
});
endpoints[8] = 'Wallet-Show';
module.exports = endpoints;
