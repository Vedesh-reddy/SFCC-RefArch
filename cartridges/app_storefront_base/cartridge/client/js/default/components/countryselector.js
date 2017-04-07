'use strict';

module.exports = function () {
    $('.country-selector a').click(function (e) {
        e.preventDefault();
        var action = $('.page').data('action');
        var localeCode = $(this).data('locale');
        var localeCurrencyCode = $(this).data('currencycode');
        var queryString = $('.page').data('querystring');
        var url = $('.country-selector').data('url');

        $.ajax({
            url: url,
            type: 'get',
            dataType: 'json',
            data: {
                code: localeCode,
                queryString: queryString,
                CurrencyCode: localeCurrencyCode,
                action: action
            },
            success: function (response) {
                $.spinner().stop();
                if (response && response.redirectUrl) {
                    window.location.href = response.redirectUrl;
                }
            },
            error: function () {
                $.spinner().stop();
            }
        });
    });
};
