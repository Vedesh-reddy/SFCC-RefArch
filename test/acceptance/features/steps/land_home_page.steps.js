const { I, homePage, uriUtils } = inject();

When('shopper selects yes or no for tracking consent', () => {
    I.amOnPage(uriUtils.uri.homePage);
    homePage.accept();
});
