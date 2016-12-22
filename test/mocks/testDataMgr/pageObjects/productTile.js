'use strict';

export const productTile = '.pdp-link';
export const productGrid = '.product-grid';
export const imageContainer = '.image-container a[href*="lang=en_US"]';
export const cardTitle = 'a[href$="en_US"]';
export const swatchCircle = '.swatch-circle';
export const colorSwatch = '.color-swatches';
export const quickViewImg = '.quickview img';
export const quickView = '.quickview';
export const tileImage = '.tile-image';
export const pdpPrices = '.pdpPrices';

function getProductTileById(pid){
    var prodSelector = '[data-pid='+ pid +']';
    return prodSelector;
}

export function getProductTileImageSrc(pid) {
    let selector = getProductTileById(pid) + ' ' + tileImage;
    return browser.waitForVisible(selector).getAttribute(selector, 'src');
}

export function getProductTileImageHref(pid) {
   let selector = getProductTileById(pid) + ' ' + imageContainer;
    return browser.waitForVisible(selector).getAttribute(selector, 'href');
}

export function getProductTileProductName(pid) {
    let selector = getProductTileById(pid) + ' ' +productTile + ' ' + cardTitle;
    console.log('selector is ', selector);
    return browser.getText(selector);
}

export function getProductTileColorSwatchCount(pid) {
    let selector = getProductTileById(pid) + ' ' + swatchCircle;
    return browser.elements(selector)
        .then(swatches => swatches.value.length);
}
export function getNthProductTileQuickViewImageSrc(tileIdx) {
    return browser.elements(quickViewImg)
        .then(obj => browser.elementIdAttribute(obj.value[tileIdx-1].ELEMENT, 'src'));
}

export function getNthProductTileQuickViewImageHref(tileIdx) {
    return browser.elements(quickView)
        .then(obj => browser.elementIdAttribute(obj.value[tileIdx-1].ELEMENT, 'href'));
}

export function getNthProductTileProductNameHref(tileIdx) {
    let selector = createCssNthProductTile(tileIdx) + ' ' + cardTitle;
    return browser.getAttribute(selector, 'href');
}

export function getNthProductTileProductPrice(tileIdx) {
    let selector = createCssNthProductTile(tileIdx) + ' ' + pdpPrices;
    return browser.getText(selector);
}

/**
 * Obtain the color swatch URLs associated with the product tile
 * @param {string} tileIdx, start with 1
 * @returns [String] an array of swatch URLs
 */
export function getNthProductTileColorSwatchUrls(tileIdx) {
    let selector = createCssNthProductTile(tileIdx) + ' ' + swatchCircle;

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


