const { I, data, cartPage, checkoutPage } = inject();

Then('shopper selects checkout from cart', () => {
    // From "test/acceptance/features/suites/happyPath.feature" {"line":11,"column":9}
    I.waitForElement(cartPage.locators.cartIcon);
    I.click(cartPage.locators.cartIcon);
    I.waitForElement(cartPage.locators.checkoutBtn);
    I.click(cartPage.locators.checkoutBtn);
});

Then('shopper selects checkout as guest', () => {
    // From "test/acceptance/features/suites/happyPath.feature" {"line":12,"column":9}
    I.waitForElement(checkoutPage.locators.checkoutAsGuestBtn);
    I.click(checkoutPage.locators.checkoutAsGuestBtn);
});

Then('shopper selects checkout as return user', () => {
    // From "test/acceptance/features/suites/happyPath.feature" {"line":12,"column":9}
    checkoutPage.fillReturnCustomerInfo(data.login.email, data.login.password);
    I.waitForElement(checkoutPage.locators.checkoutAsRegisteredBtn);
    I.click('Login');
});

Then('shopper fills out shipping information', () => {
    // From "test/acceptance/features/suites/happyPath.feature" {"line":13,"column":9}
    checkoutPage.fillShippingInfo(data.checkout.fName, data.checkout.lName, data.checkout.address1,
        data.checkout.address2, data.checkout.country, data.checkout.state, data.checkout.city,
        data.checkout.zip, data.checkout.phone);
});

Then('shopper verifies shipping information', () => {
    checkoutPage.verifyShipping(data.checkout.fName, data.checkout.lName, data.checkout.address1,
        data.checkout.address2, data.checkout.city, data.checkout.stateAbr, data.checkout.zip);
});

Then('shopper proceeds to payment section', () => {
    I.waitForElement(checkoutPage.locators.toPayment);
    I.click(checkoutPage.locators.toPayment);
});

Then('shopper fills out billing information', () => {
    checkoutPage.fillPaymentInfoGuest(data.user1.fName, data.user1.lName, data.user1.address1, data.user1.address2,
        data.user1.city, data.user1.stateAbr, data.user1.zip, data.checkout.email, data.checkout.phone, data.checkout.ccNum,
        data.checkout.expMonth, data.checkout.expYear, data.checkout.ccSecCode);
});

Then('shopper fills out registered user billing information', () => {
    checkoutPage.fillPaymentInfoRegistered(data.checkout.email, data.checkout.phone, data.checkout.ccSecCode);
});

Then('shopper places order', () => {
    I.waitForElement(checkoutPage.locators.placeOrder);
    I.click(checkoutPage.locators.placeOrder);
    checkoutPage.verifyCheckoutInfo(data.checkout.fName, data.checkout.lName, data.checkout.address1,
        data.checkout.address2, data.checkout.city, data.checkout.zip, data.checkout.phone,
        data.checkout.email, data.checkout.ccNum, data.checkout.ccExpDate, data.product.quantity,
        data.product.totalItemPrice, data.product.shipping, data.product.tax, data.product.estimatedTotal);
    I.waitForElement(checkoutPage.locators.confirmOrder);
    I.click(checkoutPage.locators.confirmOrder);
});

Then('shopper verifies the order confirmation page', () => {
    checkoutPage.verifyOrderConfirmation(data.checkout.fName, data.checkout.lName, data.checkout.address1,
        data.checkout.address2, data.checkout.city, data.checkout.zip, data.checkout.phone,
        data.checkout.email, data.checkout.ccNum, data.checkout.ccExpDate, data.product.quantity,
        data.product.totalItemPrice, data.product.shipping, data.product.tax, data.product.estimatedTotal);
});
