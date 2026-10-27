'use strict';

/**
 * Payment form processor WALLET (hook app.payment.form.processor.wallet). The wallet needs
 * no card data: the amount is the server-side wallet instrument, never a form field.
 */

/**
 * @param {Object} req - request
 * @param {Object} paymentForm - billing form
 * @param {Object} viewFormData - data collected so far
 * @returns {Object} result in the base form-processor shape
 */
function processForm(req, paymentForm, viewFormData) {
    var viewData = viewFormData;
    viewData.paymentMethod = { value: paymentForm.paymentMethod.value, htmlName: paymentForm.paymentMethod.value };
    viewData.paymentInformation = {};
    return { error: false, viewData: viewData };
}

/**
 * Nothing to save: wallet payments store no instrument on the customer profile.
 */
function savePaymentInformation() {}

module.exports = {
    processForm: processForm,
    savePaymentInformation: savePaymentInformation
};
