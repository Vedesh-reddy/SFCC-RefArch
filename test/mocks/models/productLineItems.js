'use strict';

var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var dwHelpers = require('../dwHelpers');

function proxyModel() {
    return proxyquire('../../../cartridges/app_storefront_base/cartridge/models/productLineItems', {
        '~/cartridge/scripts/dwHelpers': dwHelpers,
        '../scripts/factories/product': { get: function () { return 'productLineItem'; } }
    });
}

module.exports = proxyModel();
