'use strict';

// Slot 7 returns sellers to Seller Central after login; lower slots belong to other plugins.
var endpoints = {};
Object.keys(module.superModule).forEach(function (key) {
    endpoints[key] = module.superModule[key];
});
endpoints[7] = 'Seller-Dashboard';
module.exports = endpoints;
