'use strict';
var base = require('./base');

module.exports = function () {
    $('select[class^="select-"]').on('change', function (e) {
        e.preventDefault();
        var selectedValueUrl = base.getSelectedValueUrl(e.currentTarget.value, $(this));

        if (selectedValueUrl) {
            $.ajax({
                url: selectedValueUrl,
                method: 'GET',
                success: function (data) {
                    base.parseJsonResponse(data, 'details');
                }
            });
        }
    });

    $('[data-attr="color"] a').on('click', function (e) {
        e.preventDefault();
        var selectedValueUrl = base.getSelectedValueUrl(e.currentTarget.href, $(this));

        $.ajax({
            url: selectedValueUrl,
            method: 'GET',
            success: function (data) {
                base.parseJsonResponse(data, 'details');
            }
        });
    });

    $('button.add-to-cart').on('click', function () {
        var pid = $('.product-id').text();
        var addToCartUrl = base.getAddToCartUrl(pid);

        if (addToCartUrl) {
            $.ajax({
                url: addToCartUrl,
                method: 'POST',
                success: base.handlePostCartAdd
            });
        }
    });
};
