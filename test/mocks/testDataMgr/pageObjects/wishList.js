'use strict';

import * as common from '../helpers/common';

export const CSS_SHARE_LINK = '.share-link';
export const BTN_ADD_GIFT_CERT = 'button[name*=wishlist_addGiftCertificate]';
export const BTN_TOGGLE_PRIVACY = '[name*=wishlist_setList]';
export const LINK_REMOVE = 'button.delete-item';
export const WISHLIST_ITEMS = '.item-list tbody tr:not(.headings)';
export const FRM_WISH_LIST_SEARCH_LAST_NAME = '#dwfrm_wishlist_search_lastname';
export const FRM_WISH_LIST_SEARCH_FIRST_NAME = '#dwfrm_wishlist_search_firstname';
export const FRM_WISH_LIST_SEARCH_EMAIL = '#dwfrm_wishlist_search_email';
export const BTN_MAKE_LIST_PUBLIC = '[name*=wishlist_setListPublic]';
export const BTN_MAKE_LIST_PRIVATE = '[name*=wishlist_setListPrivate]';
export const BTN_WISH_LIST_SEARCH = '[name*=dwfrm_wishlist_search_search]';

const basePath = '/wishlist';


function _createCssNthWishListRow (idx) {
    // adding 1 to row because there is a heading in the table
    var row = idx + 1;
    return WISHLIST_ITEMS + ':nth-child(' + row + ')';
}

export function navigateTo () {
    return browser.url(basePath);
}

export function clickAddGiftCertButton () {
    return browser.click(BTN_ADD_GIFT_CERT)
        .waitForVisible('table.item-list');
}

export function emptyWishList () {
    return navigateTo()
        .waitForVisible(BTN_TOGGLE_PRIVACY)
        // Must click the Remove link on each product in the Wishlist.
        .then(() => common.removeItems(LINK_REMOVE))
        .then(() => browser.waitForExist('table.item-list', 5000, true));
}

export function getItemNameByRow (rowNum) {
    return browser.elements(`${WISHLIST_ITEMS} .product-list-item .name`)
        .then(elements => browser.elementIdText(elements.value[rowNum - 1].ELEMENT))
        .then(element => element.value);
}

export function getItemIdByRow (rowNum) {
    return browser.elements(`${WISHLIST_ITEMS} .product-list-item .sku .value`)
        .then(elements => browser.elementIdText(elements.value[rowNum - 1].ELEMENT))
        .then(element => element.value);
}

//get the desired quantity in Wish List for a particular row
export function getDesiredQuantityByRow(rowNum) {
    var selector = [_createCssNthWishListRow(rowNum), '.form-row.option-quantity-desired input[name$=dwfrm_wishlist_items_i0_quantity'].join(' ');
    return browser.getValue(selector);
}

export function getItemList () {
    return browser
        .waitForExist(WISHLIST_ITEMS, 5000)
        .elements(WISHLIST_ITEMS);
}

export function publishList () {
    return browser
        .waitForExist(BTN_TOGGLE_PRIVACY, 5000)
        .then(() => browser.isExisting(BTN_MAKE_LIST_PUBLIC))
        .then(doesExist => {
            if (doesExist) {
                browser.click(BTN_MAKE_LIST_PUBLIC)
            }
        })
}

export function unPublishList () {
    return browser
        .waitForExist(BTN_TOGGLE_PRIVACY, 5000)
        .then(() => browser.isExisting(BTN_MAKE_LIST_PRIVATE))
        .then(doesExist => {
            if (doesExist) {
                browser.click(BTN_MAKE_LIST_PRIVATE)
            }
        })
}

