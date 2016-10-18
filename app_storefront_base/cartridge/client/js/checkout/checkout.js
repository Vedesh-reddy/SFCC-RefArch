'use strict';

module.exports = function () {
    $('.billing-same-as-shipping').change(function () {
        if (this.checked) {
            $('.billing-address').hide();
        } else {
            $('.billing-address').show();
        }
    });

    $('input[name="paymentOption"]').change(function () {
        if ($(this).val() === 'CREDIT_CARD') {
            $('.credit-card-form').show();
        } else {
            $('.credit-card-form').hide();
        }
    });
};
