'use strict';

/**
 * Navigate to Home->login->Create Account page
 * without providing any data, create account should error out
 */

import { assert } from 'chai';
import * as loginPage from '../../mocks/testDataMgr/pageObjects/login';
import * as homePage from '../../mocks/testDataMgr/pageObjects/home';

describe('Login Page Create Account Form', () => {
    before(() => {
        return homePage.navigateTo()
            .then(() => browser.isVisible(homePage.navBarButton))
            .then(isVisible => {
                if (isVisible) {
                    // access mobile devices
                    return browser.click(homePage.navBarButton)
                        .waitForVisible(homePage.navBar)
                        .click(homePage.signInButtonIpad)
                        .pause(3000)
                        .click(loginPage.checkStatusButton);
                        // this test has been modified because click CreateNewAccount Tab fails due to appium 1.6.3 issue #7636
                }
                // access desktop browser
                return browser.click(homePage.signInButton)
                    .click(loginPage.createAccountTab)
                    .click(loginPage.createAccountButton);
            });
    });
    it('Validate the expected error from the client side is displayed when form is not filled', () => {
        return browser.elements(loginPage.getFormFeedback)
            .then(elements => elements.value.forEach(ele => browser.elementIdText(ele.ELEMENT)
                .then(msg => assert.equal(msg.value, 'Please fill out this field.', 'expected message is displayed'))));
    });
});
