'use strict';

module.exports = function () {
    $('body').on('change', '.order-history-select', function (e) {
        var $ordersContainer = $('.orders-container');
        $ordersContainer.empty();
        $ordersContainer.spinner().start();
        $.ajax({
            url: e.currentTarget.value,
            method: 'GET',
            success: function (data) {
                $ordersContainer.html(data);
                $.spinner().stop();
            },
            error: function () {
                $.spinner().stop();
            }
        });
    });
};
