'use strict';

/**
 * Billing step wallet panel: applies or removes the wallet, handles step-up codes and owner
 * approval requests, and switches the payment method to the wallet when it covers the total.
 * Amounts shown come from the server responses.
 */

/**
 * @param {jQuery} $panel - wallet panel
 * @param {boolean} coversTotal - true when the wallet pays the whole order
 */
function setPaymentMethod($panel, coversTotal) {
    var methodId = coversTotal ? $panel.data('method-id') : 'CREDIT_CARD';
    $('.payment-information').data('payment-method-id', methodId);
    $('input[name$="billing_paymentMethod"]').val(methodId);
    $('.credit-card-selection-new, .payment-options').toggleClass('d-none', coversTotal);
}

/**
 * @param {jQuery} $panel - wallet panel
 * @param {string} url - endpoint
 * @param {Object} data - form data
 * @param {Function} done - success callback
 */
function post($panel, url, data, done) {
    var $status = $panel.find('.wallet-checkout-status');
    // The billing page already carries the CSRF token that the wallet routes validate.
    var payload = Object.assign({ csrf_token: $('input[name="csrf_token"]').first().val() }, data);
    $.ajax({
        url: url,
        method: 'POST',
        data: payload,
        success: function (response) {
            $status.text('');
            done(response);
        },
        error: function (xhr) {
            $status.text(xhr.responseJSON && xhr.responseJSON.message ? xhr.responseJSON.message : '');
        }
    });
}

/**
 * @param {jQuery} $panel - wallet panel
 * @param {Object} response - Apply/Remove response
 */
function render($panel, response) {
    var applied = response.walletCents > 0;
    $panel.find('.wallet-applied').toggleClass('d-none', !applied);
    $panel.find('.wallet-applied-amount').text(response.walletFormatted || '');
    $panel.find('.wallet-remaining-amount').text(response.remainingFormatted || '');
    $panel.find('.wallet-step-up').toggleClass('d-none', !(applied && response.requirement === 'CODE' && !response.approved));
    $panel.find('.wallet-owner-approval').toggleClass('d-none', !(applied && response.requirement === 'OWNER' && !response.approved));
    setPaymentMethod($panel, applied && response.coversTotal);
    $('body').trigger('checkout:updateCheckoutView', {});
}

$(document).ready(function () {
    var $panel = $('.wallet-checkout');
    if (!$panel.length) return;
    if ($panel.data('covers-total') === true || $panel.data('covers-total') === 'true') setPaymentMethod($panel, true);

    $panel.on('click', '.wallet-apply', function () {
        post($panel, $panel.data('apply-url'), { mode: $(this).data('mode'), amount: $panel.find('.wallet-amount-input').val() || '' }, function (response) {
            render($panel, response);
        });
    });
    $panel.on('click', '.wallet-remove', function () {
        post($panel, $panel.data('remove-url'), {}, function (response) { render($panel, response); });
    });
    $panel.on('click', '.wallet-send-code', function () {
        post($panel, $panel.data('code-url'), {}, function () {
            $panel.find('.wallet-code-input').trigger('focus');
        });
    });
    $panel.on('click', '.wallet-verify-code', function () {
        post($panel, $panel.data('verify-url'), { code: $panel.find('.wallet-code-input').val() }, function () {
            $panel.find('.wallet-step-up').addClass('d-none');
        });
    });
    $panel.on('click', '.wallet-request-approval', function () {
        post($panel, $panel.data('approval-url'), {}, function () {
            $panel.find('.wallet-owner-approval').addClass('d-none');
        });
    });
});
