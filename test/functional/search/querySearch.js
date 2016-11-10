'use strict';

/*
Query Search on General Product :
- Search for 'pants'
- refine by color
- undo refinement
- click on reset button
 */

import { assert } from 'chai';
import * as homePage from '../../mocks/testDataMgr/pageObjects/home';
import * as search from '../../mocks/testDataMgr/pageObjects/search';
import * as common from '../../mocks/testDataMgr/helpers/common';

describe('Search - general product', () => {
    const productGeneral = 'pants';

    before(() => homePage.navigateTo()
        .then(() => browser.waitForExist(search.searchForm))
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

    it('should return 18 results for color refinements=blue', () => {
        return browser.click(search.blueColorSelector)
            .then(() => browser.waitForExist(search.blueColorSelector))
            .then(() => browser.isExisting(search.blueColorSelectorChecked))
            .then(isSelected => assert.isTrue(isSelected))
            .then(() => browser.waitForExist(search.pdpMain))
            .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                search.colorRefinementSmall))
            .then(mySearchSelector => browser.getText(mySearchSelector))
            .then(displayText => assert.equal(displayText, '18 Results for pants'));
    });

    it('should return 79 results for pants when un-check the color refinements=blue', () => {
        return browser.click(search.blueColorSelectorChecked)
            .then(() => browser.waitForExist(search.blueColorSelector))
            .then(() => browser.isExisting(search.blueColorSelector))
            .then(isSelected => assert.isTrue(isSelected))
            .then(() => common.getVisibleSelector(search.searchResultLarge,
                search.searchResultSmall))
            .then(mySearchSelector => browser.getText(mySearchSelector))
            .then(displayText => assert.equal(displayText, '79 Results for pants'));
    });

    it('should return 8 results for pants when select price refinements $20-$49.00', () => {
        return browser.click(search.priceRefinementSelector)
            .then(() => browser.pause(1000))
            .then(() => browser.getText(search.priceRefinementSelector))
            .then(isRefined => assert.equal(isRefined, '$20 - $49.99'))
            .then(() => browser.waitForExist(search.pdpMain))
            .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                search.colorRefinementSmall))
            .then(mySearchSelector => browser.getText(mySearchSelector))
            .then(displayText => assert.equal(displayText, '8 Results for pants'));
    });
});
