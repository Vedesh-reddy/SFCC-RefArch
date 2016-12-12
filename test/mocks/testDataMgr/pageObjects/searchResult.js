'use strict';

export const searchForm = 'form[role*=search]';
export const pdpMain = '.search-results';
export const searchResultLarge = '.search-results .hidden-xs-down';
export const searchResultSmall = '.search-results .hidden-sm-up';
export const searchResultMobile = '.search-results .grid-header .hidden-xs-down';
export const searchResultCount = '.result-count.hidden-xs-down';
export const searchNoResultLarge = '.grid-header .hidden-xs-down';
export const searchNoResultSmall = '.grid-header .hidden-sm-up';
export const colorRefinementLarge = '.grid-header .hidden-xs-down';
export const colorRefinementSmall = '.grid-header .hidden-sm-up';
export const searchQuerySelector1 = '.header-search .search-field';
export const searchQuerySelector2 = '.search-field';
export const blueColorRefinementSelector = '.swatch-circle-blue';
export const blueColorRefinementSelectorChecked = '.swatch-circle-blue.selected';
export const blackColorRefinementSelector = '.swatch-circle-black';
export const blackColorRefinementSelectorChecked = '.swatch-circle-black.selected';
export const buttonfaCircleO = ' .fa-circle-o';
export const buttonFaCheck = ' .fa-check-circle';
export const priceRefinementTitle = '.price .values li:nth-child(2)';
export const priceRefinementSelector = priceRefinementTitle + buttonfaCircleO;
export const priceRefinementCheckSelector = priceRefinementTitle + buttonFaCheck;
export const newArrivalRefinementUnchecked = '.refinement-bar .fa-square-o';
export const newArrivalRefinementChecked = '.fa-check-square';
export const newArrivalRefinementMobileSelector = '.refinement-bar .fa-close';
export const resetButton = '.reset';
export const productTile = '.product-tile';
export const productGrid = '.product-grid';
export const IMAGE_CONTAINER = '.imageContainer';
export const CARD_TITLE = '.card-title';
export const SWATCH_CIRCLE = '.swatches .swatch-circle';
export const filterButton = '.filter-results';
export const refinementBar = '.refinement-bar';
export const refinementBarColor = '.refinement.color .title';
export const refinementBarPrice = '.refinement.price .title';
export const refinementBarNewArrival = '.refinement.new.arrival .title';
export const refinementBarColorActive = '.refinement.color.active';
export const refinementBarPriceActive = '.refinement.price.active';
export const refinementBarNewArrivalActive = '.refinement.new.arrival.active';
export const refinementCircle = '.fa-times-circle';
export const refinementPriceClose = '.filter-bar .fa-close';
export const customSelect = '.custom-select';
export const sortOrderProductAtoZ = '.custom-select option:nth-child(3)';
export const buttonClose = '.close';

function createCssNthProductTile(idx) {
    return productGrid + ' > div:nth-child(' + idx + ') ' + productTile;
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

export function getNthProductTileProductName(tileIdx) {
    let selector = createCssNthProductTile(tileIdx) + ' ' + CARD_TITLE;
    return browser.getText(selector);
}

export function getNthProductTileColorSwatchCount(tileIdx) {
    let selector = [createCssNthProductTile(tileIdx), SWATCH_CIRCLE].join(' ');
    return browser.elements(selector)
        .then(swatches => {
            return swatches.value.length;
        });
}
