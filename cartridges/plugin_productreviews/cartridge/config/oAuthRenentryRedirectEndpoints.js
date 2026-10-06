'use strict';

var endpoints = {};
Object.keys(module.superModule).forEach(function (key) {
    endpoints[key] = module.superModule[key];
});
endpoints[3] = 'Reviews-Return';
module.exports = endpoints;
