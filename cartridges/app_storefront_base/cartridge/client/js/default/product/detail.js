'use strict';
var base = require('./base');

module.exports = {
    selectAttributes: function () {
        $('select[class*="select-"]').on('change', function (e) {
            e.preventDefault();
            var selectedValueUrl = base.getSelectedValueUrl(e.currentTarget.value, $(this));
            base.attributeSelect(selectedValueUrl);
        });
    },

    colorAttribute: function () {
        $('[data-attr="color"] a').on('click', function (e) {
            e.preventDefault();
            var selectedValueUrl = base.getSelectedValueUrl(e.currentTarget.href, $(this));
            base.attributeSelect(selectedValueUrl);
        });
    },

    addToCart: function () {
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
    },

    availibility: function () {
        $('.quantity select').on('change', function (e) {
            e.preventDefault();
            var pid = $('.product-id').text();
            var quantity = $('.quantity select').val();
            var params = ['pid=' + pid, 'quantity=' + quantity].join('&');
            var url = $('.quantity select').data('action') + '?' + params;

            base.attributeSelect(url);
        });
    },

    UpdateAttributesAndDetails: function () {
        $('body').on('product:statusUpdate', function (e, data) {
            $('.description-and-detail .product-attributes').empty().html(data.attributesHtml);

            if (data.shortDescription) {
                $('.description-and-detail .description').removeClass('hidden-xl-down');
                $('.description-and-detail .description .content')
                    .empty()
                    .html(data.shortDescription);
            } else {
                $('.description-and-detail .description').addClass('hidden-xl-down');
            }

            if (data.longDescription) {
                $('.description-and-detail .details').removeClass('hidden-xl-down');
                $('.description-and-detail .details .content').empty().html(data.longDescription);
            } else {
                $('.description-and-detail .details').addClass('hidden-xl-down');
            }
        });
    }
};
