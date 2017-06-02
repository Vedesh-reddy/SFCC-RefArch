'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var sinon = require('sinon');

var mockCollections = require('../../../../mocks/util/collections');

describe('Helpers - Product', function () {
    var productHelpers = proxyquire(
        '../../../../../cartridges/app_storefront_base/cartridge/scripts/helpers/productHelpers', {
            '*/cartridge/scripts/util/collections': mockCollections,
            '*/cartridge/scripts/helpers/urlHelpers': {
                appendQueryParams: function () { return 'some url'; }
            }
        });

    var optionValue1Mock = {
        ID: 'value1',
        displayValue: 'Value 1'
    };
    var optionValue2Mock = {
        ID: 'value2',
        displayValue: 'Value 2'
    };
    var optionValuesMock = [optionValue1Mock, optionValue2Mock];
    var option1Mock = {
        ID: 'option1',
        displayName: 'Option 1',
        htmlName: 'Option 1 html',
        optionValues: []
    };

    var selectedOptionMock = {
        optionId: option1Mock.ID,
        selectedValueId: optionValue1Mock.ID
    };
    var selectedOptionsMock = [selectedOptionMock];

    var optionValuePrice1Mock = {
        decimalValue: 4.56,
        toFormattedString: function () { return '$4.56'; }
    };
    var optionValuePrice2Mock = {
        decimalValue: 1.23,
        toFormattedString: function () { return '$1.23'; }
    };

    var getPriceStub = sinon.stub();
    getPriceStub.onFirstCall().returns(optionValuePrice1Mock)
        .onSecondCall().returns(optionValuePrice2Mock);

    var setSelectedOptionValueStub = sinon.spy();
    var selectedValueMock = { id: 'anything' };
    var optionModelMock = {
        options: [option1Mock],
        getPrice: getPriceStub,
        getOptionValue: function () { return selectedValueMock; },
        getSelectedOptionValue: function () {
            return optionValue1Mock;
        },
        setSelectedOptionValue: setSelectedOptionValueStub,
        urlSelectOptionValue: function () {
            return {
                toString: function () { return 'some url'; }
            };
        }
    };

    describe('getCurrentOptionModel() function', function () {
        it('should set the selected option value on the product option model', function () {
            var currentOptionModel = productHelpers.getCurrentOptionModel(optionModelMock,
                selectedOptionsMock);
            assert.isTrue(setSelectedOptionValueStub.calledWith(option1Mock, selectedValueMock));
            assert.deepEqual(currentOptionModel, optionModelMock);
        });
    });

    describe('getOptions() function', function () {
        it('should return product options', function () {
            var options = productHelpers.getOptions(optionModelMock);
            var expected = [{
                id: 'option1',
                name: 'Option 1',
                htmlName: 'Option 1 html',
                values: [],
                selectedValueId: 'value1'
            }];
            assert.deepEqual(options, expected);
        });
    });

    describe('getOptionValues() function', function () {
        it('should return a product option\'s value sorted by price', function () {
            var optionValues = productHelpers.getOptionValues(optionModelMock, option1Mock,
                optionValuesMock);
            var expected = [{
                id: 'value2',
                displayValue: 'Value 2',
                price: '$1.23',
                priceValue: 1.23,
                url: 'some url'
            }, {
                id: 'value1',
                displayValue: 'Value 1',
                price: '$4.56',
                priceValue: 4.56,
                url: 'some url'
            }];
            assert.deepEqual(optionValues, expected);
        });
    });

    describe('getSelectedOptionsUrl() function', function () {
        it('should return a url', function () {
            var url = productHelpers.getSelectedOptionsUrl(optionModelMock);
            assert.equal(url, 'some url');
        });
    });
});
