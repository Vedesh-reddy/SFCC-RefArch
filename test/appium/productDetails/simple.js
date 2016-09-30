'use strict';

import { assert } from 'chai';
import * as productDetailPage from '../../mocks/testDataMgr/pageObjects/productDetail';
import * as testDataMgr from '../../mocks/testDataMgr/main';


describe('Product Details - Product Item', () => {
    const variantId = '708141677197';
    const expectedPrimaryImage = 'PG.15J0037EJ.SLABLFB.PZ.jpg';
    const expectedSecondaryImage = 'PG.15J0037EJ.SLABLFB.BZ.jpg';
    const nextButton = '.right.carousel-control .icon-next';
    const elementPrimaryImage = '.carousel-item.active .img-fluid';
    const elementImage = '.img-fluid';


    before(() => {
        var variant = testDataMgr.getProductById(variantId);
        return browser.url(variant.getUrlResourcePath());
    });

    it('should display its product ID', () => {
        return browser.getText('.product-id')
            .then(itemNumber => {
                return assert.equal(itemNumber, variantId);
            });
    });

    it('should display its product name', () => {
        return browser.waitUntil(() => browser.element(productDetailPage.PRODUCT_NAME))
            .then(() => browser.getText(productDetailPage.PRODUCT_NAME))
            .then(name => assert.equal(name, 'No-Iron Textured Dress Shirt'));
    });

    it('should display its product image', () => {
        return browser.isExisting(elementImage)
            .then(exists => assert.isTrue(exists));
    });

    it('should display the default variant primary image', () => {
        return browser.element(elementPrimaryImage)
            .then(el => browser.elementIdAttribute(el.value.ELEMENT, 'src'))
            .then(displayedImgSrc => assert.isTrue(displayedImgSrc.value.endsWith(expectedPrimaryImage)));
    });

    it('should display the secondary default variant primary image after click', () => {
        return browser.element(nextButton)
            .click()
            .waitForVisible(elementImage, 1000, true)
            .then(() => browser.element(elementPrimaryImage))
            .then(el => browser.elementIdAttribute(el.value.ELEMENT, 'src'))
            .then(displayedImgSrc => assert.isTrue(displayedImgSrc.value.endsWith(expectedSecondaryImage)));
    });

    it('should enable the "Add to Cart" button', () =>
        browser.isEnabled('.add-to-cart')
            .then(enabled => assert.isTrue(enabled))
    );

    it('should add product to Cart', () =>
        browser.element('.add-to-cart')
            .click()
            .then(() => browser.getText('.minicart-quantity'))
            .then(quantity => assert.equal(quantity, '1'))
    );
});
