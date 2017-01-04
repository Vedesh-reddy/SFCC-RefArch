'use strict';

module.exports = function () {
    var url;
    $('.remove-payment').on('click', function (e) {
        e.preventDefault();
        url = $(this).data('url') + '?UUID=' + $(this).data('id');
        $('.payment-to-remove').empty().append($(this).data('card'));

        $('.delete-confirmation-btn').click(function (f) {
            f.preventDefault();
            $.ajax({
                url: url,
                type: 'get',
                dataType: 'json',
                success: function (data) {
                    $('#uuid-' + data.UUID).remove();
                    if (data.message) {
                        var toInsert = '<div><h3>' +
                        data.message +
                        '</h3><div>';
                        $('.paymentInstruments').after(toInsert);
                    }
                }
            });
        });
    });
};
