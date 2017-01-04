'use strict';

/**
* Billing class that represent billing information for the current basket
* @param {Object} addressModel - the billing address of the current basket
* @param {Object} paymentModel - payment information for the current basket
* @constructor
*/
function billing(addressModel, paymentModel) {
    this.billingAddress = addressModel;
    this.payment = paymentModel;
}

module.exports = billing;
