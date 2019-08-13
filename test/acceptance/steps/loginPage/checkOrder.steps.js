const { I, data, loginPage } = inject();

Then('shopper is able to fill out the order number, email, and zip code', () => {
    loginPage.checkOrder(data.orderHistory.number, data.orderHistory.email, data.orderHistory.zip);
});

Then('shopper is able to click the check status button', () => {
    I.waitForElement(loginPage.locators.primaryButton);
    I.click(locate(loginPage.locators.primaryButton).withText('Check status'));
});

Then('shopper is able to view order detail', () => {
    loginPage.verifyOrderHistory(data.product);
});
