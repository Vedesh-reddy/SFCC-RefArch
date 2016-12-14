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

    function verifySearchResults(selector, expectedResults) {
        return browser.getText(selector)
            .then(displayText => assert.equal(displayText, expectedResults));
    }

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

    it('#1 should return 79 Results for pants when query search for pants', () => {
        let myQuerySelector;
        return common.getVisibleSelector(search.searchQuerySelector1, search.searchQuerySelector2)
            .then(mySelector => {
                myQuerySelector = mySelector;
                return browser.setValue(myQuerySelector, productGeneral);
            })
            .then(() => browser.submitForm(myQuerySelector))
            .then(() => browser.pause(2000))
            .then(() => common.getVisibleSelector(search.searchResultLarge,
                search.searchResultSmall))
            .then(mySearchSelector => verifySearchResults(mySearchSelector, '79 Results for pants'));
    });

    it('#2 should return 18 results for color refinements=blue', () => {
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                // access mobile devices
                if (isTrue) {
                    return browser.click(search.filterButton)
                        .then(() => browser.waitForExist(search.refinementBarColor))
                        .then(() => browser.click(search.refinementBarColor))
                        .then(() => browser.waitForExist(search.refinementBarColorActive))
                        .then(() => browser.click(search.blueColorRefinementSelector))
                        .then(() => common.waitUntilAjaxCallEnded())
                        .then(() => browser.click('.close'))
                        .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                            search.colorRefinementSmall))
                        .then(mySearchSelector => verifySearchResults(mySearchSelector, '18 Results for pants'));
                }
                // access desktop/laptop
                return browser.click(search.blueColorRefinementSelector)
                    .then(() => common.waitUntilAjaxCallEnded())
                    .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                        search.colorRefinementSmall))
                    .then(mySearchSelector => verifySearchResults(mySearchSelector, '18 Results for pants'));
            });
    });

    it('#3 should return 79 results for pants when un-check the color refinements=blue', () => {
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (isTrue) {
                    // access mobile devices
                    return browser.click(search.filterButton)
                        .then(() => browser.waitForExist(search.refinementBarColorActive))
                        .then(() => browser.click(search.blueColorRefinementSelectorChecked))
                        .then(() => common.waitUntilAjaxCallEnded())
                        .then(() => browser.click(search.buttonClose))
                        .then(() => verifySearchResults(search.searchResultMobile, '79 Results for pants'));
                }
                // access desktop/laptop
                return browser.click(search.blueColorRefinementSelectorChecked)
                    .then(() => common.waitUntilAjaxCallEnded())
                    .then(() => common.getVisibleSelector(search.searchResultLarge,
                        search.searchResultSmall))
                    .then(mySearchSelector => verifySearchResults(mySearchSelector, '79 Results for pants'));
            });
    });

    it('#4 should return 8 results for pants when select price refinements $20-$49.00', () => {
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (isTrue) {
                    // access mobile devices
                    return browser.click(search.filterButton)
                        .then(() => browser.waitForExist(search.refinementBarPrice))
                        .then(() => browser.click(search.refinementBarPrice))
                        .then(() => browser.waitForExist(search.refinementBarPriceActive))
                        .then(() => browser.click(search.priceRefinementSelector))
                        .then(() => common.waitUntilAjaxCallEnded())
                        .then(() => browser.click(search.buttonClose))
                        .then(() => verifySearchResults(search.searchResultCount, '8 Results for pants'));
                }
                // access desktop/laptop
                return browser.click(search.priceRefinementSelector)
                    .then(() => common.waitUntilAjaxCallEnded())
                    .then(() => browser.getAttribute(search.priceRefinementTitle, 'title'))
                    .then(title => assert.equal(title, 'Currently Refined by Price: $20 - $49.99'))
                    .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                        search.colorRefinementSmall))
                    .then(mySearchSelector => verifySearchResults(mySearchSelector, '8 Results for pants'));
            });
    });

    it('#5 should return 79 results for pants when un-check price refinement', () => {
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (isTrue) {
                    // access mobile devices
                    return browser.click(search.filterButton)
                        .then(() => browser.waitForExist(search.refinementBarPriceActive))
                        .then(() => browser.click(search.priceRefinementMobileSelector))
                        .then(() => common.waitUntilAjaxCallEnded())
                        .then(() => browser.click(search.buttonClose))
                        .then(() => verifySearchResults(search.searchResultMobile, '79 Results for pants'));
                }
                // access desktop/laptop
                return browser.click(search.priceRefinementCheckSelector)
                    .then(() => common.waitUntilAjaxCallEnded())
                    .then(() => browser.getAttribute(search.priceRefinementTitle, 'title'))
                    .then(title => assert.equal(title, 'Refine by Price: $20 - $49.99'))
                    .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                        search.colorRefinementSmall))
                    .then(mySearchSelector => verifySearchResults(mySearchSelector, '79 Results for pants'));
            });
    });

    it('#6 should return 8 results for pants when check New Arrival refinement', () => {
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (isTrue) {
                    // access mobile devices
                    return browser.click(search.filterButton)
                        .then(() => browser.waitForExist(search.refinementBarNewArrival))
                        .then(() => browser.click(search.refinementBarNewArrival))
                        .then(() => browser.waitForExist(search.refinementBarNewArrivalActive))
                        .then(() => browser.click(search.newArrivalRefinementUnchecked))
                        .then(() => common.waitUntilAjaxCallEnded())
                        .then(() => browser.click(search.buttonClose))
                        .then(() => verifySearchResults(search.searchResultCount, '8 Results for pants'));
                }
                // access desktop/laptop
                return browser.click(search.newArrivalRefinementUnchecked)
                    .then(() => common.waitUntilAjaxCallEnded())
                    .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                        search.colorRefinementSmall))
                    .then(mySearchSelector => verifySearchResults(mySearchSelector, '8 Results for pants'));
            });
    });

    it('#7 should return 79 results for pants when un-check New Arrival refinement', () => {
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (isTrue) {
                    // access mobile devices
                    return browser.click(search.filterButton)
                        .then(() => browser.waitForExist(search.refinementBarNewArrivalActive))
                        .then(() => browser.click(search.newArrivalRefinementChecked))
                        .then(() => common.waitUntilAjaxCallEnded())
                        .then(() => browser.click(search.buttonClose))
                        .then(() => browser.getText(search.searchResultMobile))
                        .then(displayText => assert.equal(displayText, '79 Results for pants'));
                }
                // access desktop/laptop
                return browser.click(search.newArrivalRefinementChecked)
                    .then(() => common.waitUntilAjaxCallEnded())
                    .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                        search.colorRefinementSmall))
                    .then(mySearchSelector => verifySearchResults(mySearchSelector, '79 Results for pants'));
            });
    });

    it('#8 should return 2 results for pants when refine by Color, Price and New Arrival', () => {
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (isTrue) {
                    // access mobile devices
                    return browser.click(search.filterButton)
                        .then(() => browser.waitForExist(search.refinementBarColorActive))
                        .then(() => browser.click(search.blackColorRefinementSelector))
                        .then(() => common.waitUntilAjaxCallEnded())
                        .then(() => browser.waitForExist(search.refinementBarPriceActive))
                        .then(() => browser.click(search.priceRefinementSelector))
                        .then(() => common.waitUntilAjaxCallEnded())
                        .then(() => browser.waitForExist(search.refinementBarNewArrivalActive))
                        .then(() => browser.click(search.newArrivalRefinementUnchecked))
                        .then(() => common.waitUntilAjaxCallEnded())
                        .then(() => browser.click(search.buttonClose))
                        .then(() => verifySearchResults(search.searchResultCount, '2 Results for pants'))
                        .then(() => browser.click(search.customSelect))
                        .then(() => browser.click(search.sortOrderProductAtoZ))
                        .then(() => common.waitUntilAjaxCallEnded())
                        .then(() => browser.pause(2000));
                }
                // access desktop/laptop
                return browser.click(search.blackColorRefinementSelector)
                    .then(() => common.waitUntilAjaxCallEnded())
                    .then(() => browser.click(search.priceRefinementSelector))
                    .then(() => common.waitUntilAjaxCallEnded())
                    .then(() => browser.click(search.newArrivalRefinementUnchecked))
                    .then(() => common.waitUntilAjaxCallEnded())
                    .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                        search.colorRefinementSmall))
                    .then(mySearchSelector => verifySearchResults(mySearchSelector, '2 Results for pants'))
                    .then(() => browser.click(search.customSelect))
                    .then(() => browser.click(search.sortOrderProductAtoZ))
                    .then(() => browser.pause(2000));
            });
    });

    it('#9 should return the correct names of the products when refined by Color, Price and New Arrival', () => {
        return search.getNthProductTileProductName(1)
            .then(productName => {
                return assert.equal(productName, expectedDisplayName2, 'Expected: displayed product name = ' + expectedDisplayName2);
            })
            .then(() => search.getNthProductTileProductName(2)
                .then(productName2 => {
                    return assert.equal(productName2, expectedDisplayName1, 'Expected: displayed product name = ' + expectedDisplayName1);
                })
            );
    });

    it('#10 should return the correct images when refined by Color, Price and New Arrival', () => {
        const product1ImageSrc = 'images/medium/PG.10208949.JJ0NLA0.PZ.jpg';
        const product2ImageSrc = 'images/medium/PG.10208897.JJ0QRXX.PZ.jpg';
        return search.getNthProductTileImageSrc(2)
            .then(imageSrc => {
                return assert.isTrue(imageSrc.endsWith(product1ImageSrc),
                                'product image: url not end with ' + product1ImageSrc);
            })
            .then(() => search.getNthProductTileImageSrc(1)
                .then(imageSrc2 => {
                    return assert.isTrue(imageSrc2.endsWith(product2ImageSrc),
                        'product image :url not end with ' + imageSrc2);
                })
            );
    });

    it('#11 should return the correct href links when refined by Color, Price and New Arrival', () => {
        const expectedLink1 = baseUrl + '/' + common.convertToUrlFormat(expectedDisplayName1) + '/' + product1ID + '.html?lang=' + localeStr;
        const expectedLink2 = baseUrl + '/' + common.convertToUrlFormat(expectedDisplayName2) + '/' + product2ID + '.html?lang=' + localeStr;
        return search.getNthProductTileImageHref(2)
            .then(imageLink1 => {
                return assert.equal(imageLink1, expectedLink1, 'Expected image link not equal to ' + expectedLink1);
            })
            .then(() => search.getNthProductTileImageHref(1)
                .then(imageLink2 => {
                    return assert.equal(imageLink2, expectedLink2, 'Expected image link not equal to ' + expectedLink2);
                })
            );
    });


    it('#12 should return the correct color swatch count when refined by Color, Price and New Arrival', () => {
        return search.getNthProductTileColorSwatchCount(1)
            .then(count => {
                return assert.equal(count, 1, 'Expected: the number of color swatch to be 1.');
            })
            .then(() => search.getNthProductTileColorSwatchCount(2)
                .then(count => {
                    return assert.equal(count, 1, 'Expected: the number of color swatch to be 1.');
                })
            );
    });

    it('#13 should return 79 results for pants when reset button is clicked', () => {
        return browser.isVisible(search.filterButton)
            .then((isTrue) => {
                if (isTrue) {
                    // access mobile devices
                    return browser.click(search.filterButton)
                        .then(() => browser.waitForExist(search.buttonClose))
                        .then(() => browser.click(search.resetButton))
                        .then(() => browser.pause(2000))
                        .then(() => verifySearchResults(search.searchResultCount, '79 Results for pants'));
                }
                // access desktop/laptop
                return browser.click(search.resetButton)
                    .then(() => common.waitUntilAjaxCallEnded())
                    .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                        search.colorRefinementSmall))
                    .then(mySearchSelector => verifySearchResults(mySearchSelector, '79 Results for pants'));
            });
    });
});
