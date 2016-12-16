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
import { config } from '../webdriver/wdio.conf';
import * as testDataMgr from '../../mocks/testDataMgr/main';

describe('Category Navifation and single Refinement - General Product', () => {
    const locale = config.locale;
    const topTitle = '.page-title';
    const productGeneral = {
        x_default: 'pants',
        en_GB: 'trousers',
        fr_FR: 'pantalon',
        it_IT: 'pantaloni',
        jp_JP: 'パンツ',
        zh_CN: '裤子'
    };
    const searchResultMsg = Resource.msgf('label.resultsfor', 'search', null, '79');
    const expectedString = searchResultMsg + ' ' + productGeneral[locale];
    let myQuerySelector;

    function verifySearchResults(selector, expectedResults) {
        return browser.getText(selector)
            .then(displayText => assert.equal(displayText, expectedResults));
    }
    before(() => testDataMgr.load()
        .then(() => homePage.navigateTo())
        .then(() => browser.waitForExist(search.searchForm))
    );

    it('#1 should return 275 Results when Navigate to Women->Clothing->Tops', () => {
        return browser.isVisible(homePage.navBarButton)
            .then((isVisible) => {
                if (isVisible) {
                    //  Access mobile devices
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
                    .getText(topTitle)
                    .then(title => assert.equal(title, 'Tops'))
                    .then(() => common.getVisibleSelector(search.searchResultLarge,
                        search.searchResultSmall))
                    .then(mySearchSelector => browser.getText(mySearchSelector))
                    .then(displayText => assert.equal(displayText, '275 Results'));
            });
    });

    it('#2 should return 12 results for color refinements=red', () => {
        return browser.isVisible(search.filterButton)
            .then((isVisible) => {
                if (isVisible) {
                    return browser.click(search.filterButton)
                        .then(() => browser.waitForExist(search.refinementBarColor))
                        .then(() => browser.click(search.refinementBarColor))
                        .then(() => browser.waitForExist(search.refinementBarColorActive))
                        .then(() => browser.click(search.blueColorRefinementSelector))
                        .then(() => browser.pause(2000))
                        .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                            search.colorRefinementSmall))
                        .then(mySearchSelector => browser.getText(mySearchSelector))
                        .then(displayText => assert.equal(displayText, '12 Results'));
                }
                // access desktop or laptop browser
                return browser.click(search.redColorRefinementSelector)
                    .then(() => browser.waitForExist(search.redColorRefinementSelectorChecked))
                    .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                        search.colorRefinementSmall))
                    .then(mySearchSelector => browser.getText(mySearchSelector))
                    .then(displayText => assert.equal(displayText, '12 Results'))
                    .then(() => common.waitUntilPageLoaded());
            });
    });

    it('#3 should return 275 results when un-check the color refinements=red', () => {
        return browser.isVisible(search.filterButton)
            .then((isVisible) => {
                if (isVisible) {
                    return browser.click(search.refinementCircle)
                        .then(() => common.waitUntilPageLoaded())
                        .then(() => browser.pause(2000))
                        .then(() => browser.getText('.search-results .grid-header .hidden-xs-down'))
                        .then(displayText => assert.equal(displayText, '79 Results for pants'));
                }
                // access desktop or laptop browser
                return browser.click(search.redColorRefinementSelectorChecked)
                    .then(() => browser.pause(2000))
                    .then(() => browser.waitForExist(search.redColorRefinementSelector))
                    .then(() => common.getVisibleSelector(search.searchResultLarge,
                        search.searchResultSmall))
                    .then(mySearchSelector => browser.getText(mySearchSelector))
                    .then(displayText => assert.equal(displayText, '275 Results'))
                    .then(() => common.waitUntilPageLoaded());
            });
    });

    it('#4 should return 172 results when select price refinements $50-$99.00', () => {
        return browser.isVisible(search.filterButton)
            .then((isVisible) => {
                if (isVisible) {
                    return browser.click(search.filterButton)
                        .then(() => browser.waitForExist(search.refinementBarPrice))
                        .then(() => browser.click(search.refinementBarPrice))
                        .then(() => browser.waitForExist(search.refinementBarPriceActive))
                        .then(() => browser.click(search.priceRefinementSelector))
                        .then(() => browser.pause(2000))
                        .then(() => browser.getText('.result-count.hidden-xs-down'))
                        .then(displayText => assert.equal(displayText, '8 Results for pants'));
                }
                // access desktop or laptop browser
                return browser.click(search.price3RefinementSelector)
                    .then(() => browser.pause(2000))
                    .then(() => browser.getAttribute(search.price3RefinementTitle, 'title'))
                    .then(title => assert.equal(title, 'Currently Refined by Price: $50 - $99.99'))
                    .then(() => browser.waitForExist(search.pdpMain))
                    .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                        search.colorRefinementSmall))
                    .then(mySearchSelector => browser.getText(mySearchSelector))
                    .then(displayText => assert.equal(displayText, '172 Results'))
                    .then(() => common.waitUntilPageLoaded());
            });
    });
    it('#5 should return 275 results when un-check price refinement', () => {
        return browser.isVisible(search.filterButton)
            .then((isVisible) => {
                if (isVisible) {
                    return browser.click(search.refinementPriceClose)
                        .then(() => browser.waitUntil(() => {
                            return browser.execute(() => document.readyState)
                                .then(loaded => loaded.value === 'complete');
                        }, 5000))
                        .then(() => browser.pause(2000))
                        .then(() => browser.getText('.search-results .grid-header .hidden-xs-down'))
                        .then(displayText => assert.equal(displayText, '79 Results for pants'));
                }
                // access desktop or laptop browser
                return browser.click(search.price3RefinementCheckSelector)
                    .then(() => browser.pause(2000))
                    .then(() => browser.getAttribute(search.price3RefinementTitle, 'title'))
                    .then(title => assert.equal(title, 'Refine by Price: $50 - $99.99'))
                    .then(() => browser.waitForExist(search.pdpMain))
                    .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                        search.colorRefinementSmall))
                    .then(mySearchSelector => browser.getText(mySearchSelector))
                    .then(displayText => assert.equal(displayText, '275 Results'))
                    .then(() => common.waitUntilPageLoaded());
            });
    });

    it('#6 should return 6 results when check New Arrival refinement', () => {
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (isTrue) {
                    return browser.click(search.filterButton)
                        .then(() => browser.waitForExist(search.refinementBarNewArrival))
                        .then(() => browser.click(search.refinementBarNewArrival))
                        .then(() => browser.waitForExist(search.refinementBarNewArrivalActive))
                        .then(() => browser.click(search.newArrivalRefinementUnchecked))
                        .then(() => browser.pause(2000))
                        .then(() => browser.waitForExist(search.pdpMain))
                        .then(() => browser.getText('.result-count.hidden-xs-down'))
                        .then(displayText => assert.equal(displayText, '8 Results for pants'));
                }
                // access desktop or laptop browser
                return browser.click(search.newArrivalRefinementUnchecked)
                    .then(() => browser.pause(2000))
                    .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                        search.colorRefinementSmall))
                    .then(mySearchSelector => browser.getText(mySearchSelector))
                    .then(displayText => assert.equal(displayText, '6 Results'))
                    .then(() => common.waitUntilPageLoaded());
            });
    });

    it('#7 should return 275 results when un-check New Arrival refinement', () => {
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (isTrue) {
                    return browser.click(search.refinementPriceClose)
                        .then(() => common.waitUntilPageLoaded())
                        .then(() => browser.pause(2000))
                        .then(() => browser.getText('.search-results .grid-header .hidden-xs-down'))
                        .then(displayText => assert.equal(displayText, '79 Results for pants'));
                }
                // access desktop or laptop browser
                return browser.click(search.newArrivalRefinementChecked)
                    .then(() => browser.pause(2000))
                    .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                        search.colorRefinementSmall))
                    .then(mySearchSelector => browser.getText(mySearchSelector))
                    .then(displayText => assert.equal(displayText, '275 Results'))
                    .then(() => common.waitUntilPageLoaded());
            });
    });
});

