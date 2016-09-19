'use strict';

/**
* Billing class that represent billing information for the current basket
* @param {Object} addressModel - the billing address of the current basket
* @param {Object} paymentModel - payment information for the current basket
* @constructor
*/
function billing(addressModel, paymentModel) {
    this.billingAddress = addressModel ? addressModel.address : null;

    if (paymentModel) {
        this.paymentOptions = paymentModel.applicablePaymentMethods;
        this.paymentCardOptions = paymentModel.applicablePaymentCards;
        this.selectedPaymentOptions = paymentModel.selectedPaymentInstruments;
    } else {
        this.paymentOptions = null;
        this.paymentCardOptions = null;
        this.selectedPaymentOptions = null;
    }
}

module.exports = billing;
