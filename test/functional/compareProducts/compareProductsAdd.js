'use strict';

/**
 * Compare women->Clothing->tops
 * - Navigate to Women->Clothing->tops
 * - select 4 products to compare
 * - Verify the compare bar at the bottom of the page contains the 4 products
 * - Verify compare return the products expected.
 */

import { assert } from 'chai';
import { config } from '../webdriver/wdio.conf';
import * as homePage from '../../mocks/testDataMgr/pageObjects/home';
import * as keyboard from '../../mocks/testDataMgr/helpers/keyboard';
import * as common from '../../mocks/testDataMgr/helpers/common';
import * as search from '../../mocks/testDataMgr/pageObjects/searchResult';
import * as compareProducts from '../../mocks/testDataMgr/pageObjects/compareProducts';
import * as testDataMgr from '../../mocks/testDataMgr/main';
import * as productTile from '../../mocks/testDataMgr/pageObjects/productTile';

describe('Select 4 products for Compare', () => {
    const topTitle = '.page-title';
    const selector1 = '[data-pid]:nth-child(1)' + ' ' + compareProducts.compareCheckbox;
    const selector2 = '[data-pid]:nth-child(2)' + ' ' + compareProducts.compareCheckbox;
    const selector3 = '[data-pid]:nth-child(3)' + ' ' + compareProducts.compareCheckbox;
    const selector4 = '[data-pid]:nth-child(4)' + ' ' + compareProducts.compareCheckbox;

    before(() => testDataMgr.load()
        .then(() => homePage.navigateTo())
        .then(() => browser.waitForExist(search.searchForm))
        .then(() => browser.isVisible(homePage.navBarButton))
        .then((isVisible) => {
            if (isVisible) {
                //  Access mobile devices
                return browser.click(homePage.navBarButton)
                    .waitForVisible(homePage.navBar)
                    .click(homePage.navWomenButton)
                    .waitForVisible(homePage.navWomenClothingButton)
                    .click(homePage.navWomenClothingButton)
                    .waitForVisible(homePage.navWomenClothingTopsButton)
                    .click(homePage.navWomenClothingTopsButton)
                    .waitForExist(homePage.navBarButton)
                    .pause(1000)
                    .then(() => browser.getText(topTitle))
                    .then(title => assert.equal(title, 'Tops'))
                    .then(() => browser.click(selector1))
                    .click(selector2)
                    .click(selector3)
                    .click(selector4)
                    .pause(2000);
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
                .then(() => browser.click(selector1))
                .scroll(selector2)
                .click(selector2)
                .click(selector3)
                .scroll(selector4)
                .click(selector4);
        })
    );

    it('should be able to select 4 products for compare', () => {
        return browser.elements(compareProducts.selectedProduct)
            .then(selectedProducts => assert.isTrue(selectedProducts.value.length === 4, 'there are 4 products in compare bar'));
    });

    it('should return 4 products at compare result page', () => {
        return browser.click('button.compare')
            .then(() => browser.pause(2000))
            .then(() => homePage.getProductTileCount())
            .then(productCount => assert.isTrue(productCount === 4, 'Expected to have 4 product tiles on the compare result page'));
    });
});

