'use strict';

/*
Category Refinement on General Product
- Navigate to Women->Clothing->Tops
- Verify 275 results returned and the page title says Tops
- refine by color Red
- Verify 12 results returned, click on reset button
- Verify 275 results returned
- refine by new arrivals, Verify 6 results returned, reset it back to 275
- refine by size  XS, verify returned 46 results, reset it back to 275
- refine by price $50-$99.99, verify returned by 172 results, reset it back
- refine by color red, size XS and price $50-99.99 at the same time
- verify 2 results returned and verify the product details
 */

import { assert } from 'chai';
import * as homePage from '../../mocks/testDataMgr/pageObjects/home';
import * as keyboard from '../../mocks/testDataMgr/helpers/keyboard';
import * as common from '../../mocks/testDataMgr/helpers/common';
import * as search from '../../mocks/testDataMgr/pageObjects/searchResult';
import * as productDetails from '../../mocks/testDataMgr/pageObjects/productDetail';
import url from 'url';
import { config } from '../webdriver/wdio.conf';
import * as testDataMgr from '../../mocks/testDataMgr/main';

describe.only('Category Refinements - General Product', () => {
    const locale = config.locale;
    const baseUrl = config.baseUrl;
    const localeStr = locale === 'x_default' ? 'en_US' : locale;
    const selector = '.navbar-nav .nav-item[role=button]:nth-child(2) .dropdown-item[role=button]:nth-child(1) .dropdown-item[role=button]:nth-child(2) a';

    before(() => testDataMgr.load()
        .then(() => homePage.navigateTo())
        .then(() => browser.waitForExist(search.searchForm))
    );

    it('#1 Navigate to Women->Clothing->Tops', () => {
        return browser.isVisible(homePage.navBarButton)
            .then((isVisible) => {
                //  Access mobile devices
                if (isVisible) {
                    return browser.click(homePage.navBarButton)
                        .then(() => browser.waitForVisible(homePage.closeButton))
                        .then(() => browser.click(homePage.navNewArrivalButton))
                        .then(() => browser.waitForVisible(homePage.backButton))
                        .then(() => browser.click(homePage.navTopCategory))
                        .then(() => browser.waitForVisible(common.CATEGORYSLOT))
                        .then(() => browser.url())
                        .then(currentUrl => verifyURL(currentUrl, newArrivalLink));
                }
                //  Access desktop or laptop browsers
                return browser.click(search.searchForm)
                    .keys(keyboard.TAB)
                    .keys(keyboard.TAB)
                    .keys(keyboard.TAB)
                    .keys(keyboard.DOWN)
                    .keys(keyboard.RIGHT)
                    .keys(keyboard.DOWN)
                    .keys(keyboard.ENTER)
                    .pause(5000)

            });
    });


})

