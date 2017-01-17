'use strict';

var dwHelpers = require('../../scripts/dwHelpers');
var priceHelper = require('../../scripts/helpers/pricing');


/**
 * @constructor
 * @classdesc Tiered price class
 * @param {dw.catalog.ProductPriceTable} priceTable - Product price table
 * @param {boolean} useSimplePrice - Flag as to whether this price is for a product tile
 */
function TieredPrice(priceTable, useSimplePrice) {
    var startingFromPrice = null;

    this.type = 'tiered';
    this.useSimplePrice = useSimplePrice || false;

    this.tiers = dwHelpers.map(priceTable.getQuantities(), function (quantity) {
        var price = priceHelper.toPriceModel(priceTable.getPrice(quantity));

        if (!startingFromPrice) {
            startingFromPrice = price;
        }

        return {
            quantity: quantity.getValue(),
            price: price
        };
    }, this);

    this.startingFromPrice = startingFromPrice;
}

module.exports = TieredPrice;
