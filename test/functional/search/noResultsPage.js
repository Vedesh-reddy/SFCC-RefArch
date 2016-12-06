'use strict';

/*
 Query Search on string 'gold fish'
 verify a NoResultsPage is returned
 */

import { assert } from 'chai';
import * as homePage from '../../mocks/testDataMgr/pageObjects/home';
import * as search from '../../mocks/testDataMgr/pageObjects/searchResult';
import * as common from '../../mocks/testDataMgr/helpers/common';
import * as testDataMgr from '../../mocks/testDataMgr/main';

describe('Testing a NoResultsPage presented when search for a non-existing product', () => {
    const queryString = 'gold fish';
    const noResultPageMessage = 'We are sorry, but no results were found for: gold fish\nSearch Tips\n'
    + 'Double-check the spelling\nChange your search query\nBe less specific';

    before(() => testDataMgr.load()
        .then(() => homePage.navigateTo())
        .then(() => browser.waitForExist(search.searchForm))
    );

    it('should return noResultsPage when search for "gold fish" ', () => {
        let myQuerySelector;
        return common.getVisibleSelector(search.searchQuerySelector1, search.searchQuerySelector2)
            .then(mySelector => {
                myQuerySelector = mySelector;
                return browser.setValue(myQuerySelector, queryString);
            })
            .then(() => browser.submitForm(myQuerySelector))
            .then(() => browser.waitForExist(search.pdpMain))
            .then(() => common.getVisibleSelector(search.searchNoResultLarge,
                search.searchNoResultSmall))
            .then(mySearchSelector => browser.getText(mySearchSelector))
            .then(displayText => assert.equal(displayText, noResultPageMessage))
            .then(() => common.waitUntilPageLoaded());
    });
});
