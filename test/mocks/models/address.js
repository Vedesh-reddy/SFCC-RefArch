'use strict';

var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

function ProxyModel(){
	return proxyquire('../../../cartridges/app_storefront_base/cartridge/models/address', {
	});
}

module.exports = ProxyModel();