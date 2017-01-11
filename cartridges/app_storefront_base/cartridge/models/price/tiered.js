'use strict';

var dwHelpers = require('../../scripts/dwHelpers');
var priceHelper = require('../../scripts/helpers/pricing');


/**
 * @constructor
 * @classdesc Tiered price class
 * @param {dw.catalog.ProductPriceTable} priceTable - Product price table
 * @param {boolean} isProductTile - Flag as to whether this price is for a product tile
 */
function TieredPrice(priceTable, isProductTile) {
    var startingFromPrice = null;

    this.type = 'tiered';
    this.isProductTile = isProductTile;

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

    this.min = startingFromPrice;
}

module.exports = TieredPrice;
