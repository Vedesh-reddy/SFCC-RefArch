'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();


describe('BooleanAttributeValue model', function () {
    var productSearch = {};
    var refinementDefinition = {};
    var refinementValue = {};
    var booleanAttributeValue = {};

    var BooleanAttributeValue = proxyquire('../../../../../../app_storefront_base/cartridge/models/search/attributeRefinementValue/boolean', {
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

    it('should instantiate a Boolean Attribute Value model', function () {
        productSearch = {
            isRefinedByAttributeValue: function () { return true; },
            urlRelaxAttributeValue: function () { return 'relax url'; }
        };
        refinementValue = {
            ID: 'product 1',
            presentationID: 'prez',
            value: 'some value',
            displayValue: 'some display value',
            hitCount: 10
        };
        booleanAttributeValue = new BooleanAttributeValue(productSearch, refinementDefinition, refinementValue);

        assert.deepEqual(booleanAttributeValue, {
            id: 'product 1',
            type: 'boolean',
            displayValue: 'some display value',
            selected: true,
            selectable: true,
            title: 'some product title',
            url: 'relax url'
        });
    });
});
