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
    const locale = config.locale;
    const productMasterId1 = '25502240';
    const productMasterId2 = '25503045';
    const productMasterId3 = '25564740';
    const productMasterId4 = '25589220';
    const productMasterId5 = '25518210';
    const selector1 = productTile.getProductTileById(productMasterId1) + ' ' + compareProducts.compareCheckbox;
    const selector2 = productTile.getProductTileById(productMasterId2) + ' ' + compareProducts.compareCheckbox;
    const selector3 = productTile.getProductTileById(productMasterId3) + ' ' + compareProducts.compareCheckbox;
    const selector4 = productTile.getProductTileById(productMasterId4) + ' ' + compareProducts.compareCheckbox;
    const selector5 = productTile.getProductTileById(productMasterId5) + ' ' + compareProducts.compareCheckbox;
    const selectorProdToRemove = productTile.getProductTileById(productMasterId1) + ' ' + compareProducts.selectorRemoveProduct;
    const selectorProdToRemoveIpad = '.slot[data-pid="25502240"] .fa-close';
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
                .then(() => browser.click(selectorProdToRemove));
        })
    );
    it('should be able to remove a product from compare table and add a new product', () => {
        return browser.elements(compareProducts.selectedProduct)
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

    it('should return the exact products we selected to compare on result page', () => {
        const productMaster2 = testDataMgr.getProductById(productMasterId2);
        const productMaster3 = testDataMgr.getProductById(productMasterId3);
        const productMaster4 = testDataMgr.getProductById(productMasterId4);
        const productMaster5 = testDataMgr.getProductById(productMasterId5);

        return productTile.getProductTileProductName(productMasterId5)
            .then(productName5 => {
                const expectedDisplayName5 = productMaster5.getLocalizedProperty('displayName', locale);
                assert.equal(productName5, expectedDisplayName5, 'Expected compare product is not displayed', expectedDisplayName5);
                return productTile.getProductTileProductName(productMasterId2);
            })
            .then(productName2 => {
                const expectedDisplayName2 = productMaster2.getLocalizedProperty('displayName', locale);
                assert.equal(productName2, expectedDisplayName2, 'Expected compare product is not displayed', expectedDisplayName2);
                return productTile.getProductTileProductName(productMasterId3);
            })
            .then(productName3 => {
                const expectedDisplayName3 = productMaster3.getLocalizedProperty('displayName', locale);
                assert.equal(productName3, expectedDisplayName3, 'Expected compare product is not displayed', expectedDisplayName3);
                return productTile.getProductTileProductName(productMasterId4);
            })
            .then(productName4 => {
                const expectedDisplayName4 = productMaster4.getLocalizedProperty('displayName', locale);
                return assert.equal(productName4, expectedDisplayName4, 'Expected compare product is not displayed', expectedDisplayName4);
            });
    });
});
