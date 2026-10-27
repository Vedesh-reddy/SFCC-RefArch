'use strict';

/**
 * Seller Central: shows the field errors of the last POST next to their fields, the way base
 * SFRA forms do (is-invalid + invalid-feedback). Keys are form htmlNames or helper field names.
 */

$(document).ready(function () {
    var fields = $('.seller-flash').data('fields') || {};
    Object.keys(fields).forEach(function (key) {
        var name = key.split('.').pop();
        var $input = $('[name="' + key + '"], [name$="_' + name + '"]').filter('input, select, textarea').first();
        if (!$input.length) return;
        var errorId = ($input.attr('id') || name) + '-error';
        $input.addClass('is-invalid').attr({
            'aria-invalid': 'true',
            'aria-describedby': [$input.attr('aria-describedby'), errorId].filter(Boolean).join(' ')
        });
        $('<div class="invalid-feedback"></div>').attr('id', errorId).text(fields[key]).insertAfter($input);
    });
});
