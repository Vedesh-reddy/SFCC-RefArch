'use strict';

import * as common from '../helpers/common';

export const BTN_CLOSE = 'button[title=Close]';
export const BTN_NEXT = '.quickview-nav .quickview-next';
export const BTN_QUICK_VIEW = '#search-result-items li:nth-child(1) .product-image #quickviewbutton';
export const CONTAINER = '.ui-dialog';
export const SWATCHES_SIZE = '.swatches.size';
export const VARIATION_CONTAINER = '.product-variations';
export const PRODUCT_PRIMARY_IMAGE = '.primary-image';
export const PRODUCT_ID = '#QuickViewDialog .product-number [itemprop="productID"]';

function getCssSizeByIdx (idx) {
    return [
        CONTAINER,
        VARIATION_CONTAINER,
        SWATCHES_SIZE,
        'li:nth-child(' + idx + ')'
    ].join(' ');
}

export function getCssSizeLinkByIdx (idx) {
    return getCssSizeByIdx(idx) + ' a';
}

export function getSizeTextByIdx(sizeIndex) {
    return browser.getText(getCssSizeByIdx(sizeIndex))
        .then(text => text.trim());
}

export function selectAttributesByVariant (variant) {
    return common.addProductVariationToBasket(variant, common.BTN_ADD_TO_CART)
        .then(() => browser.waitForVisible('.mini-cart-content', 5000, true))
        .then(() => browser.waitForVisible(CONTAINER, 5000, true));
}

export function deselectAllAttributes() {
    return browser.elements('.swatches .selected')
        .then(attrsToDeselect => {
            return attrsToDeselect.value.reduce((deselect) => {
                return deselect.then(() => {
                    return browser.element('.swatches .selected')
                        .click()
                        .waitForVisible('.loader-bg', 5000, true);
                });
            }, Promise.resolve());
        });
}

export function getMasterId () {
    return browser.getAttribute('[itemprop=productID]', 'data-masterid');
}

export function isAttrValueSelected (attrType, idx) {
    return browser.getAttribute('.swatches.' + attrType + ' li:nth-child(' + idx + ')', 'class')
        .then(cls => cls.indexOf('selected') > -1);
}
