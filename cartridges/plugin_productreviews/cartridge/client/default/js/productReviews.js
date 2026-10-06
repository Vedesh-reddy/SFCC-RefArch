'use strict';

/**
 * Display messages as text, including server validation failures.
 * @param {jQuery} $widget - Review widget
 * @param {string} message - Message
 * @param {boolean} error - Error styling
 */
function showMessage($widget, message, error) {
    $widget.find('.review-message').text(message)
        .addClass('alert').toggleClass('alert-danger', !!error)
        .toggleClass('alert-success', !error).trigger('focus');
}

/**
 * Load only this widget's fragment; preserve a working full-page fallback on failure.
 * @param {jQuery} $widget - Review widget
 * @param {string} url - Fragment URL
 * @param {boolean} focus - Move focus after a deliberate page change
 * @returns {Object} AJAX promise
 */
function loadReviews($widget, url, focus) {
    $widget.attr('aria-busy', 'true');
    return $.ajax({ url: url, dataType: 'html', cache: false }).done(function (html) {
        $widget.find('.review-panel').html(html);
        var summary = $widget.find('.review-content').attr('data-summary');
        var pid = $widget.attr('data-review-pid');
        $('[data-review-summary-pid]').filter(function () {
            return $(this).attr('data-review-summary-pid') === pid;
        }).text(summary || '').attr('href', '#product-reviews');
        if (focus) $widget.find('.review-heading').trigger('focus');
    }).fail(function () {
        showMessage($widget, $widget.attr('data-error'), true);
    }).always(function () {
        $widget.attr('aria-busy', 'false');
    });
}

$(function () {
    $('.product-reviews').each(function () {
        var $widget = $(this);
        if (!$widget.attr('data-loaded')) loadReviews($widget, $widget.attr('data-reviews-url'), false);
    });

    $(document).on('click', '.product-reviews .review-page', function (event) {
        event.preventDefault();
        var $widget = $(this).closest('.product-reviews');
        if ($widget.attr('aria-busy') !== 'true') loadReviews($widget, $(this).attr('data-url'), true);
    });

    $(document).on('change', '.review-form [name="rating"]', function () {
        var $form = $(this).closest('.review-form');
        $form.find('[name="rating"]').attr('aria-invalid', 'false');
        $form.find('#review-rating-error').text('');
    });

    $(document).on('submit', '.product-reviews .review-form', function (event) {
        event.preventDefault();
        var $form = $(this);
        var $widget = $form.closest('.product-reviews');
        var $button = $form.find('[type="submit"]');
        if ($button.prop('disabled') || !$form[0].reportValidity()) return;
        $button.prop('disabled', true);
        $form.attr('aria-busy', 'true');
        $form.find('.review-field-error').text('');
        $form.find('[aria-invalid]').attr('aria-invalid', 'false');
        $.ajax({
            url: $form.attr('action'),
            method: 'POST',
            data: $form.serialize(),
            dataType: 'json'
        }).done(function (data) {
            if (!data.success) {
                showMessage($widget, data.message || $widget.attr('data-error'), true);
                return;
            }
            showMessage($widget, data.message, false);
            loadReviews($widget, $widget.attr('data-reviews-url'), false);
        }).fail(function (xhr) {
            var data = xhr.responseJSON || {};
            showMessage($widget, data.message || $widget.attr('data-error'), true);
            if (data.csrf) {
                $form.find('.review-csrf').attr('name', data.csrf.name).val(data.csrf.value);
            }
            ['rating', 'displayName', 'title', 'body'].forEach(function (field) {
                if (data.fieldErrors && data.fieldErrors[field]) {
                    $form.find('#review-' + field + '-error').text(data.fieldErrors[field]);
                    $form.find('[name="' + field + '"]').attr('aria-invalid', 'true');
                }
            });
            $form.find('[aria-invalid="true"]').first().trigger('focus');
        }).always(function () {
            $button.prop('disabled', false);
            $form.attr('aria-busy', 'false');
        });
    });
});
