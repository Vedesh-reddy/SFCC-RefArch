const I = actor();

module.exports = {
    locators: {
        consentTrackModal: '.modal-content',
        consentTrackAffirm: '.affirm.btn.btn-primary',
        searchField: 'input.form-control.search-field',
        searchedImage: 'a>img.swatch-circle',
        loginButton: '.user-message',
        subscribeEmail: 'input.form-control',
        subscribeButton: '.subscribe-email',
        emailSignup: '.email-signup-alert',
        searchWomens: '#womens.nav-link.dropdown-toggle',
        searchWomensClothing: '#womens-clothing.dropdown-link.dropdown-toggle',
        searchWomensTops: '#womens-clothing-tops.dropdown-link'
    },
    accept() {
        I.waitForElement(this.locators.consentTrackModal);
        within(this.locators.consentTrackModal, () => {
            I.click(this.locators.consentTrackAffirm);
        });
    },
    search(product) {
        I.waitForElement(this.locators.searchField, 2);
        I.fillField(this.locators.searchField, product);
        I.waitForElement(this.locators.searchedImage);
        I.click(this.locators.searchedImage);
    },
    // clickLogin() {
    //     // Not currently in use.
    //     let desktopLocator = locate(this.locators.loginButton)
    //         .withText('Login');
    //     let tabletLocator = locate('.fa.fa-sign-in')
    //         .withAttr({'aria-hidden': 'true'});
    //     let mobileLocator = locate('.navbar-toggler.d-md-none')
    //         .withAttr({'aria-label': 'Toggle navigation'});
    //     let failedTest = 'this class should never be found';

    //     if(I.isExisting(failedTest).then((res) => {console.log('first res: ', res)})) {
    //         console.log('WOOOOOP');
    //     }
    //     if(I.isExisting(desktopLocator).then((res) => {console.log('second res: ', res)})) {
    //         I.click(desktopLocator);
    //     }
    // },
    subscribeList(email) {
        I.fillField('hpEmailSignUp', email);
    },
    searchMenu(productPage) {
        /*
        Method is hardcoded to search for Women's tops from the menu.
        This should be updated to take at most 3 parameters when hover is working
        For each possible layer, can include the word to hover over rather than element
        ie searchMenu('Womens', 'Clothing', 'Tops')
        I.waitForElement(this.locators.searchWomens);
        I.moveCursorTo(this.locators.searchWomens);
        I.wait(2);
        I.waitForElement(this.locators.searchWomensClothing);
        I.moveCursorTo(this.locators.searchWomensClothing);
        I.wait(2);
        I.waitForElement(this.locators.searchWomensTops);
        I.click(this.locators.searchWomensTops);
        */
        I.amOnPage(productPage);
    }
};
