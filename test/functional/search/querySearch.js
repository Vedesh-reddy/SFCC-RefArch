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

describe('Search - general product', () => {
    const productGeneral = 'pants';
    let myQuerySelector;
    let myWindowWidth;

    before(() => homePage.navigateTo()
        .then(() => browser.waitForExist(search.SEARCH_FORM))
        .then(() => browser.windowHandleSize())
        .then(windowWidth => {
            myWindowWidth = windowWidth.value.width;
            return myWindowWidth;
        })
    );

    it('should return 79 Results for pants when query search for pants', () =>
       search.getQuerySearchSelector(search.SearchQuerySelector1, search.SearchQuerySelector2)
            .then(mySelector => {
                myQuerySelector = mySelector;
                return browser.setValue(myQuerySelector, productGeneral);
            })
            .then(() => browser.submitForm(myQuerySelector))
            .then(() => browser.waitForExist(search.PDP_MAIN))
            .then(() => search.getSearchResultSelector(search.SearchResultLarge,
                search.SearchResultSmall, myWindowWidth))
            .then(mySearchSelector => browser.getText(mySearchSelector))
            .then(displayText => assert.equal(displayText, '79 Results for pants'))
    );
});
