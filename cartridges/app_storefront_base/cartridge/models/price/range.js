'use strict';

var pricingHelper = require('../../scripts/helpers/pricing');


/**
 * @constructor
 * @classdesc Range price class
 * @param {dw.value.Money} min - Range minimum price
 * @param {dw.value.Money} max - Range maximum price
 */
function RangePrice(min, max) {
    this.type = 'range';
    this.min = pricingHelper.toPriceModel(min);
    this.max = pricingHelper.toPriceModel(max);
    this.html = pricingHelper.renderHtml(pricingHelper.getHtmlContext({
        type: this.type,
        min: this.min,
        max: this.max
    }));
}

module.exports = RangePrice;
