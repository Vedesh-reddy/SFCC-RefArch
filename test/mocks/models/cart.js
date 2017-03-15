'use strict';

var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var TotalsModel = require('./totals');
var ProductLineItemsModel = require('./productLineItems');

function proxyModel() {
    return proxyquire('../../../cartridges/app_storefront_base/cartridge/models/cart', {
        '~/cartridge/scripts/util/collections': {
        },
        'dw/campaign/PromotionMgr': {
        },
        '~/cartridge/models/totals': TotalsModel,
        '~/cartridge/models/productLineItems': ProductLineItemsModel,
        '~/cartridge/scripts/checkout/shippingHelpers': {
        },
        '~/cartridge/scripts/dwHelpers': {},
        'dw/web/URLUtils': {},
        'dw/util/StringUtils': {
            formatMoney: function () {
                return 'formatted money';
            }
        },
        'dw/web/Resource': {
            msg: function () {
                return 'someString';
            },
            msgf: function () {
                return 'someString';
            }
        },
        'dw/system/HookMgr': function () {}
    });
}

module.exports = proxyModel();
