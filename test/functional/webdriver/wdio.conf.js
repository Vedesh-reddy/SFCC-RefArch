'use strict';

var minimist = require('minimist');
var argv = minimist(process.argv.slice(2));
var getConfig = require('@tridnguyen/config');

var opts = Object.assign({}, getConfig({
    client: 'chrome',
    url: 'https://REPLACE.ME',
    suite: '*',
    coverage: 'smoke',
    reporter: 'spec',
    timeout: 60000,
    locale: 'x_default',
    user: 'testuser1'
}, './config.json'), argv);

var specs = 'test/functional/' + opts.suite;

var sauce = {};

if (opts.sauce) {
    if (!process.env.SAUCE_USER && !process.env.SAUCE_ACCESS_KEY) {
        throw new Error('Sauce Labs user and access key are required');
    }
    sauce.host = 'ondemand.saucelabs.com';
    sauce.port = 80;
    sauce.user = process.env.SAUCE_USER;
    sauce.key = process.env.SAUCE_ACCESS_KEY;
    sauce.capabilities = opts.capabilities;
}

if (opts.suite.indexOf('.js') === -1) {
    specs += '/**';
}

exports.config = Object.assign({
    framework: 'mocha',
    mochaOpts: {
        ui: 'bdd',
        timeout: opts.timeout,
        compilers: ['js:babel-core/register']
    },
    specs: [
        specs
    ],
    capabilities: [{
        browserName: opts.client
    }],
    waitforTimeout: opts.timeout,
    baseUrl: opts.url,
    reporter: opts.reporter,
    reporterOptions: {
        outputDir: 'test/reports'
    },
    locale: opts.locale,
    coverage: opts.coverage,
    user: opts.user,
    userEmail: opts.userEmail || opts.user + '@demandware.com'
}, sauce);
