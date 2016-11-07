'use strict';

module.exports = function () {
    var url;
    var isDefault;
    $('.remove-address').on('click', function (e) {
        e.preventDefault();
        isDefault = $(this).data('default');
        if (isDefault) {
            url = $(this).data('url')
                + '?addressId='
                + $(this).data('id')
                + '&isDefault='
                + isDefault;
        } else {
            url = $(this).data('url') + '?addressId=' + $(this).data('id');
        }
        $('.product-to-remove').empty().append($(this).data('id'));

        $('.delete-confirmation-btn').click(function (f) {
            f.preventDefault();
            $.ajax({
                url: url,
                type: 'get',
                dataType: 'json',
                success: function (data) {
                    $('#uuid-' + data.UUID).remove();
                    if (isDefault) {
                        var addressId = $('.card .address-heading').first().text();
                        var addressHeading = addressId + ' (' + data.defaultMsg + ')';
                        $('.card .address-heading').first().text(addressHeading);
                        $('.card .card-make-default-link').first().remove();
                        $('.remove-address').data('default', true);
                        if (data.message) {
                            var toInsert = '<div><h3>' +
                            data.message +
                            '</h3><div>';
                            $('.addressList').after(toInsert);
                        }
                    }
                }
            });
        });
    });
};
