'use strict';

import { assert } from 'chai';
import { config } from '../../webdriver/wdio.conf';
import * as homePage from '../../../mocks/testDataMgr/pageObjects/home';
import * as footer from '../../../mocks/testDataMgr/pageObjects/footer';
import * as common from '../../../mocks/testDataMgr/helpers/common';
import url from 'url';



describe('Header navigation', () => {
    let sparams;

    let locale = config.locale;
    before(() => homePage.navigateTo());

    it('#1 Navigate to NewArrivals', () => {
        return browser.isVisible(homePage.NAVBAR)
            .then((isVisible) => {
                if(isVisible) {
                    return browser.click(homePage.NAVBAR)
                        .then(() => browser.waitForExist(homePage.LeftNavBar))
                        .then(() => browser.click())
                }
                else {
                    return browser.waitForVisible(footer.FOOTER_CONTAINER)
                        .click(homePage.NEW_ARRIVALS)
                        .waitForVisible(common.PRIMARY_CONTENT)
                        .url()
                        .then(currentUrl => {
                            let parseUrl = url.parse(currentUrl.value);
                            return assert.isTrue(parseUrl.pathname.endsWith('new%20arrivals/'));
                        })

                }
        })
    })

    it('#2 Navigate to Womens', () =>
        browser.waitForVisible(footer.FOOTER_CONTAINER)
            .click(homePage.WOMEN)
            .waitForVisible(common.PRIMARY_CONTENT)
            .url()
            .then(currentURL => {
                let parseUrl = url.parse(currentURL.value);
                return assert.isTrue(parseUrl.pathname.endsWith('womens/'));
            })
    );

    it('#3 Navigate to Mens', () =>
        browser.waitForVisible(footer.FOOTER_CONTAINER)
            .click(homePage.MEN)
            .waitForVisible(common.PRIMARY_CONTENT)
            .url()
            .then(currentURL => {
                let parseUrl = url.parse(currentURL.value);
                return assert.isTrue(parseUrl.pathname.endsWith('mens/'));
            })
    );


    it('#4 Navigate to Electronics', () => {
        if (locale !== 'x_default') {
        } else {
            browser.waitForVisible(footer.FOOTER_CONTAINER)
                .click(homePage.ELECTRONICS)
                .waitForVisible(common.PRIMARY_CONTENT)
                .url()
                .then(currentURL => {
                    let parseUrl = url.parse(currentURL.value);
                    return assert.isTrue(parseUrl.pathname.endsWith('electronics/'));
                });
        }

    });

    it('#5 Navigate to Top Sellers', () =>
        browser.waitForVisible(footer.FOOTER_CONTAINER)
            .click(homePage.TOP_SELLERS)
            .waitForVisible(common.PRIMARY_CONTENT)
            .then(() => common.getSearchParams())
            .then(params => {
                sparams = params;
                console.log('sparams = ', sparams);
            })
            .then(() => assert.equal(sparams.srule, 'top-sellers'))

    );
});
