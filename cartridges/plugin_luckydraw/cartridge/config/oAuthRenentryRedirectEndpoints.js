'use strict';

// Slot 9 returns customers to the lucky draw after login; lower slots belong to other plugins.
var endpoints = {};
Object.keys(module.superModule).forEach(function (key) {
    endpoints[key] = module.superModule[key];
});
endpoints[9] = 'LuckyDraw-Show';
module.exports = endpoints;
