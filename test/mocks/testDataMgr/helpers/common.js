'use strict';

export const defaultLocale = 'x_default';
export const supportedLocales = [
    'en_US',
    'en_GB',
    'fr_FR',
    'it_IT',
    'ja_JP',
    'zh_CN'
];

/**
 *
 * @param selector1: the largeScreen selector
 * @param selector2: the smallScreen selector
 * @returns {*|Promise.<TResult>}
 */
export function getVisibleSelector(selector1, selector2) {
    let mySelector;
    return browser.isVisible(selector1)
        .then(visible => {
            if (visible) {
                mySelector = selector1;
                return mySelector;
            }
            mySelector = selector2;
            return mySelector;
        });
}

export function selectAttributeByIndex(attributeName, index) {
    let selector = '[data-attr = ' + attributeName + '] a:nth-child(' + index + ') span';
    return browser.waitForVisible(selector)
    // TODO:Before clicking on an attribute value, we must check whether it has already been selected.
        .then(() => {
            return browser.click(selector)
                .waitForVisible('[data-attr = ' + attributeName + ']');
        });
}

export function selectAttributeByDropDown(attributeName, index) {
    let selector = '.select-' + attributeName;
    return browser.waitForVisible(selector)
        .then(() => browser.selectByIndex(selector, index))
        .then(() => browser.pause(3000));
}

// function isAttributeSelected(selector) {
//     return browser.getAttribute(selector, 'data-selected')
//         .then(selected => Promise.resolve(selected));
// }

/**
 * Adds a Product Variation to a Basket
 *
 * @param {Map} product Product Map comprised of the following:
 * @param {String} product.resourcePath - Product Detail Page URL resource path
 * @param {Number} [product.colorIndex] - If product variations with Color,
 *     this represents the index value for the color options
 * @param {number} [product.sizeIndex]  - If product variations with Size,
 *     this represents the index value for the size options
 * @param {String} btnAdd - selector for Add to { Cart | Wishlist | Registry } button
 */
export function addProductVariationToBasket(product, btnAdd) {
    return browser.url(product.get('resourcePath'))
        .then(() => {
            if (product.has('colorIndex')) {
                return selectAttributeByIndex('color', product.get('colorIndex'));
            }
            return Promise.resolve();
        })
        .then(() => {
            if (product.has('sizeIndex')) {
                return selectAttributeByDropDown('size', product.get('sizeIndex'));
            }
            return Promise.resolve();
        })
        .then(() => {
            if (product.has('widthIndex')) {
                return selectAttributeByDropDown('width', product.get('widthIndex'));
            }
            return Promise.resolve();
        })
        .then(() => {
            return browser.waitForEnabled(btnAdd, 3000)
                .click(btnAdd);
        })
        .then(() => Promise.resolve());
}

export function convertToUrlFormat(inString) {
    let dotRemovedStr = inString;
    if (inString.endsWith('.')) {
        dotRemovedStr = inString.substr(0, inString.length - 1);
    }

    return dotRemovedStr.toLowerCase().replace(/ /g, '-');
}
