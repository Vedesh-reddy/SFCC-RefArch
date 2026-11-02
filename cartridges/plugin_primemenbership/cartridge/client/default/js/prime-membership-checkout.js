'use strict';

// The membership form posts normally, so it sets the card type that base checkout's script would set.
$(document).ready(function () {
    var types = [[/^4/, 'Visa'], [/^(5[1-5]|2[2-7])/, 'Master Card'], [/^3[47]/, 'Amex'], [/^6(011|5)/, 'Discover']];
    $('.prime-membership-payment-form #cardNumber').on('input', function () {
        var number = $(this).val().replace(/\D/g, '');
        var match = types.filter(function (entry) { return entry[0].test(number); })[0];
        $('#cardType').val(match ? match[1] : 'Unknown');
        $('#securityCode').attr('maxlength', match && match[1] === 'Amex' ? 4 : 3);
    });
    $('.prime-membership-payment-form').on('submit', function () {
        var $number = $(this).find('#cardNumber');
        $number.val($number.val().replace(/\D/g, ''));
        $(this).find('button[type="submit"]').prop('disabled', true);
    });
    $('.prime-membership-billing-form').on('submit', function () {
        var $state = $(this).find('#prime-membership-state');
        $state.val($state.val().toUpperCase());
    });
});
