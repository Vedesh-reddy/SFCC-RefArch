'use strict';

var shippingHelpers = require('./shipping');

/**
* Submits an Ajaxified form submit for pickup in store feature
* @param {element} form - Form DOM node
*/
function submitStoresInventoryRequest(form) {
    var $form = $(form);
    var url = $form.attr('action');
    var queryString = $form.serialize();

    $.getJSON(url + '?' + queryString)
        .then(function (body) {
            $.spinner().stop();
            if (!body.availableStores || body.availableStores.length === 0) {
                $('.store-locator-no-results').show();
                $('.results').empty().hide();
            } else {
                $('.store-locator-no-results').hide();
                $('.results').empty();
                body.availableStores.forEach(function (store, i) {
                    var $el = $('#pickup-instore-template').clone();
                    var $radio = $el.find('input');
                    $el.attr('id', 'store-' + i);
                    var addressLine = [
                        store.address1,
                        store.address2,
                        store.city,
                        store.stateCode,
                        store.postalCode
                    ].join(' ');
                    $radio.data('store', store);
                    $radio.val(store.name);

                    $el.find('.store-name').html(store.name);
                    $el.find('.store-address').html(addressLine);
                    $el.find('.store-hours').html(store.storeHours);
                    $el.show();
                    $('.results').append($el);
                });
                $('.results').show();
            }
        }).fail(function () {
            $.spinner().stop();
        });
}

module.exports = {
    methods: {
        submitStoresInventoryRequest: submitStoresInventoryRequest
    },

    storeLocatorSearch: function () {
        $('.btn-storelocator-search').on('click', function (evt) {
            evt.preventDefault();
            var $el = $(this);
            var form = $el.parents('form')[0];
            $.spinner().start();
            submitStoresInventoryRequest(form);
        });
    },

    detectLocation: function () {
        // Handle Pick Up In Store detect
        $('.detect-location').on('click', function (evt) {
            evt.preventDefault();
            var $el = $(this);

            $.spinner().start();
            if (!navigator.geolocation) {
                $.spinner().stop();
                return;
            }

            navigator.geolocation.getCurrentPosition(function (position) {
                var form = $el.parents('form')[0];
                $('input[name=lat]', form).val(position.coords.latitude);
                $('input[name=long]', form).val(position.coords.longitude);
                $('input[name=postalCode]', form).val('');
                submitStoresInventoryRequest(form);
            });
        });
    },

    selectRadius: function () {
        $('#pick-up-in-store .radius').on('change', function () {
            var $el = $(this);
            var form = $el.parents('form')[0];
            $.spinner().start();
            submitStoresInventoryRequest(form);
        });
    },

    selectPickUpInStore: function () {
        $('.pick-up-in-store-tab').on('click', function () {
            $('.nav-tabs.single-shipping').data('shipping-tab-active', false);
            var url = $('.shipping-method-list').data('select-shipping-method-url');
            shippingHelpers.methods.selectShippingMethodAjax(url, { methodID: '005' });
        });
    }
};
