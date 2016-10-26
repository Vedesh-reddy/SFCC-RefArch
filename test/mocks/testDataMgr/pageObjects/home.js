'use strict';

export const PRODUCT_TILE = '.product-tile';
export const IMAGE_CONTAINER = '.imageContainer';
export const SWATCHES = '.swatches';
export const SWATCH_CIRCLE = '.swatches .swatch-circle';
export const CARD_TITLE = '.card-title';
export const PDP_PRICES = '.pdpPrices';


const basePath = '/home';


function createCssNthProductTile(idx) {
    return PRODUCT_TILE + ':nth-child(' + idx + ')';
}

export function navigateTo() {
    return browser.url(basePath);
}

export function getProductTileCount() {
    return browser.elements(PRODUCT_TILE)
        .then(prodTiles => {
            return prodTiles.value.length;
        });
}

export function getNthProductTileImageSrc(tileIdx) {
    let selector = createCssNthProductTile(tileIdx) + ' ' + IMAGE_CONTAINER + ' > a > img.card-img-top';
    return browser.waitForVisible(selector)
        .getAttribute(selector, 'src');
}

export function getNthProductTileImageHref(tileIdx) {
    let selector = createCssNthProductTile(tileIdx) + ' ' + IMAGE_CONTAINER + ' > a:nth-child(1)';
    return browser.waitForVisible(selector)
        .getAttribute(selector, 'href');
}

export function getNthProductTileColorSwatchCount(tileIdx) {
    let selector = [createCssNthProductTile(tileIdx), SWATCH_CIRCLE].join(' ');

    return browser.elements(selector)
        .then(swatches => {
            return swatches.value.length;
        });
}

/**
 * Obtain the color swatch URLs associated with the product tile
 * @param {string} tileIdx, start with 1
 * @returns [String] an array of swatch URLs
 */
export function getNthProductTileColorSwatchUrls(tileIdx) {
    let selector = createCssNthProductTile(tileIdx) + ' ' + SWATCH_CIRCLE;

    return browser.getAttribute(selector, 'data-attributes')
        .then(swatchList => {
            let swatchUrlArray = [];
            if (Array.isArray(swatchList)) {
                for (let i = 0; i < swatchList.length; i++) {
                    let dataAttrAsJson = JSON.parse(swatchList[i]);
                    swatchUrlArray[i] = dataAttrAsJson.url;
                }
            } else {
                let dataAttrAsJson = JSON.parse(swatchList);
                swatchUrlArray[0] = dataAttrAsJson.url;
            }

            return swatchUrlArray;
        });
}

export function getNthProductTileMoreColorSwatch(tileIdx) {
    let selector = createCssNthProductTile(tileIdx) + ' ' + SWATCHES + ' > span > a';
    return browser.getText(selector);
}

export function getNthProductTileMoreColorSwatchHref(tileIdx) {
    let selector = createCssNthProductTile(tileIdx) + ' ' + SWATCHES + ' > span > a';
    return browser.getAttribute(selector, 'href');
}

export function getNthProductTileProductName(tileIdx) {
    let selector = createCssNthProductTile(tileIdx) + ' ' + CARD_TITLE;
    return browser.getText(selector);
}

export function getNthProductTileProductNameHref(tileIdx) {
    let selector = createCssNthProductTile(tileIdx) + ' ' + CARD_TITLE;
    return browser.getAttribute(selector, 'href');
}

export function getNthProductTileProductPrice(tileIdx) {
    let selector = createCssNthProductTile(tileIdx) + ' ' + PDP_PRICES;
    return browser.getText(selector);
}

/**
 * Click on the color swatch of the product tile
 * @param {number} tileIdx, start with 1
 * @param {number} swatchIdx, start with 1
 * @returns {Promise.<TResult>|*}
 */
export function clickProductTileColorSwatch(tileIdx, swatchIdx) {
    let selector = createCssNthProductTile(tileIdx) + ' ' + SWATCH_CIRCLE + ':nth-child(' + swatchIdx + ')';

    return browser.waitForVisible(selector, 1000)
        .then(() => browser.click(selector));
}
