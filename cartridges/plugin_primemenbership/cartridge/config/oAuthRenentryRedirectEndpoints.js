'use strict';

// Slot 10 returns customers to the membership pages after login; lower slots belong to other plugins.
var endpoints = {};
Object.keys(module.superModule).forEach(function (key) {
    endpoints[key] = module.superModule[key];
});
endpoints[10] = 'PrimeMembership-Dashboard';
module.exports = endpoints;
