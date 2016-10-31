'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();


describe('BaseAttributeValue model', function () {
    var productSearch = {};
    var refinementDefinition = {};
    var refinementValue = {};
    var baseAttributeValue = {};

    var BaseAttributeValue = proxyquire('../../../../../../app_storefront_base/cartridge/models/search/attributeRefinementValue/base', {
        'dw/web/Resource': {
            msgf: function () { return 'some product title'; }
        }
    });

    it('should instantiate a Base Attribute Value model', function () {
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
        baseAttributeValue = new BaseAttributeValue(productSearch, refinementDefinition, refinementValue);

        assert.deepEqual(baseAttributeValue, {
            actionEndpoint: 'Search-Show',
            hitCount: 10,
            id: 'product 1',
            presentationId: 'prez',
            productSearch: productSearch,
            refinementDefinition: refinementDefinition,
            refinementValue: refinementValue,
            selectable: true,
            value: 'some value',
            '__proto__': BaseAttributeValue.prototype
        });
    });
});
