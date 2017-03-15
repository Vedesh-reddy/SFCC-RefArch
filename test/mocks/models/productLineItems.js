'use strict';

var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

function ProxyModel(){
	return proxyquire('../../../cartridges/app_storefront_base/cartridge/models/productLineItems', {
		'~/cartridge/scripts/dwHelpers':{},
        '../scripts/factories/product': { get: function () { return 'productLineItem'; } }
	});
}

module.exports = ProxyModel();