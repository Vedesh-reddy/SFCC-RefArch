'use strict';

import * as common from '../helpers/common';
import * as wishListPage from './wishList';

export const BTN_ADD_TO_CART = '.add-to-cart';
export const BTN_ADD_ALL_TO_CART = '#add-all-to-cart';
export const BTN_ADD_TO_WISHLIST = 'a[data-action="wishlist"]';
export const BTN_ADD_TO_GIFT_REGISTRY = 'a[data-action=gift-registry]';
export const MINI_CART = '.minicart-icon';
export const PID = '#pid';
export const PDP_MAIN = '.pdp-main';
export const PRICE_LIST = '#product-content .product-price .price-standard';
export const PRICE_SALE = '#product-content .product-price .price-sales';
export const PRODUCT_SET_LIST = '.product-set-list .product-number';
export const PRODUCT_SET_TOTAL_PRICE = '.product-detail .product-add-to-cart .salesprice';
export const PRODUCT_SET_ITEM_VARIATIONS = '.product-set-item .product-variations';
export const PRODUCT_NAME = '.product-detail .product-name.hidden-md-up';
export const PRIMARY_IMAGE = '.carousel-item.active';
export const PRODUCT_NUMBER_LABEL = '#product-content .product-number';
export const PRODUCT_THUMBNAILS_IMAGES = '.product-thumbnails img';
export const PROMOTION_CALLOUT = '.callout-message';
export const SWATCH_COLOR_ANCHORS = '.swatches.color .swatchanchor';

export function navigateTo(path = '/') {
    return browser.url(path);
}

function addProduct(product, btnAdd) {
    return common.addProductVariationToBasket(product, btnAdd);
}

export function addProductVariationToCart(product) {
    return addProduct(product, BTN_ADD_TO_CART, MINI_CART)
        // To ensure that the product has been added to the cart before proceeding,
        // we need to wait for the Mini-cart to display
    .then(() => browser.waitForVisible(MINI_CART));
}

export function addProductVariationToWishList(product) {
    return common.addProductVariationToBasket(product, BTN_ADD_TO_WISHLIST)
        // To ensure that the product has been added to the wishlist before proceeding,
        // we need to wait for a selector in the resulting page to display
    .then(() => browser.waitForVisible(wishListPage.BTN_TOGGLE_PRIVACY));
}

export function clickAddToCartButton() {
    return browser.waitForVisible('.loader-bg', 500, true)
        .waitForEnabled(BTN_ADD_TO_CART)
        .click(BTN_ADD_TO_CART)
        .then(() => browser.waitForVisible(MINI_CART));
}

export function clickAddToWishListButton() {
    return browser.waitForVisible('.loader-bg', 500, true)
        .waitForEnabled(BTN_ADD_TO_WISHLIST)
        .click(BTN_ADD_TO_WISHLIST)
        .then(() => browser.waitForVisible('table.item-list'));
}

/**
 * Retrieves the img src values of the thumbnail images
 *
 * @returns {Array.<String>}
 */
export function getDisplayedThumbnailPaths() {
    return browser.elements(PRODUCT_THUMBNAILS_IMAGES)
        .then(elements => {
            let thumbnailPaths = [];
            return elements.value.reduce(
                (getPathTask, value) => getPathTask.then(() =>
            browser.elementIdAttribute(value.ELEMENT, 'src').then(src => {
                thumbnailPaths.push(getImagePath(src.value));
                return thumbnailPaths;
            })
                ),
                Promise.resolve());
        });
}

/**
 * Returns image path given a URL
 *
 * @param {String} url - i.e., https://hostname/[...]/dw8f141f96/images/large/PG.15J0037EJ.WHITEFB.PZ.jpg
 * @returns {String} image path of URL (i.e., large/PG.15J0037EJ.WHITEFB.PZ.jpg)
 */
export function getImagePath(url) {
    return url.split('/images/')[1];
}
