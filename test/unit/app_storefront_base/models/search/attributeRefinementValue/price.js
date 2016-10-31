'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();


describe('PriceAttributeValue model', function () {
    var productSearch = {};
    var refinementDefinition = {};
    var refinementValue = {};
    var priceAttributeValue = {};

    var PriceAttributeValue = proxyquire('../../../../../../app_storefront_base/cartridge/models/search/attributeRefinementValue/price', {
        '~/cartridge/models/search/attributeRefinementValue/base': proxyquire(
            '../../../../../../app_storefront_base/cartridge/models/search/attributeRefinementValue/base', {
                'dw/web/Resource': {
                    msgf: function () { return 'some product title'; }
                }
            }
        ),
        'dw/web/Resource': {
            msg: function () { return 'some display value'; }
        }
    });

    it('should instantiate a Price Attribute Value model', function () {
        productSearch = {
            isRefinedByPriceRange: function () { return true; },
            urlRelaxPrice: function () { return 'relax url'; }
        };
        refinementValue = {
            ID: 'product 1',
            presentationID: 'prez',
            value: 'some value',
            displayValue: 'some display value',
            hitCount: 10
        };
        priceAttributeValue = new PriceAttributeValue(productSearch, refinementDefinition, refinementValue);

        assert.deepEqual(priceAttributeValue, {
            displayValue: 'some display value',
            selected: true,
            title: 'some product title',
            url: 'relax url'
        });
    });
});
