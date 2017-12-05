'use strict';

var formValidation = require('../components/formValidation');

var url;
var isDefault;

module.exports = {
    removeAddress: function () {
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
                $(e.target).trigger('address:remove', f);
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
                    },
                    error: function (err) {
                        if (err.responseJSON.redirectUrl) {
                            window.location.href = err.responseJSON.redirectUrl;
                        }
                        $.spinner().stop();
                    }
                });
            });
        });
    },

    submitAddress: function () {
        $('form.address-form').submit(function (e) {
            var $form = $(this);
            e.preventDefault();
            url = $form.attr('action');
            $form.spinner().start();
            $('form.address-form').trigger('address:submit', e);
            $.ajax({
                url: url,
                type: 'post',
                dataType: 'json',
                data: $form.serialize(),
                success: function (data) {
                    $form.spinner().stop();
                    if (!data.success) {
                        formValidation($form, data);
                    } else {
                        location.href = data.redirectUrl;
                    }
                },
                error: function (err) {
                    if (err.responseJSON.redirectUrl) {
                        window.location.href = err.responseJSON.redirectUrl;
                    }
                    $form.spinner().stop();
                }
            });
            return false;
        });
    }
};
