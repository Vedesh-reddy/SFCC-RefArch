'use strict';

module.exports = function () {
    $('.mini-cart').on('count:update', function (event, count) {
        if (count && $.isNumeric(count.quantityTotal)) {
            $('.mini-cart .minicart-quantity').text(count.quantityTotal);
        }
    });
};
