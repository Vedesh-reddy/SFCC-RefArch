'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var mockDwHelpers = require('../../../../../mocks/dwHelpers');
var mockPriceRefinementValue = sinon.spy();
var mockColorRefinementValue = sinon.spy();
var mockSizeRefinementValue = sinon.spy();
var mockBooleanRefinementValue = sinon.spy();
var mockCategoryRefinementValue = sinon.spy();

var main = proxyquire('../../../../../../cartridges/app_storefront_base/cartridge/scripts/factories/searchRefinements/main', {
    '~/cartridge/scripts/dwHelpers': mockDwHelpers,
    '~/cartridge/models/search/attributeRefinementValue/price': mockPriceRefinementValue,
    '~/cartridge/models/search/attributeRefinementValue/color': mockColorRefinementValue,
    '~/cartridge/models/search/attributeRefinementValue/size': mockSizeRefinementValue,
    '~/cartridge/models/search/attributeRefinementValue/boolean': mockBooleanRefinementValue,
    '~/cartridge/models/search/attributeRefinementValue/category': mockCategoryRefinementValue
});


describe('Search Refinements Factory main script', function () {
    var productSearch = {};

    it('should retrieve price refinements ', function () {
        var refinementDefinition = {
            priceRefinement: true
        };
        var refinementValues = [{}];

        main.get(productSearch, refinementDefinition, refinementValues);

        assert.isTrue(mockPriceRefinementValue.calledWithNew());
    });

    it('should retrieve color refinements ', function () {
        var refinementDefinition = {
            attributeID: 'refinementColor'
        };
        var refinementValues = [{}];

        main.get(productSearch, refinementDefinition, refinementValues);

        assert.isTrue(mockColorRefinementValue.calledWithNew());
    });

    it('should retrieve size refinements ', function () {
        var refinementDefinition = {
            attributeID: 'size'
        };
        var refinementValues = [{}];

        main.get(productSearch, refinementDefinition, refinementValues);

        assert.isTrue(mockSizeRefinementValue.calledWithNew());
    });

    it('should retrieve boolean refinements ', function () {
        var refinementDefinition = {};
        var refinementValues = [{}];

        main.get(productSearch, refinementDefinition, refinementValues);

        assert.isTrue(mockBooleanRefinementValue.calledWithNew());
    });
});
