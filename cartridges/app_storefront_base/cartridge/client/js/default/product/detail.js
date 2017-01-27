'use strict';
var base = require('./base');

module.exports = function () {
    $('select[class*="select-"]').on('change', function (e) {
        e.preventDefault();
        var selectedValueUrl = base.getSelectedValueUrl(e.currentTarget.value, $(this));

        if (selectedValueUrl) {
            $.spinner().start();
            $.ajax({
                url: selectedValueUrl,
                method: 'GET',
                success: function (data) {
                    base.parseJsonResponse(data, 'details');
                    $.spinner().stop();
                },
                error: function () {
                    $.spinner().stop();
                }
            });
        }
    });

    $('[data-attr="color"] a').on('click', function (e) {
        e.preventDefault();
        var selectedValueUrl = base.getSelectedValueUrl(e.currentTarget.href, $(this));

        $.spinner().start();
        $.ajax({
            url: selectedValueUrl,
            method: 'GET',
            success: function (data) {
                base.parseJsonResponse(data, 'details');
                $.spinner().stop();
            },
            error: function () {
                $.spinner().stop();
            }
        });
    });

    $('button.add-to-cart').on('click', function () {
        var pid = $('.product-id').text();
        var addToCartUrl = base.getAddToCartUrl(pid);

        if (addToCartUrl) {
            $.spinner().start();
            $.ajax({
                url: addToCartUrl,
                method: 'POST',
                success: function (data) {
                    base.handlePostCartAdd(data);
                    $.spinner().stop();
                },
                error: function () {
                    $.spinner().stop();
                }
            });
        }
    });
};
