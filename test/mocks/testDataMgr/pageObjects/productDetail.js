'use strict';

import * as common from '../helpers/common';

export const BTN_ADD_TO_CART = '.add-to-cart';
export const MINI_CART = '.minicart-icon';
export const PRODUCT_NAME = '.product-detail .product-name.hidden-md-up';


function addProduct(product, btnAdd) {
    return common.addProductVariationToBasket(product, btnAdd);
}

export function addProductVariationToCart(product) {
    return addProduct(product, BTN_ADD_TO_CART, MINI_CART)
        // To ensure that the product has been added to the cart before proceeding,
        // we need to wait for the Mini-cart to display
    .then(() => browser.waitForVisible(MINI_CART));
}

export function clickAddToCartButton() {
    return browser.waitForVisible('.loader-bg', 500, true)
        .waitForEnabled(BTN_ADD_TO_CART)
        .click(BTN_ADD_TO_CART)
        .then(() => browser.waitForVisible(MINI_CART));
}

