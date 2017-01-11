'use strict';

var priceHelper = require('../../scripts/helpers/pricing');


/**
 * @constructor
 * @classdesc Default price class
 * @param {dw.value.Money} inputListPrice - List price
 * @param {dw.value.Money} inputSalesPrice - Sales price
 * @param {dw.value.Money} promotionPrice - Promotional price
 */
function DefaultPrice(inputListPrice, inputSalesPrice, promotionPrice) {
    var listPrice = inputListPrice;
    var salesPrice = inputSalesPrice;

    if (promotionPrice.available && salesPrice.compareTo(promotionPrice)) {
        listPrice = salesPrice;
        salesPrice = promotionPrice;
    }

    if (salesPrice && listPrice && salesPrice.value === listPrice.value) {
        listPrice = null;
    }

    this.type = 'default';
    this.list = listPrice ? priceHelper.toPriceModel(listPrice) : null;
    this.sales = priceHelper.toPriceModel(salesPrice);
}

module.exports = DefaultPrice;
