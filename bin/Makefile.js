'use strict';

/* global cat, cd, cp, echo, exec, exit, find, ls, mkdir, pwd, rm, target, test */

require('shelljs/make');

var chalk = require('chalk'),
    path = require('path'),
    spawn = require('child_process').spawn;

function getSandboxUrl() {
    if (test('-f', path.join(process.cwd(), 'dw.json'))) {
        var config = cat(path.join(process.cwd(), 'dw.json'));
        var parsedConfig = JSON.parse(config);
        return '' + parsedConfig.hostname;
    }
    return '';
}

function getOptions(defaults, args) {
    var params = {};
    var i = 0;
    while (i < args.length) {
        var item = args[i];
        if (item.indexOf('--') === 0) {
            if (i + 1 < args.length && args[i + 1].indexOf('--') < 0) {
                var value = args[i + 1];
                value = value.replace(/\/+$/, "");
                params[item.substr(2)] = value;
                i += 2;
            } else {
                params[item.substr(2)] = true;
                i++;
            }
        } else {
            params[item] = true;
            i++;
        }
    }
    var options = Object.assign({}, defaults, params);
    return options;
}

function getOptionsString(options) {
    if (!options.baseUrl) {
        console.error(chalk.red('Could not find baseUrl parameter.'));
        process.exit();
    }

    var optionsString = '';

    Object.keys(options).forEach(function (key) {
        if (options[key] === true) {
            optionsString += key + ' ';
        } else {
            optionsString += '--' + key + ' ' + options[key] + ' ';
        }
    });

    return optionsString;
}

target.functional = function (args) {
    var defaults = {
        baseUrl: 'http://' + getSandboxUrl() + '/s/SiteGenesis',
        client: 'chrome'
    };

    var configFile = 'test/functional/webdriver/wdio.conf.js';
    if(args.indexOf('appium') > -1) {
        args.splice(args.indexOf('appium'), 1);
        configFile = 'test/functional/webdriver/wdio.appium.js'
        defaults = {
            baseUrl: 'http://' + getSandboxUrl() + '/s/SiteGenesis'
        }
    }

    var options = getOptions(defaults, args);
    var optionsString = getOptionsString(options);

    console.log(chalk.green('Installing selenium'));
    exec('node_modules/.bin/selenium-standalone install', { silent: true });

    console.log(chalk.green('Selenium Server started'));
    var selenium = exec('node_modules/.bin/selenium-standalone start', { async: true, silent: true });

    console.log(chalk.green('Running functional tests'));

    var tests = spawn('./node_modules/.bin/wdio  ' + configFile + ' ' + optionsString, { stdio: 'inherit', shell: true });

    tests.on('exit', function (code) {
        selenium.kill();
        console.log(chalk.green('Stopping Selenium Server'));
        process.exit(code);
    });
};

target.integration = function (args) {
    var defaults = {
        baseUrl: 'https://' + getSandboxUrl() + '/on/demandware.store/Sites-SiteGenesis-Site/en_US'
    };

    var options = getOptions(defaults, args);
    var optionsString = getOptionsString(options);

    if (Object.keys(options).length < 2) {
        optionsString += ' test/integration/*';
    }

    console.log(chalk.green('Running integration tests'));

    var tests = spawn('./node_modules/.bin/_mocha --reporter spec ' + optionsString, { stdio: 'inherit', shell: true });

    tests.on('exit', function (code) {
        process.exit(code);
    });

};

target.upload = function (files) {
    files.forEach(function (file) {
        var relativePath = path.relative('./cartridges/', file);
        cp('dw.json', './cartridges/');
        exec('cd cartridges && node ../node_modules/.bin/dwupload --file ' + relativePath + ' && cd ..');
        rm('./cartridges/dw.json');
    });
};
