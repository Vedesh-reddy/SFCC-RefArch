'use strict';

module.exports = function () {
    var url;
    $('#email-form').submit(function (e) {
        e.preventDefault();
        url = $('#password-reset').attr('href');
        $('#reset-password-email')
            .parents('.form-group')
            .removeClass('has-danger');
        $('.form-control-feedback').empty();
        $.ajax({
            url: url,
            type: 'post',
            dataType: 'json',
            data: $('#email-form').serialize(),
            success: function (data) {
                var receivedMsgHeading;
                var receivedMsgBody;
                var buttonText;
                var bodyHtml;
                if (data.validationError) {
                    $('#reset-password-email')
                        .parents('.form-group')
                        .addClass('has-danger');
                    $('.form-control-feedback').html(data.errorMsg);
                } else {
                    receivedMsgHeading = data.receivedMsgHeading;
                    receivedMsgBody = data.receivedMsgBody;
                    buttonText = data.buttonText;
                    bodyHtml = '<p>' + receivedMsgBody + '</p>';
                    $('.modal-title').text(receivedMsgHeading);
                    $('.modal-body').empty().append(bodyHtml);
                    $('#modalButton').text(buttonText).attr('data-dismiss', 'modal');
                }
            }
        });
        return false;
    });
};
