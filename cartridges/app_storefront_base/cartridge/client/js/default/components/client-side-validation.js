'use strict';

/**
 * Validate whole form. Requires `this` to be set to form object
 * @param {jQuery.event} event - Event to be canceled if form is invalid.
 * @returns {boolean} - Flag to indicate if form is valid
 */
function validateForm(event) {
    $(this).find('.form-group.has-danger').removeClass('has-danger');
    var valid = true;
    if (this.checkValidity && !this.checkValidity()) {
        // safari
        valid = false;
        if (event) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        }
        $(this).find('input, select').each(function () {
            if (!this.validity.valid) {
                $(this).trigger('invalid', this.validity);
            }
        });
    }
    return valid;
}

/**
 * Remove all validation. Should be called every time before revalidating form
 * @param {element} form - Form to be cleared
 * @returns {void}
 */
function clearForm(form) {
    $(form)
        .find('.form-group.has-danger')
        .removeClass('has-danger')
        .find('.form-control-feedback')
        .text('');
}

module.exports = {
    invalid: function () {
        $('form input, form select').on('invalid', function (e) {
            e.preventDefault();
            this.setCustomValidity('');
            if (!this.validity.valid) {
                var validationMessage = this.validationMessage;
                $(this).parents('.form-group').addClass('has-danger');
                if (this.validity.patternMismatch && $(this).data('pattern-mismatch')) {
                    validationMessage = $(this).data('pattern-mismatch');
                }
                if ((this.validity.rangeOverflow || this.validity.rangeUnderflow)
                    && $(this).data('range-error')) {
                    validationMessage = $(this).data('range-error');
                }
                if ((this.validity.tooLong || this.validity.tooShort)
                    && $(this).data('range-error')) {
                    validationMessage = $(this).data('range-error');
                }
                if (this.validity.valueMissing && $(this).data('missing-error')) {
                    validationMessage = $(this).data('missing-error');
                }
                $(this).parents('.form-group').children('.form-control-feedback')
                    .text(validationMessage);
            }
        });
    },

    submit: function () {
        $('form').on('submit', function (e) {
            return validateForm.call(this, e);
        });
    },

    buttonClick: function () {
        $('form button[type="submit"], form input[type="submit"]').on('click', function () {
            // clear all errors when trying to submit the form
            clearForm($(this).parents('form'));
        });
    },

    functions: {
        validateForm: function (form, event) {
            validateForm.call($(form), event || null);
        },
        clearForm: clearForm
    }
};
