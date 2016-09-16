"use strict";

import {assert} from 'chai';

//do "npm install webdriverio" before import
var webdriverio = require('webdriverio');

var browser = webdriverio.remote({
    port: 4723,
    desiredCapabilities: {
        'browserName': 'safari',
        'appiumVersion': '1.4.13',
        'deviceName': 'iPad Retina',
        'device-orientation': 'portrait',
        'platformVersion': '9.2',
        'platformName': 'iOS',
        'app': ''
    }
});

// import {config} from '../../functional/webdriver/wdio.appium.js';

describe('Product Item', () => {
    const variantId = 708141677197;
    const basePath = 'en_US/Product-Show/?pid=708141677197';
    // console.log('url is', config.baseUrl + basePath);

    before(() => {
        console.log('[before] Starting...');
        return browser
            .init()
            .url('http://dev02-lab03b-dw.demandware.net/on/demandware.store/Sites-SiteGenesis-Site/en_US/Product-Show/?pid=708141677197');
    });

    it('should display its product ID', () => {
        console.log('[it] Starting test...');
        return browser
            // .getText(`#item-variantId .product-number`)
            .getText(`.product-id`)
            .then(itemNumber => {
                console.log('Item No = ', itemNumber);
                return assert.equal(itemNumber, variantId);
            })
    });

})
