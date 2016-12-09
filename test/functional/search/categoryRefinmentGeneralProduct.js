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

describe('Category Refinements - General Product', () => {
    const locale = config.locale;
    const baseUrl = config.baseUrl;
    const localeStr = locale === 'x_default' ? 'en_US' : locale;
    const topTitle = '.page-title';
    const expectedDisplayName1 = 'Floral Poncho Blouse';
    const expectedDisplayName2 = 'Swing Tank';

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
            .then((isTrue) => {
                if (isTrue) {
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
            .then((isTrue) => {
                if (isTrue) {
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

    it('#8 should return 2 results when refine by Color, Price and Size', () => {
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (isTrue) {
                    // access mobile device

                }
                // access desktop or laptop browser
                return browser.click(search.redColorRefinementSelector)
                    .pause(2000)
                    .click(search.price3RefinementSelector)
                    .pause(2000)
                    .getAttribute(search.price3RefinementTitle, 'title')
                    .then(title => assert.equal(title, 'Currently Refined by Price: $50 - $99.99'))
                    .click(search.size8RefinementSelector)
                    .pause(2000)
                    .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                        search.colorRefinementSmall))
                    .then(mySearchSelector => browser.getText(mySearchSelector))
                    .then(displayText => assert.equal(displayText, '2 Results'))
                    .then(() => common.waitUntilPageLoaded())
                    .then(() => browser.click(search.customSelect))
                    .then(() => browser.click(search.sortOrderProductAtoZ))
                    .then(() => browser.pause(2000))
                    .then(() => common.waitUntilPageLoaded());
            });
    });

    it('#9 should return the correct names of the products when refined by Color, Price and Size', () => {
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (isTrue) {
                    // access mobile devices
                }
                // access desktop/laptop browsers
                return search.getNthProductTileProductName(1)
                    .then(productName => {
                        return assert.equal(productName, expectedDisplayName1, 'Expected: displayed product name = ' + expectedDisplayName1);
                    })
                    .then(() => search.getNthProductTileProductName(2)
                        .then(productName2 => {
                            return assert.equal(productName2, expectedDisplayName2, 'Expected: displayed product name = ' + expectedDisplayName2);
                        }))
                    .then(() => common.waitUntilPageLoaded());
            });
    });

    it('#10. should return the correct images when refined by Color, Price and Size', () => {
        const product1ImageSrc = 'images/medium/PG.10229049.JJ1TOA0.PZ.jpg';
        const product2ImageSrc = 'images/medium/PG.10229049.JJ1TOA0.PZ.jpg';
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (isTrue) {
                    // access mobile devices
                }
                // access desktop/laptop browsers
                return search.getNthProductTileImageSrc(1)
                    .then(imageSrc => {
                        return assert.isTrue(imageSrc.endsWith(product1ImageSrc),
                            'product image: url not end with ' + product1ImageSrc);
                    })
                    .then(() => search.getNthProductTileImageSrc(1)
                        .then(imageSrc2 => {
                            return assert.isTrue(imageSrc2.endsWith(product2ImageSrc),
                                'product image :url not end with ' + product2ImageSrc);
                        }))
                    .then(() => common.waitUntilPageLoaded());
            });
    });

    it('#11 should return the correct href links when refined by Color, Price and Size', () => {
        const product1ID = '25565106';
        const product2ID = '25565139';

        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (isTrue) {
                    // access mobile devices
                }
                // access desktop/laptop browsers
                const expectedLink1 = baseUrl + '/' + common.convertToUrlFormat(expectedDisplayName1) + '/' + product1ID + '.html?lang=' + localeStr;
                const expectedLink2 = baseUrl + '/' + common.convertToUrlFormat(expectedDisplayName2) + '/' + product2ID + '.html?lang=' + localeStr;
                return search.getNthProductTileImageHref(1)
                    .then(imageLink1 => {
                        assert.equal(imageLink1, expectedLink1, 'Expected image link not equal to ' + expectedLink1);
                    })
                    .then(() => search.getNthProductTileImageHref(2)
                        .then(imageLink2 => {
                            assert.equal(imageLink2, expectedLink2, 'Expected image link not equal to ' + expectedLink2);
                        }))
                    .then(() => common.waitUntilPageLoaded());
            });
    });

    it('#12 should return the correct color swatch count when refined by Color, Price and Size', () => {
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (isTrue) {
                    // access mobile devices
                }
                // access desktop/laptop browsers
                return search.getNthProductTileColorSwatchCount(1)
                    .then(count => assert.equal(count, 1, 'Expected: the number of color swatch to be 1.'))
                    .then(() => search.getNthProductTileColorSwatchCount(2)
                        .then(count => assert.equal(count, 2, 'Expected: the number of color swatch to be 2.')))
                    .then(() => common.waitUntilPageLoaded());
            });
    });

    it('#13 should return 79 results for pants when reset button is clicked', () => {
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (isTrue) {
                    // access mobile devices
                }
                // access desktop/laptop browsers
                return browser.click(search.resetButton)
                    .then(() => browser.waitForExist(search.pdpMain))
                    .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                        search.colorRefinementSmall))
                    .then(mySearchSelector => browser.getText(mySearchSelector))
                    .then(displayText => assert.equal(displayText, '275 Results'));
            });
    });
});

