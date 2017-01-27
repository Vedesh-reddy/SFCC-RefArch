'use strict';

import { assert } from 'chai';
import { config } from '../webdriver/wdio.conf';
import * as productDetailPage from '../../mocks/testDataMgr/pageObjects/productDetail';
import * as cartPage from '../../mocks/testDataMgr/pageObjects/cart';
import * as checkoutPage from '../../mocks/testDataMgr/pageObjects/checkout';
import * as orderConfPage from '../../mocks/testDataMgr/pageObjects/orderConfirmation.js';
import * as testDataMgr from '../../mocks/testDataMgr/main';
import * as Resource from '../../mocks/dw/web/Resource';
import * as customers from '../../mocks/testDataMgr/customers';


/*
 Verify checkout flow for Guest user with same billing and shipping address
 */

describe('Checkout - As Guest, same Billing and Shipping address ', () => {
    const locale = config.locale;
    const userEmail = config.userEmail;
    const creditcardExpiredYear = new Date().getFullYear() + 1;
    const creditcardExpiredMonth = 12;
    const paymentPhone = '781-425-1010';
    const paymentEmail = 'luckyOne@home.com';

    const shippingData = {};
    const paymentData = {};

    const productVariantId1 = '701644130756';
    let productVariant1;

    const prodIdUnitPricesMap = {};

    const groundShipMethodIndex = 0;

    // in before block:
    // - prepare shipping and payment data
    // - add product to cart
    // - navigate to cart
    before(() => {
        return testDataMgr.load()
            .then(() => {
                const customer = testDataMgr.getCustomerByLogin(userEmail);
                customer.addresses[0].postalCode = customers.globalPostalCode[locale];
                customer.addresses[0].countryCode = customers.globalCountryCode[locale];
                customer.addresses[0].phone = customers.globalPhone[locale];

                const address = customer.getPreferredAddress();

                shippingData[checkoutPage.SHIPPING_FIRST_NAME] = customer.firstName;
                shippingData[checkoutPage.SHIPPING_LAST_NAME] = customer.lastName;
                shippingData[checkoutPage.SHIPPING_ADDRESS_ONE] = address.address1;
                shippingData[checkoutPage.SHIPPING_COUNTRY] = address.countryCode;
                shippingData[checkoutPage.SHIPPING_ADDRESS_CITY] = address.city;
                shippingData[checkoutPage.SHIPPING_ZIP_CODE] = address.postalCode;
                shippingData[checkoutPage.SHIPPING_PHONE_NUMBER] = address.phone;


                if (locale && locale === 'x_default') {
                    shippingData[checkoutPage.SHIPPING_STATE] = address.stateCode;
                }

                paymentData[checkoutPage.PAYMENT_CARD_NUMBER] = testDataMgr.creditCard1.number;
                paymentData[checkoutPage.PAYMENT_EXPIRATION_MONTH] = creditcardExpiredMonth;
                paymentData[checkoutPage.PAYMENT_EXPIRATION_YEAR] = creditcardExpiredYear;
                paymentData[checkoutPage.PAYMENT_SECURITY_CODE] = testDataMgr.creditCard1.cvn;
                paymentData[checkoutPage.PAYMENT_PHONE_NUMBER] = paymentPhone;
                paymentData[checkoutPage.PAYMENT_EMAIL] = paymentEmail;

                const unitPrices = testDataMgr.getPricesByProductId(productVariantId1, locale);
                prodIdUnitPricesMap[productVariantId1] = unitPrices;

                productVariant1 = testDataMgr.getProductById(productVariantId1);
            })
            .then(() => browser.url(productVariant1.getUrlResourcePath()))
            .then(() => productDetailPage.clickAddToCartButton())
            .then(() => cartPage.navigateTo())
            .then(() => browser.waitForVisible(cartPage.SHIPPING_METHODS))
            .then(() => browser.selectByIndex(cartPage.SHIPPING_METHODS, groundShipMethodIndex));
    });

    it('Should be able to checkout from cart.', function () {
        return browser.click(cartPage.BTN_CHECKOUT)
            .then(() => browser.getText(checkoutPage.PAGE_TITLE))
            .then((pageTitle) => {
                const defaultTitle = 'Checkout';
                const expectedPageTitle = Resource.msgf('title.checkout', 'checkout', null, defaultTitle);
                assert.equal(pageTitle, expectedPageTitle, 'Expected to be on checkout page with page title = ' + expectedPageTitle);
            })
            .then(() => browser.getText(checkoutPage.SHIPPING_ACTIVE_TAB))
            .then((activeTabTitle) => {
                const defaultTabTitle = 'Shipping';
                const expectedActiveTabTitle = Resource.msgf('action.shipping.form', 'checkout', null, defaultTabTitle);
                assert.equal(activeTabTitle, expectedActiveTabTitle, 'Expected to be on checkout page with active tab title = ' + expectedActiveTabTitle);
            });
    });

    // Fill in Shipping Form
    it('should be able to fill required fields in Shipping form.', () =>
        checkoutPage.fillOutShippingForm(shippingData, locale)
            .then(() => browser.isEnabled(checkoutPage.BTN_NEXT_PAYMENT))
            .then(btnEnabled => assert.ok(btnEnabled))
    );

    it('should direct to the Payment page after Shipping page has been submitted', () =>
        browser.click(checkoutPage.BTN_NEXT_PAYMENT)
            .then(() => browser.waitForExist(checkoutPage.BTN_NEXT_PLACE_ORDER))
            .then(() => browser.waitForVisible(checkoutPage.PAYMENT_FORM))
            .then(() => browser.isVisible(checkoutPage.PAYMENT_FORM))
            .then(paymentFormVisible => assert.ok(paymentFormVisible))
    );

    // Fill in Billing Form
    it('should be able to fill required fields in Payment Form.', () =>
        checkoutPage.fillOutPaymentForm(paymentData)
            .then(() => browser.isEnabled(checkoutPage.BTN_NEXT_PLACE_ORDER))
            .then(enabled => assert.ok(enabled))
    );

    it('should direct to the Place Order page after Payment page has been submitted', () =>
        browser.click(checkoutPage.BTN_NEXT_PLACE_ORDER)
            .then(() => browser.waitForExist(checkoutPage.BTN_PLACE_ORDER))
            .then(() => browser.waitForVisible(checkoutPage.PAYMENT_SUMMARY))
            .then(() => browser.isVisible(checkoutPage.PAYMENT_SUMMARY))
            .then(paymentSummaryVisible => assert.ok(paymentSummaryVisible))
            .then(() => browser.isEnabled(checkoutPage.BTN_PLACE_ORDER))
            .then(enabled => assert.ok(enabled))
    );

    // placing order
    it('should redirect to a thank you page after a successful order submission', () => {
        return browser.click(checkoutPage.BTN_PLACE_ORDER)
            .waitForVisible(orderConfPage.RECEIPT_CONTAINER)
            .then(() => browser.getText(orderConfPage.PAGE_TITLE))
            .then((pageTitle) => {
                const defaultTitle = 'Thank You';
                const expectedPageTitle = Resource.msgf('title.thank.you.page', 'confirmation', null, defaultTitle);
                assert.equal(pageTitle, expectedPageTitle, 'Expected to be on order confirmation page with page title = ' + expectedPageTitle);
            });
    });
});

