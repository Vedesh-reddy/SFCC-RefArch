'use strict';

module.exports = function (formElement, payload) {
    // clear form validation first
    $('.form-group.has-danger', formElement).removeClass('has-danger');
    $('.alert', formElement).remove();

    if (typeof payload === 'object' && payload.fields) {
        Object.keys(payload.fields).forEach(function (key) {
            if (payload.fields[key]) {
                var feedbackElement = $(formElement).find('[name="' + key + '"]')
                    .parent()
                    .children('.form-control-feedback');

                if (feedbackElement.length > 0) {
                    if (Array.isArray(payload[key])) {
                        feedbackElement.html(payload.fields[key].join('<br/>'));
                    } else {
                        feedbackElement.html(payload.fields[key]);
                    }
                    feedbackElement.parents('.form-group').addClass('has-danger');
                }
            }
        });
    }
    if (payload && payload.error) {
        var form = $(formElement).prop('tagName') === 'FORM'
            ? $(formElement)
            : $(formElement).parents('form');

        form.prepend('<div class="alert alert-danger">'
            + payload.error.join('<br/>') + '</div>');
    }
};
