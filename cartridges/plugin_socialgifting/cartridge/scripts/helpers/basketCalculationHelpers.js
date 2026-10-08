'use strict';

var base = module.superModule;
module.exports = Object.assign({}, base, {
    calculateTotals: function (basket) {
        if (basket.custom.sgContributionKey) require('./contributionCheckoutHelper').calculate(basket);
        else base.calculateTotals(basket);
    }
});
