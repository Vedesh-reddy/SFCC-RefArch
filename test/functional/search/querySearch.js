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
        .then(() => browser.waitForExist(search.SEARCH_FORM))
    );

    it('should return 79 Results for pants when query search for pants', () => {
        let myQuerySelector;
        return common.getVisibleSelector(search.SearchQuerySelector1, search.SearchQuerySelector2)
            .then(mySelector => {
                myQuerySelector = mySelector;
                return browser.setValue(myQuerySelector, productGeneral);
            })
            .then(() => browser.submitForm(myQuerySelector))
            .then(() => browser.waitForExist(search.PDP_MAIN))
            .then(() => common.getVisibleSelector(search.SearchResultLarge,
                search.SearchResultSmall))
            .then(mySearchSelector => browser.getText(mySearchSelector))
            .then(displayText => assert.equal(displayText, '79 Results for pants'));
    });
});
