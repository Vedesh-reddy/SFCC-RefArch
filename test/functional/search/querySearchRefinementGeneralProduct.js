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

describe('Query Search and Refinement - general product', () => {
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

    it('should return 79 results for pants when un-check the color refinements=blue', () => {
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

    it('should return 8 results for pants when select price refinements $20-$49.00', () => {
        return browser.click(search.priceRefinementSelector)
            .then(() => browser.getAttribute(search.priceRefinementSelector,'title'))
            .then(title => assert.equal(title, 'Currently Refined by Price: $20 - $49.99'))
            .then(() => browser.waitForExist(search.pdpMain))
            .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                search.colorRefinementSmall))
            .then(mySearchSelector => browser.getText(mySearchSelector))
            .then(displayText => assert.equal(displayText, '8 Results for pants'));
    });

    it('should return 79 results for pants when un-check price refinement' , () => {
        return browser.click(search.priceRefinementSelector)
            .then(() => browser.getAttribute(search.priceRefinementSelector,'title'))
            .then(title => assert.equal(title, 'Refine by Price: $20 - $49.99'))
            .then(() => browser.waitForExist(search.pdpMain))
            .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                search.colorRefinementSmall))
            .then(mySearchSelector => browser.getText(mySearchSelector))
            .then(displayText => assert.equal(displayText, '79 Results for pants'));
    })

    it('should return 8 results for pants when check New Arrival refinement', () => {
        return browser.click(search.newArrivalRefinement)
            .then(() => browser.getAttribute(search.newArrivalRefinement +' li', 'title'))
            .then(title => assert.equal(title, 'Currently Refined by New Arrival: New Arrival'))
            .then(() => browser.waitForExist(search.pdpMain))
            .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                search.colorRefinementSmall))
            .then(mySearchSelector => browser.getText(mySearchSelector))
            .then(displayText => assert.equal(displayText, '8 Results for pants'));
    })

    it('should return 79 results for pants when un-check New Arrival refinement', () => {
        return browser.click(search.newArrivalRefinement)
            .then(() => browser.getAttribute(search.newArrivalRefinement +' li', 'title'))
            .then(title => assert.equal(title, 'Refine by New Arrival: New Arrival'))
            .then(() => browser.waitForExist(search.pdpMain))
            .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                search.colorRefinementSmall))
            .then(mySearchSelector => browser.getText(mySearchSelector))
            .then(displayText => assert.equal(displayText, '79 Results for pants'));
    })

    it('should return 2 results for pants when refine by Color, Price and New Arrival', () => {
        return browser.click(search.blackColorRefinementSelector)
            .then(() => browser.waitForExist(search.blackColorRefinementSelector))
            .then(() => browser.isExisting(search.blackColorRefinementSelectorChecked))
            .then(isSelected => assert.isTrue(isSelected))
            .then(() => browser.waitForExist(search.pdpMain))
            .then(() => browser.click(search.priceRefinementSelector))
            .then(() => browser.getAttribute(search.priceRefinementSelector,'title'))
            .then(title => assert.equal(title, 'Currently Refined by Price: $50 - $99.99'))
            .then(() => browser.waitForExist(search.pdpMain))
            .then(() => browser.click(search.newArrivalRefinement))
            .then(() => browser.getAttribute(search.newArrivalRefinement +' li', 'title'))
            .then(title => assert.equal(title, 'Currently Refined by New Arrival: New Arrival'))
            .then(() => browser.waitForExist(search.pdpMain))
            .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                search.colorRefinementSmall))
            .then(mySearchSelector => browser.getText(mySearchSelector))
            .then(displayText => assert.equal(displayText, '2 Results for pants'))
    })
    it('should return the correct names of the products when refined by Color, Price and New Arrival', () => {
        return browser.getText(search.searchResultProductName)
            .then((productName => {
                assert.include(productName, 'Flat Front Slim Pant');
                assert.include(productName, 'Classic Tweed Pant');
            }));
    })

    it('should return the correct image when refined by Color, Price and New Arrival', () => {
        
    })


    it('should return 79 results for pants when reset button is clicked', () => {
        return browser.click(search.resetButton)
            .then(() => browser.waitForExist(search.pdpMain))
            .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                search.colorRefinementSmall))
            .then(mySearchSelector => browser.getText(mySearchSelector))
            .then(displayText => assert.equal(displayText, '79 Results for pants'));
    })
});
