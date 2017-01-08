'use strict';

export const PRODUCT_TILE = '.product-tile';
export const IMAGE_CONTAINER = '.imageContainer';
export const SWATCH_CIRCLE = '.swatches .swatch-circle';
export const CARD_TITLE = '.card-title';
export const NEW_ARRIVALS = 'a[href*="new%20arrivals"]';
export const WOMEN = '.navbar .nav-item:nth-child(2)';
export const MEN = '.navbar .nav-item:nth-child(3)';
export const ELECTRONICS = '.navbar .nav-item:nth-child(4)';
export const TOP_SELLERS = '.navbar .nav-item:nth-child(5)';
export const navBarButton = '.navbar-toggler';
export const navNewArrivalButton = '.navbar-nav .nav-item[role=button]:nth-child(1) .nav-link';
export const navWomenButton = '#womens';
export const navMenButton = '.navbar-nav .nav-item[role=button]:nth-child(3) .nav-link';
export const navElectronics = '.navbar-nav .nav-item[role=button]:nth-child(4) .nav-link';
export const navTopSellers = '.navbar-nav .nav-item[role=button]:nth-child(5) .nav-link';
export const closeButton = '.close-button';
export const backButton = '.dropdown-menu .back .caret-left';
export const navWomenClothingButton = '#womens-clothing';
export const navWomenClothingTopsButton = '#womens-clothing-tops';
export const navBar = '#sg-navbar-collapse';

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

export function getNthProductTileProductNameHref(tileIdx) {
    let selector = createCssNthProductTile(tileIdx) + ' ' + CARD_TITLE;
    return browser.getAttribute(selector, 'href');
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
