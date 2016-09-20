"use strict";

import {assert} from 'chai';
import * as productDetailPage from '../../pageObjects/productDetails';

describe('Product Details - Product Item', () => {
    const variantId = 708141677197;
    const basePath = '/en_US/Product-Show/?pid=708141677197';

    before(() => {
        return browser
            .url(basePath);
    });

    it('should display its product ID', () => {
        return browser
            .getText(`.product-id`)
            .then(itemNumber => {
                return assert.equal(itemNumber, variantId);
            })
    });

    it('should display its product name', () =>
        browser.getText(productDetailPage.PRODUCT_NAME)
            .then(name => assert.equal(name, 'No-Iron Textured Dress Shirt')
            )
    );

})
