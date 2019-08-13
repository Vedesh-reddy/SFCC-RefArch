const { I, data, loginPage } = inject();

Then('shopper is able to click tab to create account', () => {
    // From "test/acceptance/features/loginPage/createAccount.feature" {"line":6,"column":9}
    I.waitForElement(loginPage.locators.createAccount);
    I.click(loginPage.locators.createAccount);
});

Then('shopper is able fill out registration information', () => {
    // From "test/acceptance/features/loginPage/createAccount.feature" {"line":7,"column":9}
    loginPage.createAccount(data.login.fName, data.login.lName, data.login.phone, data.login.regEmail, data.login.password);
});

Then('shopper is able to click the create account button', () => {
    // From "test/acceptance/features/loginPage/createAccount.feature" {"line":8,"column":9}
    I.waitForElement(loginPage.locators.primaryButton);
    I.click(locate(loginPage.locators.primaryButton).withText('Create Account'));
    // TODO If you see an error then we'll know it's good, but it's also good if you see a dashboard
});

Then('shopper may see a username is invalid error', () => {
    // From "test/acceptance/features/loginPage/createAccount.feature" {"line":10,"column":9}
    I.see('Username is invalid.');
});
