'use strict';

function Money() {
    return {
        available: true,
        getDecimalValue: function () { return '10.99'; },
        getCurrencyCode: function () { return 'USD'; }
    };
}

module.exports = Money;
