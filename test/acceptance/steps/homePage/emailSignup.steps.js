const { I, data, homePage } = inject();

Then('shopper enters email in signup form', () => {
    // From "test/acceptance/features/homePage/emailSignup.feature" {"line":7,"column":9}
    I.scrollPageToBottom();
    homePage.subscribeList(data.home.email);
});

Then('shopper subscribes to the email list', () => {
    // From "test/acceptance/features/homePage/emailSignup.feature" {"line":8,"column":9}
    I.click(homePage.locators.subscribeButton);
    I.waitForElement(homePage.locators.emailSignup);
    I.see('Email Signup successful');
});
