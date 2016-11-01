'use strict';

/*
Query Search on General Product :
- Search for 'pants'
- refine by color
- undo refinement
- click on reset button
 */

import {assert} from 'chai';
import * as homePage from '../../mocks/testDataMgr/pageObjects/home';
import * as search from '../../mocks/testDataMgr/pageObjects/search';

describe.only('Search - general product', () => {
    let productGeneral = 'pants';
    let selector1 = '.header-search .search-field';
    let selector2 ='.search-row .search-field';
    let myQuerySelector;
    let myWindowWidth;

    before(() => homePage.navigateTo()
        .then(() => browser.waitForExist(search.SEARCH_FORM))
        .then(() => browser.windowHandleSize())
        .then(windowWidth => {
            return myWindowWidth = windowWidth.value.width;
        })
    );

    it('should return 79 Results for pants when query search for pants', () =>
       search.getQuerySearchSelector(selector1, selector2)
            .then(mySelector => {
                myQuerySelector = mySelector;
                return browser.setValue(myQuerySelector, productGeneral)
            })
            .then(() => browser.submitForm(myQuerySelector))
            .then(() => browser.waitForExist(search.PDP_MAIN))
            .then(() => search.getSearchResultSelector(search.SEARCH_RESULT_Large,
                search.SEARCH_RESULT_Small, myWindowWidth))
            .then(mySearchSelector => {
                return browser.getText(mySearchSelector)
            })
            .then(displayText => assert.equal(displayText, '79 Results for pants'))
    )

});
