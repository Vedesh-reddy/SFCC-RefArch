'use strict';

import * as common from '../helpers/common';
import * as productQuickView from './productQuickView';

export const ADD_TO_WISHLIST_LINK = 'a.add-to-wishlist';
export const BTN_ADD_COUPON = '#add-coupon';
export const BTN_REMOVE_COUPON = '.item-quantity-details .textbutton';
export const BTN_SEARCH_FOR_STORE = '.ui-dialog-buttonset button[role*=button]';
export const BTN_SELECT_STORE = '.select-store-button';
export const BTN_SELECT_STORE_CONTINUE = '.ui-dialog-buttonset button:nth-of-type(2)';
export const CART_EMPTY = '.cart-empty';
export const CART_ITEMS = '.item-list tbody tr';
export const CHANGE_LOCATION = '.ui-dialog-buttonset button:nth-of-type(1)';
export const COUPON_CODE = '#dwfrm_cart_couponCode';
export const COUPON_APPLIED_LABEL = '.cartcoupon .label';
export const COUPON_ERROR = '.error';
export const ORDER_SUBTOTAL = '.order-subtotal td:nth-child(2)';
export const BTN_UPDATE_CART = '.cart-footer button[name*="_updateCart"]';
export const BTN_CHECKOUT = 'button[name*="checkoutCart"]';
export const LINK_REMOVE = 'button[value="Remove"]';
export const BUNDLED_ITEM = '.rowbundle';
export const IN_WISHLIST = '.in-wishlist';
export const ITEM_IMAGE = '.item-image';
export const ITEM_DETAILS = '.item-details';
export const ITEM_NAME = '.item-list .item-details .name';
export const ITEM_QUANTITY = '.item-quantity';
export const SELECT_STORE = '.set-preferred-store';
export const SELECTED_STORE_ADDRESS = '.selected-store-address';
export const STORE_ADDRESS_TEXT = '.store-list .store-tile:nth-of-type(1) .store-address';
export const STORE_LIST_CONTAINER = '.store-list-container';
export const ZIP_CODE_POP_UP = '#preferred-store-panel';
export const FRM_QUANTITY_ERROR = '#dwfrm_cart_shipments_i0_items_i0_quantity-error';
export const PRODUCT_SLOT = '.product-slot';
export const LAST_VISITED_ITEMS = '.last-visited .search-result-items .grid-tile';
export const LAST_VISITED_ITEM_NAMES = `${LAST_VISITED_ITEMS} .product-name`;
export const LAST_VISITED_ITEM_PRICES = `${LAST_VISITED_ITEMS} .product-sales-price`;
export const LAST_VISITED_ITEM_IMAGES = `${LAST_VISITED_ITEMS} .product-image .thumb-link [src]`;
export const AVAILABILITY_MESSAGE_1 ='.item-quantity-details .is-in-stock'
export const AVAILABILITY_MESSAGE_2 ='.item-delivery-options .is-in-stock'

const basePath = '/cart';

// Pseudo private methods
function _createCssNthCartRow (idx) {
    return CART_ITEMS + ':nth-child(' + idx + ')';
}

// Public methods
export function navigateTo () {
    return browser.url(basePath);
}

export function removeItemByRow (rowNum) {
    var linkRemoveItem = _createCssNthCartRow(rowNum) + ' .item-user-actions button[value="Remove"]';
    return browser.click(linkRemoveItem)
        // TODO: Find a way to waitForVisible instead of this pause. When there
        // are more than one item in the cart, the page elements will be the same
        // after one item has been removed, so waitForVisible will resolve
        // immediately
        .pause(500);
}

export function verifyCartEmpty () {
    return browser.isExisting(CART_EMPTY);
}

export function getItemList () {
    return browser
        .waitForExist(CART_ITEMS, 5000)
        .elements(CART_ITEMS);
}

export function getItemImageSrcAttrByRow (rowNum) {
    let selector = _createCssNthCartRow(rowNum) + ' ' + ITEM_IMAGE + ' > img';
    return browser.waitForVisible(selector)
        .getAttribute(selector, 'src');
}

export function getItemNameByRow (rowNum) {
    let selector = _createCssNthCartRow(rowNum) + ' .name';
    return browser.waitForVisible(selector)
        .getText(selector);
}

export function getItemSkuValueByRow (rowNum) {
    let selector = _createCssNthCartRow(rowNum) + ' .sku .value';
    return browser.waitForVisible(selector)
        .getText(selector);
}

export function getItemAttrByRow (rowNum, attr) {
    var itemAttr = _createCssNthCartRow(rowNum) + ' .attribute[data-attribute="' + attr + '"] .value';
    return browser.getText(itemAttr);
}
//get the quantity in Cart for a particular row
export function getQuantityByRow(rowNum) {
    var selector = [_createCssNthCartRow(rowNum), ITEM_QUANTITY, 'input'].join(' ');
    return browser.getValue(selector);
}

export function updateQuantityByRow (rowNum, value) {
    let selector = [_createCssNthCartRow(rowNum), ITEM_QUANTITY, 'input'].join(' ');
    return browser.waitForVisible(selector)
        .setValue(selector, value)
        .click(BTN_UPDATE_CART)
        // TODO: Replace with waitUntil to check for quantity change
        .pause(1000)
        .getValue(selector);
}

export function getQuantityErrorMessageByRow (rowNum) {
    let selector = _createCssNthCartRow(rowNum) + ' ' +  FRM_QUANTITY_ERROR;
    return browser.waitForVisible(selector)
        .getText(selector);
}

export function doesQuantityErrorMessageExistForRow (rowNum) {
    let selector = _createCssNthCartRow(rowNum) + ' ' +  FRM_QUANTITY_ERROR;
    return browser.waitForVisible(selector, 500, true)
        .then(() => browser.isVisible(selector));
}

export function getPriceByRow (rowNum) {
    return browser.getText(_createCssNthCartRow(rowNum) + ' .item-total .price-total');
}

export function getSelectPriceByRow (rowNum, selection) {
    return browser.getText(_createCssNthCartRow(rowNum) + ' ' + selection);
}

export function getItemEditLinkByRow (rowNum) {
    return [_createCssNthCartRow(rowNum), ITEM_DETAILS, '.item-edit-details a'].join(' ');
}

export function updateAttributesByRow (rowNum, selection) {
    return browser.click(getItemEditLinkByRow(rowNum))
        .waitForVisible(productQuickView.CONTAINER)
        // We must deselect all attributes before selecting the new variant choice as the selectable attributes are
        // dependent on values that are currently selected.  By deselecting all attributes, we can be assured that the
        // sequence of selecting color, then size, then width will set the desired attributes as selectable.
        .then(() => productQuickView.deselectAllAttributes())
        .then(() => productQuickView.selectAttributesByVariant(selection));
}

export function getBundledItemImageByRow (rowNum) {
    let selector = _createCssNthCartRow(rowNum) + BUNDLED_ITEM + ' ' + ITEM_IMAGE;
    return browser.waitForVisible(selector)
        .getText(selector);
}

export function getBundledItemNameByRow (rowNum) {
    let selector = _createCssNthCartRow(rowNum) + BUNDLED_ITEM + ' ' + ITEM_DETAILS + ' .name';
    return browser.waitForVisible(selector)
        .getText(selector);
}

export function getBundledItemNumberByRow (rowNum) {
    let selector = _createCssNthCartRow(rowNum) + BUNDLED_ITEM + ' ' + ITEM_DETAILS + ' .itemnumber .value';
    return browser.waitForVisible(selector)
        .getText(selector);
}

export function getBundledItemDetailsImageSrcAttrByRow (rowNum) {
    let selector = _createCssNthCartRow(rowNum) + BUNDLED_ITEM + ' ' + ITEM_DETAILS + ' > a > img';
    return browser.waitForVisible(selector)
        .getAttribute(selector, 'src');
}

export function getBundledItemQuantityByRow (rowNum) {
    let selector = _createCssNthCartRow(rowNum) + BUNDLED_ITEM + ' ' + ITEM_QUANTITY + ' .bundleqtyincluded';
    return browser.waitForVisible(selector)
        .getText(selector);
}

export function getBundledItemQuantityTagNameByRow (rowNum) {
    let selector = _createCssNthCartRow(rowNum) + BUNDLED_ITEM + ' ' + ITEM_QUANTITY + ' .bundleqtyincluded';
    return browser.waitForVisible(selector)
        .getTagName(selector);
}

export function getBundledItemUnitPriceByRow (rowNum) {
    let selector = _createCssNthCartRow(rowNum) + BUNDLED_ITEM + ' .item-price';
    return browser.waitForVisible(selector)
        .getText(selector);
}

export function getBundledItemTotalPriceByRow (rowNum) {
    let selector = _createCssNthCartRow(rowNum) + BUNDLED_ITEM + ' .item-total';
    return browser.waitForVisible(selector)
        .getText(selector);
}

function getAddToWishListSelectorByRow(rowNum) {
    return `${_createCssNthCartRow(rowNum)} ${ADD_TO_WISHLIST_LINK}`;
}

export function addItemToWishlistByRow(rowNum) {
    const addToWishlistLink = getAddToWishListSelectorByRow(rowNum);

    return browser.click(addToWishlistLink);
}

export function getAddToWishlistLabelByRow(rowNum) {
    const addToWishlistLink = getAddToWishListSelectorByRow(rowNum);

    return browser.getText(addToWishlistLink);
}

export function getInWishlistTextByRow(rowNum) {
    const inWishlist =  `${_createCssNthCartRow(rowNum)} ${IN_WISHLIST}`;

    return browser.getText(inWishlist);
}

/**
 * Retrieves the Cart's Sub-total value
 *
 */
export function getOrderSubTotal () {
    return browser.getText(ORDER_SUBTOTAL);
}

/**
 * Redirects the browser to the Cart page and empties the Cart.
 *
 */
export function emptyCart () {
    return navigateTo()
        .then(() => browser.elements('.item-quantity input'))
        .then(items => {
            if (items.value.length) {
                items.value.forEach(item =>
                    browser.elementIdClear(item.ELEMENT)
                        .elementIdValue(item.ELEMENT, '0'));

                return browser.click(BTN_UPDATE_CART);
            }
        })
        // There are some products, like Gift Certificates, whose
        // quantities cannot be changed in the Cart. For these, we
        // must click the Remove link on each.
        .then(() => common.removeItems(LINK_REMOVE))
        .then(() => browser.waitForExist(CART_EMPTY));
}
