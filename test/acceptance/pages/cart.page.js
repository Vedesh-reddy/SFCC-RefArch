const I = actor();

module.exports = {
    locators: {
        lineItemName: 'div.line-item-name',
        checkoutBtn: '.btn.btn-primary.btn-block.checkout-btn',
        checkoutAsGuestBtn: '.btn.btn-block.btn-primary.checkout-as-guest',
        fName: '.form-control.shippingFirstName',
        lName: '.form-control.shippingLastName',
        address1: '.form-control.shippingAddressOne',
        address2: '.form-control.shippingAddressTwo',
        country: '.form-control.shippingCountry',
        state: '.form-control.shippingState',
        city: '.form-control.shippingAddressCity',
        zip: '.form-control.shippingZipCode',
        phone: '.form-control.shippingPhoneNumber',
        toPayment: '.btn.btn-primary.btn-block.submit-shipping',
        payEmail: '#email.form-control.email',
        payPhone: '#phoneNumber',
        payCard: '#cardNumber',
        payExpMonth: '#expirationMonth',
        payExpYear: '#expirationYear',
        paySecCode: '#securityCode',
        placeOrder: '.btn.btn-primary.btn-block.submit-payment',
        confirmOrder: '.btn.btn-primary.btn-block.place-order'
    },
    fillShippingInfo(fName, lName, address1, address2, country, state, city, zipcode, phone) {
        I.fillField(this.locators.fName, fName);
        I.fillField(this.locators.lName, lName);
        I.fillField(this.locators.address1, address1);
        I.fillField(this.locators.address2, address2);
        I.waitForElement(this.locators.country);
        I.selectOption(this.locators.country, country);
        I.waitForElement(this.locators.state);
        I.selectOption(this.locators.state, state);
        I.wait(3);
        I.fillField(this.locators.city, city);
        I.fillField(this.locators.phone, phone);
        I.fillField(this.locators.zip, zipcode);
    },
    fillPaymentInfo(email, phone, ccNum, expMonth, expYear, ccSecCode) {
        I.fillField(this.locators.payEmail, email);
        I.fillField(this.locators.payPhone, phone);
        I.fillField(this.locators.payCard, ccNum);
        I.waitForElement(this.locators.payExpMonth, expMonth);
        I.selectOption(this.locators.payExpMonth, expMonth);
        I.waitForElement(this.locators.payExpYear, expYear);
        I.selectOption(this.locators.payExpYear, expYear);
        I.fillField(this.locators.paySecCode, ccSecCode);
    }
};
