"use strict";

var _ = require('lodash');
var minimist = require('minimist');
var getConfig = require('@tridnguyen/config');
var argv = minimist(process.argv.slice(2));
var webdriverio = require('webdriverio');

var opts = _.assign({}, getConfig({
    client: 'chrome',
    url: 'http://dev02-lab03b-dw.demandware.net/on/demandware.store/Sites-SiteGenesis-Site/',
    suite: '*',
    coverage : 'smoke',
    reporter: 'spec',
    timeout: 60000,
    locale: 'x_default',
    user: 'testuser1'
}, './config.json'), argv);

var specs = 'test/appium/' + opts.suite;

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

exports.config = _.assign({
    framework: 'mocha',
    mochaOpts: {
        ui: 'bdd',
        timeout: opts.timeout,
        compilers: ['js:babel-core/register']
    },
    specs: [
        specs
    ],
    port: '4723',
    capabilities: [{
        browserName: 'safari',
        appiumVersion: '1.4.13',
        deviceName: 'iPad Retina',
        platformVersion: '9.2',
        platformName: 'iOS',
        app: 'Safari'
    }],
    waitforTimeout: opts.timeout,
    baseUrl: opts.url,
    reporter: opts.reporter,
    reporterOptions: {
        outputDir: 'test/AppiumReports'
    },
    locale: opts.locale,
    coverage: opts.coverage,
    user: opts.user,
    userEmail: opts.userEmail || opts.user + '@demandware.com'
}, sauce);
