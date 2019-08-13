const I = actor();

module.exports = {
    locators: {
        addressTitle: '#addressId.form-control',
        fName: '#firstName.form-control',
        lName: '#lastName.form-control',
        address1: '#address1.form-control',
        address2: '#address2.form-control',
        country: '#country.form-control',
        state: '#state.form-control',
        city: '#city.form-control',
        zip: '#zipCode.form-control',
        phone: '#phone.form-control',
        saveBtn: '.btn.btn-save.btn-block.btn-primary',
        nameOnCard: '#cardOwner.form-control',
        ccNum: '#cardNumber.form-control',
        expMonth: '#month.form-control',
        expYear: '#year.form-control',
        defaultPayment: '.custom-control-label',
        currentPassword: '#currentPassword.form-control',
        newPassword: '#newPassword.form-control',
        newPasswordConfirm: '#newPasswordConfirm.form-control',
        confirmEmail: '#confirmEmail.form-control',
        confirmPassword: '#password.form-control',
        addNew: '.card-link',
        backToAccount: '.text-center.back-to-account-link',
        viewAll: '.pull-right',
        removeProductBtn: '.remove-btn.remove-payment.btn-light',
        removeProductModal: '.modal-content',
        removeProductConfirm: '.btn.btn-primary.delete-confirmation-btn'

    },
    addAddress(addressTitle, fName, lName, address1, address2, country, state, city, zipcode, phone) {
        I.fillField(this.locators.addressTitle, addressTitle);
        I.fillField(this.locators.fName, fName);
        I.fillField(this.locators.lName, lName);
        I.fillField(this.locators.address1, address1);
        I.fillField(this.locators.address2, address2);
        I.waitForElement(this.locators.country);
        I.selectOption(this.locators.country, country);
        I.waitForElement(this.locators.state);
        I.selectOption(this.locators.state, state);
        I.fillField(this.locators.city, city);
        I.fillField(this.locators.zip, zipcode);
        I.fillField(this.locators.phone, phone);
        I.waitForElement(this.locators.saveBtn);
        I.click(this.locators.saveBtn);
    },
    clickAddAddress() {
        let locator = locate(this.locators.addNew)
            .withAttr({ 'aria-label': 'Add New Address' });
        I.click(locator);
    },
    clickAddPayment() {
        let locator = locate(this.locators.addNew)
            .withAttr({ 'aria-label': 'Add New Payment' });
        I.click(locator);
    },
    clickEditProfile() {
        let locator = locate(this.locators.viewAll)
            .withAttr({ 'aria-label': 'Edit Profile' });
        I.click(locator);
    },
    clickEditPassword() {
        let locator = locate(this.locators.viewAll)
            .withAttr({ 'aria-label': 'Change Password' });
        I.click(locator);
    },
    addPayment(nameOnCard, ccNum, expMonth, expYear) {
        I.fillField(this.locators.nameOnCard, nameOnCard);
        I.fillField(this.locators.ccNum, ccNum);
        I.scrollTo(this.locators.expMonth);
        I.waitForElement(this.locators.expMonth, expMonth);
        I.selectOption(this.locators.expMonth, expMonth);
        I.waitForElement(this.locators.expYear, expYear);
        I.selectOption(this.locators.expYear, expYear);
        I.click(this.locators.defaultPayment);
        I.waitForElement(this.locators.saveBtn);
        I.click(this.locators.saveBtn);
        I.waitForElement(this.locators.backToAccount);
        I.click(this.locators.backToAccount);
    },
    viewAllPayments() {
        let locator = locate(this.locators.viewAll)
            .withAttr({ 'aria-label': 'View saved payment methods' });
        I.click(locator);
    },
    removePayment() {
        let locator = locate(this.locators.removeProductBtn).last();
        I.click(locator);
        I.waitForElement(this.locators.removeProductModal);
        within(this.locators.removeProductModal, () => {
            I.waitForElement(this.locators.removeProductConfirm);
            I.wait(1);
            I.click(this.locators.removeProductConfirm);
        });
    },
    changePassword(currentPassword, newPassword) {
        I.fillField(this.locators.currentPassword, currentPassword);
        I.fillField(this.locators.newPassword, newPassword);
        I.fillField(this.locators.newPasswordConfirm, newPassword);
        I.waitForElement(this.locators.saveBtn);
        I.click(this.locators.saveBtn);
    },
    editProfile(phone, email, password) {
        I.fillField(this.locators.phone, phone);
        I.fillField(this.locators.confirmEmail, email);
        I.fillField(this.locators.confirmPassword, password);
        I.waitForElement(this.locators.saveBtn);
        I.click(this.locators.saveBtn);
    }
};
