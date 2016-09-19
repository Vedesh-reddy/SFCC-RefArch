'use strict';

var assert = require('chai').assert;
var BillingModel = require('../../../../app_storefront_base/cartridge/models/billing');

var billingAddress = {
    address: {}
};

var paymentModel = {
    applicablePaymentMethods: 'array of payment methods',
    applicablePaymentCards: 'array of credit cards',
    selectedPaymentInstruments: 'array of selected payment options'
};

describe('billing', function () {
    it('should handle a null address', function () {
        var result = new BillingModel(null);
        assert.equal(result.billingAddress, null);
    });

    it('should handle an address', function () {
        var result = new BillingModel(billingAddress);
        assert.deepEqual(result.billingAddress, {});
    });

    it('should handle a null paymentModel', function () {
        var result = new BillingModel(null, null);
        assert.equal(result.paymentOptions, null);
        assert.equal(result.paymentCardOptions, null);
        assert.equal(result.selectedPaymentOptions, null);
    });

    it('should handle a paymentModel', function () {
        var result = new BillingModel(null, paymentModel);
        assert.equal(result.paymentOptions, 'array of payment methods');
        assert.equal(result.paymentCardOptions, 'array of credit cards');
        assert.equal(result.selectedPaymentOptions, 'array of selected payment options');
    });
});
