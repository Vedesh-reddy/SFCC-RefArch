'use strict';

/**
 * Compare women->Clothing->tops
 * - Navigate to Women->Clothing->tops
 * - select 4 products to compare
 * - Verify we can remove one of the product and add a new product to compare
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

describe('deselect and select a different product for compare', () => {
    const topTitle = '.page-title';
    const selector1 = compareProducts.dataPid + ':nth-child(1)' + ' ' + compareProducts.compareCheckbox;
    const selector2 = compareProducts.dataPid + ':nth-child(2)' + ' ' + compareProducts.compareCheckbox;
    const selector3 = compareProducts.dataPid + ':nth-child(3)' + ' ' + compareProducts.compareCheckbox;
    const selector4 = compareProducts.dataPid + ':nth-child(4)' + ' ' + compareProducts.compareCheckbox;
    const selector5 = compareProducts.dataPid + ':nth-child(5)' + ' ' + compareProducts.compareCheckbox;
    const selectorProdToRemove = compareProducts.selectedProduct + ':nth-child(1) ' + compareProducts.close;
    const selectorProdToRemoveIpad = compareProducts.selectedProduct + ':nth-child(1) ' +' .fa-close';
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
                    .getText(topTitle)
                    .then(title => assert.equal(title, 'Tops'))
                    .then(() => browser.click(selector1))
                    .click(selector2)
                    .click(selector3)
                    .click(selector4)
                    .pause(2000)
                    .elements(compareProducts.selectedProduct)
                    .then(selectedProducts => assert.isTrue(selectedProducts.value.length === 4, 'there should be 4 products in compare bar'))
                    .then(() => browser.waitForVisible(selectorProdToRemoveIpad))
                    .then(() => browser.click(selectorProdToRemoveIpad));
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
                .click(selector4)
                .elements(compareProducts.selectedProduct)
                .then(selectedProducts => assert.isTrue(selectedProducts.value.length === 4, 'there should be 4 products in compare bar'))
                .then(() => browser.click(selectorProdToRemove))
        })
    );
    it('should be able to remove a product from compare table and add a new product', () => {
        return browser.elements(compareProducts.selectedProductImg)
            .then(selectedProducts => assert.isTrue(selectedProducts.value.length === 3, 'there should be 3 products in compare bar'))
            .then(() => browser.click(selector5))
            .then(() => browser.elements(compareProducts.selectedProduct))
            .then(prod => assert.isTrue(prod.value.length === 4, 'there should be 4 products in compare bar'));
    });

    it('should return 4 products at compare result page', () => {
        return browser.click(compareProducts.compareButton)
            .then(() => common.waitUntilPageLoaded())
            .then(() => homePage.getProductTileCount())
            .then(productCount => assert.isTrue(productCount === 4, 'Expected to have 4 product tiles on the compare result page'));
    });
});
