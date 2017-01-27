'use strict';

import _ from 'lodash';
import * as formHelpers from '../helpers/forms/common';

export const BTN_NEXT_PAYMENT = '.submit-shipping';
export const BTN_NEXT_PLACE_ORDER = '.submit-payment';
export const BTN_PLACE_ORDER = '.place-order';
export const PAGE_TITLE = '.page-title';
export const SHIPPING_ACTIVE_TAB = '.shipping-tab.active';
export const GHOST_PAYMENT_FORM = '.ghost.payment';
export const PAYMENT_FORM = '.payment-form';
export const PAYMENT_SUMMARY = '.payment-summary';

// keys (IDs) for fields in shipping form
export const SHIPPING_FIRST_NAME = 'FirstName';
export const SHIPPING_LAST_NAME = 'LastName';
export const SHIPPING_ADDRESS_ONE = 'AddressOne';
export const SHIPPING_ADDRESS_TWO = 'AddressTwo';
export const SHIPPING_COUNTRY = 'Country';
export const SHIPPING_STATE = 'State';
export const SHIPPING_ADDRESS_CITY = 'AddressCity';
export const SHIPPING_ZIP_CODE = 'ZipCode';
export const SHIPPING_PHONE_NUMBER = 'PhoneNumber';

// keys (IDs) for fields in payment form
export const PAYMENT_CARD_NUMBER = 'cardNumber';
export const PAYMENT_EXPIRATION_MONTH = 'expirationMonth';
export const PAYMENT_EXPIRATION_YEAR = 'expirationYear';
export const PAYMENT_SECURITY_CODE = 'securityCode';
export const PAYMENT_EMAIL = 'email';
export const PAYMENT_PHONE_NUMBER = 'phoneNumber';


export function fillOutShippingForm(shippingData, locale) {
    let fieldTypes = new Map();
    let fieldsPromise = [];
    fieldTypes.set(SHIPPING_FIRST_NAME, 'input');
    fieldTypes.set(SHIPPING_LAST_NAME, 'input');
    fieldTypes.set(SHIPPING_ADDRESS_ONE, 'input');
    fieldTypes.set(SHIPPING_ADDRESS_TWO, 'input');
    fieldTypes.set(SHIPPING_COUNTRY, 'selectByVisibleText');

    if (locale && locale === 'x_default') {
        fieldTypes.set(SHIPPING_STATE, 'selectByVisibleText');
    }

    fieldTypes.set(SHIPPING_ADDRESS_CITY, 'input');
    fieldTypes.set(SHIPPING_ZIP_CODE, 'input');
    fieldTypes.set(SHIPPING_PHONE_NUMBER, 'input');

    _.each(shippingData, (value, key) => {
        let prefix = '#shipping';
        let selector = prefix + key;
        fieldsPromise.push(formHelpers.populateField(selector, value, fieldTypes.get(key)));
    });
    return Promise.all(fieldsPromise);
}

export function fillOutPaymentForm(billingFields) {
    let fieldTypes = new Map();
    let fieldsPromise = [];

    fieldTypes.set(PAYMENT_CARD_NUMBER, 'input');
    fieldTypes.set(PAYMENT_EXPIRATION_MONTH, 'selectByValue');
    fieldTypes.set(PAYMENT_EXPIRATION_YEAR, 'selectByValue');
    fieldTypes.set(PAYMENT_SECURITY_CODE, 'input');
    fieldTypes.set(PAYMENT_EMAIL, 'input');
    fieldTypes.set(PAYMENT_PHONE_NUMBER, 'input');

    _.each(billingFields, (value, key) => {
        let fieldType = fieldTypes.get(key);
        let selector = '#' + key;
        fieldsPromise.push(formHelpers.populateField(selector, value, fieldType));
    });

    return Promise.all(fieldsPromise);
}
