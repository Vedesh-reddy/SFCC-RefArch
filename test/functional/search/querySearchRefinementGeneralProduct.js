'use strict';

/*
Query Search on General Product then do refinement
- Search for 'pants'
- refine by Color
- undo refinement
- refine by Price
- refine by New Arrival
- refine by Color, Price and New Arrival
- click on reset button
 */

import { assert } from 'chai';
import * as homePage from '../../mocks/testDataMgr/pageObjects/home';
import * as search from '../../mocks/testDataMgr/pageObjects/searchResult';
import * as common from '../../mocks/testDataMgr/helpers/common';
import { config } from '../webdriver/wdio.conf';
import * as testDataMgr from '../../mocks/testDataMgr/main';

describe('Query Search and Refinement - general product', () => {
    const productGeneral = 'pants';
    const locale = config.locale;
    const product1ID = '25502038';
    const product2ID = '25502027';
    const baseUrl = config.baseUrl;
    const localeStr = locale === 'x_default' ? 'en_US' : locale;

    var productMaster1;
    var expectedDisplayName1;
    var productMaster2;
    var expectedDisplayName2;

    before(() => testDataMgr.load()
        .then(() => homePage.navigateTo())
        .then(() => browser.waitForExist(search.searchForm))
        .then(() => {
            productMaster1 = testDataMgr.getProductById(product1ID);
            expectedDisplayName1 = productMaster1.getLocalizedProperty('displayName', locale);
            productMaster2 = testDataMgr.getProductById(product2ID);
            expectedDisplayName2 = productMaster2.getLocalizedProperty('displayName', locale);
        })
    );

    it('should return 79 Results for pants when query search for pants', () => {
        let myQuerySelector;
        return common.getVisibleSelector(search.searchQuerySelector1, search.searchQuerySelector2)
            .then(mySelector => {
                myQuerySelector = mySelector;
                return browser.setValue(myQuerySelector, productGeneral);
            })
            .then(() => browser.submitForm(myQuerySelector))
            .then(() => browser.waitForExist(search.pdpMain))
            .then(() => common.getVisibleSelector(search.searchResultLarge,
                search.searchResultSmall))
            .then(mySearchSelector => browser.getText(mySearchSelector))
            .then(displayText => assert.equal(displayText, '79 Results for pants'));
    });
// TODO : once RAP-5313 is resolved, this test needs to be updated on mobile platforms
    it('should return 18 results for color refinements=blue', () => {
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (isTrue) {
                    return browser.click(search.filterButton)
                        .then(() => browser.waitForExist(search.refinementBarColor))
                        .then(() => browser.click(search.refinementBarColor))
                        .then(() => browser.waitForExist(search.refinementBarColorActive))
                        .then(() => browser.click(search.blueColorRefinementSelector))
                        .then(() => browser.pause(2000))
                        .then(() => browser.waitForExist(search.pdpMain))
                        .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                            search.colorRefinementSmall))
                        .then(mySearchSelector => browser.getText(mySearchSelector))
                        .then(displayText => assert.equal(displayText, '18 Results for pants'));
                }
                return browser.click(search.blueColorRefinementSelector)
                    .then(() => browser.waitForExist(search.blueColorRefinementSelector))
                    .then(() => browser.isExisting(search.blueColorRefinementSelectorChecked))
                    .then(isSelected => assert.isTrue(isSelected))
                    .then(() => browser.waitForExist(search.pdpMain))
                    .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                        search.colorRefinementSmall))
                    .then(mySearchSelector => browser.getText(mySearchSelector))
                    .then(displayText => assert.equal(displayText, '18 Results for pants'));
            });
    });

    it('should return 79 results for pants when un-check the color refinements=blue', () => {
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (isTrue) {
                    return browser.click(search.refinementCircle)
                        .then(() => browser.waitUntil(() => {
                            return browser.execute(() => document.readyState)
                        .then(loaded => loaded.value === 'complete');
                        }, 5000))
                    .then(() => browser.pause(2000))
                    .then(() => browser.getText('.search-results .grid-header .hidden-xs-down'))
                    .then(displayText => assert.equal(displayText, '79 Results for pants'));
                }
                return browser.click(search.blueColorRefinementSelectorChecked)
                    .then(() => browser.waitForExist(search.blueColorRefinementSelector))
                    .then(() => browser.isExisting(search.blueColorRefinementSelector))
                    .then(isSelected => assert.isTrue(isSelected))
                    .then(() => browser.waitForExist(search.pdpMain))
                    .then(() => common.getVisibleSelector(search.searchResultLarge,
                        search.searchResultSmall))
                    .then(mySearchSelector => browser.getText(mySearchSelector))
                    .then(displayText => assert.equal(displayText, '79 Results for pants'));
            });
    });

    it('should return 8 results for pants when select price refinements $20-$49.00', () => {
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (isTrue) {
                    return browser.click(search.filterButton)
                        .then(() => browser.waitForExist(search.refinementBarPrice))
                        .then(() => browser.click(search.refinementBarPrice))
                        .then(() => browser.waitForExist(search.refinementBarPriceActive))
                        .then(() => browser.click(search.priceRefinementMobileSelector))
                        .then(() => browser.pause(2000))
                        .then(() => browser.waitForExist(search.pdpMain))
                        .then(() => browser.getText('.result-count.hidden-xs-down'))
                        .then(displayText => assert.equal(displayText, '8 Results for pants'));
                }
                return browser.click(search.priceRefinementSelector)
                    .then(() => browser.getAttribute(search.priceRefinementSelector, 'title'))
                    .then(title => assert.equal(title, 'Currently Refined by Price: $20 - $49.99'))
                    .then(() => browser.waitForExist(search.pdpMain))
                    .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                        search.colorRefinementSmall))
                    .then(mySearchSelector => browser.getText(mySearchSelector))
                    .then(displayText => assert.equal(displayText, '8 Results for pants'));
            });
    });

    it('should return 79 results for pants when un-check price refinement', () => {
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
                return browser.click(search.priceRefinementSelector)
                    .then(() => browser.getAttribute(search.priceRefinementSelector, 'title'))
                    .then(title => assert.equal(title, 'Refine by Price: $20 - $49.99'))
                    .then(() => browser.waitForExist(search.pdpMain))
                    .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                        search.colorRefinementSmall))
                    .then(mySearchSelector => browser.getText(mySearchSelector))
                    .then(displayText => assert.equal(displayText, '79 Results for pants'));
            });
    });

    it('should return 8 results for pants when check New Arrival refinement', () => {
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
                return browser.click(search.newArrivalRefinementUnchecked)
                    .then(() => browser.waitForExist(search.pdpMain))
                    .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                        search.colorRefinementSmall))
                    .then(mySearchSelector => browser.getText(mySearchSelector))
                    .then(displayText => assert.equal(displayText, '8 Results for pants'));
            });
    });

    it('should return 79 results for pants when un-check New Arrival refinement', () => {
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
                return browser.click(search.newArrivalRefinementChecked)
                    .then(() => browser.waitForExist(search.pdpMain))
                    .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                        search.colorRefinementSmall))
                    .then(mySearchSelector => browser.getText(mySearchSelector))
                    .then(displayText => assert.equal(displayText, '79 Results for pants'));
            });
    });

    it('should return 2 results for pants when refine by Color, Price and New Arrival', () => {
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (!isTrue) {
                    return browser.click(search.blackColorRefinementSelector)
                        .then(() => browser.waitForExist(search.blackColorRefinementSelector))
                        .then(() => browser.isExisting(search.blackColorRefinementSelectorChecked))
                        .then(isSelected => assert.isTrue(isSelected))
                        .then(() => browser.waitForExist(search.pdpMain))
                        .then(() => browser.click(search.priceRefinementSelector))
                        .then(() => browser.getAttribute(search.priceRefinementSelector, 'title'))
                        .then(title => assert.equal(title, 'Currently Refined by Price: $50 - $99.99'))
                        .then(() => browser.waitForExist(search.pdpMain))
                        .then(() => browser.click(search.newArrivalRefinementUnchecked))
                        .then(() => browser.waitForExist(search.pdpMain))
                        .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                            search.colorRefinementSmall))
                        .then(mySearchSelector => browser.getText(mySearchSelector))
                        .then(displayText => assert.equal(displayText, '2 Results for pants'));
                }
                return null;
            });
    });

    it('should return the correct names of the products when refined by Color, Price and New Arrival', () => {
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (!isTrue) {
                    return search.getNthProductTileProductName(1)
                        .then(productName => {
                            assert.equal(productName, expectedDisplayName1, 'Expected: displayed product name = ' + expectedDisplayName1);
                        })
                        .then(() => search.getNthProductTileProductName(2)
                            .then(productName2 => {
                                assert.equal(productName2, expectedDisplayName2, 'Expected: displayed product name = ' + expectedDisplayName2);
                            }));
                }
                return null;
            });
    });

    it('should return the correct images when refined by Color, Price and New Arrival', () => {
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (!isTrue) {
                    return search.getNthProductTileImageSrc(1)
                        .then(imageSrc => {
                            assert.isTrue(imageSrc.endsWith('images/medium/PG.10208949.JJ0NLA0.PZ.jpg'),
                                'product image: url not end with images/medium/PG.10208949.JJ0NLA0.PZ.jpg.');
                        })
                        .then(() => search.getNthProductTileImageSrc(2)
                            .then(imageSrc2 => {
                                assert.isTrue(imageSrc2.endsWith('images/medium/PG.10208897.JJ0QRXX.PZ.jpg'),
                                    'product image :url not end with images/medium/PG.10208897.JJ0QRXX.PZ.jpg.');
                            }));
                }
                return null;
            });
    });

    it('should return the correct href links when refined by Color, Price and New Arrival', () => {
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (!isTrue) {
                    const expectedLink1 = baseUrl + '/' + common.convertToUrlFormat(expectedDisplayName1) + '/' + product1ID + '.html?lang=' + localeStr;
                    const expectedLink2 = baseUrl + '/' + common.convertToUrlFormat(expectedDisplayName2) + '/' + product2ID + '.html?lang=' + localeStr;
                    return search.getNthProductTileImageHref(1)
                        .then(imageLink1 => {
                            assert.equal(imageLink1, expectedLink1, 'Expected image link not equal to ' + expectedLink1);
                        })
                        .then(() => search.getNthProductTileImageHref(2)
                            .then(imageLink2 => {
                                assert.equal(imageLink2, expectedLink2, 'Expected image link not equal to ' + expectedLink2);
                            }));
                }
                return null;
            });
    });

    it('should return the correct color swatch count when refined by Color, Price and New Arrival', () => {
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (!isTrue) {
                    return search.getNthProductTileColorSwatchCount(1)
                        .then(count => {
                            assert.equal(count, 1, 'Expected: the number of color swatch to be 1.');
                        })
                        .then(() => search.getNthProductTileColorSwatchCount(2)
                            .then(count => {
                                assert.equal(count, 1, 'Expected: the number of color swatch to be 1.');
                            }));
                }
                return null;
            });
    });

    it('should return 79 results for pants when reset button is clicked', () => {
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (!isTrue) {
                    return browser.click(search.resetButton)
                        .then(() => browser.waitForExist(search.pdpMain))
                        .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                            search.colorRefinementSmall))
                        .then(mySearchSelector => browser.getText(mySearchSelector))
                        .then(displayText => assert.equal(displayText, '79 Results for pants'));
                }
                return null;
            });
    });
});
