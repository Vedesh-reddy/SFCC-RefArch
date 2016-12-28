'use strict';

import * as quickViewPage from './quickView';

export const productTile = '.pdp-link';
export const imageContainer = '.image-container a[href*="lang=en_US"]';
export const cardTitle = '.link';
export const swatchCircle = '.swatch-circle';
export const quickViewImg = '.quickview img';
export const quickView = '.quickview';
export const tileImage = '.tile-image';
export const pdpPrices = '.pdp-prices';
export const dataPid = '[data-pid=';
export const SWATCHES = '.swatches';
export const IMAGE_CONTAINER = '.image-container';
export const QUICK_VIEW = '.quickview';

function getProductTileById(pid) {
    var prodSelector = dataPid + '"' + pid + '"]';
    return prodSelector;
}

export function getProductTileImageSrc(pid) {
    let selector = getProductTileById(pid) + ' ' + tileImage;
    return browser.waitForVisible(selector)
        .then(() => browser.getAttribute(selector, 'src'));
}

export function getProductTileImageHref(pid) {
    let selector = getProductTileById(pid) + ' ' + imageContainer;
    return browser.waitForVisible(selector)
        .then(() => browser.getAttribute(selector, 'href'));
}

export function getProductTileProductName(pid) {
    let selector = [getProductTileById(pid), productTile, cardTitle].join(' ');
    return browser.waitForVisible(selector)
        .then(() => browser.getText(selector));
}

export function getProductTileColorSwatchCount(pid) {
    let selector = getProductTileById(pid) + ' ' + swatchCircle;
    return browser.elements(selector)
        .then(swatches => swatches.value.length);
}
export function getProductTileMoreColorSwatchHref(pid) {
    let selector = getProductTileById(pid) + ' ' + SWATCHES + ' > span > a';
    return browser.getAttribute(selector, 'href');
}

export function getProductTileMoreColorSwatch(pid) {
    let selector = getProductTileById(pid) + ' ' + SWATCHES + ' > span > a';
    return browser.getText(selector);
}

export function getProductTileQuickViewImageSrc(pid) {
    let selector = getProductTileById(pid) + ' ' + quickViewImg;
    return browser.waitForVisible(selector)
        .then(() => browser.getAttribute(selector, 'src'));
}

export function getProductTileQuickViewImageHref(pid) {
    let selector = getProductTileById(pid) + ' ' + quickView;
    return browser.waitForVisible(selector)
        .then(() => browser.getAttribute(selector, 'href'));
}

export function getProductTileProductNameHref(pid) {
    let selector = [getProductTileById(pid), productTile, cardTitle].join(' ');
    return browser.waitForVisible(selector)
        .then(() => browser.getAttribute(selector, 'href'));
}

export function getProductTileProductPrice(pid) {
    let selector = getProductTileById(pid) + ' ' + pdpPrices;
    return browser.waitForVisible(selector)
        .then(() => browser.getText(selector));
}

/**
 * Obtain the color swatch URLs associated with the product tile
 * @param {string} tileIdx, start with 1
 * @returns [String] an array of swatch URLs
 */
export function getProductTileColorSwatchUrls(pid) {
    let selector = getProductTileById(pid) + ' ' + swatchCircle;

    return browser.getAttribute(selector, 'data-attributes')
        .then(swatchList => {
            let swatchUrlArray = [];
            if (Array.isArray(swatchList)) {
                for (let i = 0; i < swatchList.length; i++) {
                    let dataAttrAsJson = JSON.parse(swatchList[i]);
                    swatchUrlArray[i] = dataAttrAsJson.images.swatch[0].url;
                }
            } else {
                let dataAttrAsJson = JSON.parse(swatchList);
                swatchUrlArray[0] = dataAttrAsJson.images.swatch[0].url;
            }

            return swatchUrlArray;
        });
}

export function clickOnProductTileQuickView(pid) {
    let quickViewSelector = getProductTileById(pid) + ' ' + IMAGE_CONTAINER + ' ' + QUICK_VIEW;
    return browser.waitForVisible(quickViewSelector)
        .click(quickViewSelector)
        .waitForVisible(quickViewPage.QUICK_VIEW_DIALOG);
}
