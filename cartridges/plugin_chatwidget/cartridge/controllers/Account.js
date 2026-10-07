'use strict';

/**
 * Journals widget-originated sign-in, registration and profile updates on the
 * inherited SFRA Account routes. Only outcomes are stored, never credentials.
 * @module controllers/Account
 */

var server = require('server');
var journey = require('*/cartridge/scripts/helpers/journey');

server.extend(module.superModule);

server.prepend('Login', journey.observe('login'));
server.prepend('SubmitRegistration', journey.observe('register'));
server.prepend('SaveProfile', journey.observe('profile_updated'));

module.exports = server.exports();
