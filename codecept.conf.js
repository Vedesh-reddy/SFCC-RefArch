const debug = require('debug')('acceptance:config');
let merge = require('deepmerge');
let codeceptjsShared = require('codeceptjs-shared');
let codeceptJsSauce = require('codeceptjs-saucelabs');
const cwd = process.cwd();
const path = require('path');
const fs = require('fs');

const RELATIVE_PATH = './test/acceptance';
const OUTPUT_PATH = RELATIVE_PATH + '/report';


function getDwJson() {
    if (fs.existsSync(path.join(cwd, 'dw.json'))) {
        return require(path.join(cwd, 'dw.json'));
    }
    return {};
}

const DEFAULT_HOST = getDwJson().hostname;
const HOST = DEFAULT_HOST || process.env.HOST;

const metadata = require('./test/acceptance/metadata.json');

const SAUCE_USER = process.env.SAUCE_USERNAME;
const SAUCE_KEY = process.env.SAUCE_KEY;
const userSpecificBrowsers = {
    firefox: {
        capabilities: {
            'sauce:options': {
                seleniumVersion: '3.11.0'
            },
        }
    },
    edge: {
        capabilities: {
            'sauce:options': {
                seleniumVersion: '3.11.0'
            }
        }
    },
    safari: {
        capabilities: {
            'sauce:options': {
                seleniumVersion: '3.11.0'
            }
        }
    }
}

let conf = {
    output: OUTPUT_PATH,
    cleanup: true,
    coloredLogs: true,
    helpers: {
        REST: {},
        WebDriver: {
            url: HOST,
            waitForTimeout: 10000
        }
    },
    plugins: {
        wdio: {
            enabled: true,
            services: ['selenium-standalone']
        },
        retryFailedStep: {
            enabled: true,
            retries: 3
        }
    },
    include: metadata.include,
    gherkin: {
        features: RELATIVE_PATH + '/features/**/*.feature',
        steps: metadata.gherkin_steps
    },
    name: 'storefront-reference-architecture'
};

exports.config = merge(merge(conf, codeceptjsShared.conf), codeceptJsSauce.conf(SAUCE_USER, SAUCE_KEY, userSpecificBrowsers));
