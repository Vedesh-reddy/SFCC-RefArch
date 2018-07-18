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
            },
            'dw/campaign/PromotionMgr': {
                activeCustomerPromotions: {
                    getProductPromotions: function () { return 'promotions'; }
                }
            }
        });

    var productMock = {};
    var setSelectedAttributeValueSpy = sinon.spy();
    beforeEach(function () {
        productMock.variationModel = {
            master: false,
            selectedVariant: false,
            productVariationAttributes: [{
                ID: 'color',
                displayName: 'Color'
            }],
            getAllValues: function () {
                return [{
                    value: 'blue',
                    ID: 'blue'
                }];
            },
            setSelectedAttributeValue: setSelectedAttributeValueSpy,
            getSelectedVariant: function () {}
        };
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

    var optionProductLineItemsMock = [
        {
            optionID: 'optionId1',
            optionValueID: 'selectedValueId1',
            productName: 'productName1'
        },
        {
            optionID: 'optionId2',
            optionValueID: 'selectedValueId2',
            productName: 'productName2'
        }
    ];

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

    describe('getProductType() function', function () {
        beforeEach(function () {
            productMock = {};
        });
        it('should return type master', function () {
            productMock.master = true;
            var productType = productHelpers.getProductType(productMock);
            assert.equal(productType, 'master');
        });
        it('should return type variant', function () {
            productMock.variant = true;
            var productType = productHelpers.getProductType(productMock);
            assert.equal(productType, 'variant');
        });
        it('should return type standard product', function () {
            var productType = productHelpers.getProductType(productMock);
            assert.equal(productType, 'standard');
        });
    });

    describe('getVariationModel() function', function () {
        it('should return null', function () {
            var vModel = productHelpers.getVariationModel(productMock);
            assert.equal(vModel, null);
        });
        it('should return same variationModel Instance', function () {
            productMock.variationModel.master = true;
            productMock.variationModel.selectedVariant = true;
            var vModel = productHelpers.getVariationModel(productMock);
            assert.deepEqual(vModel, productMock.variationModel);
        });
        it('should call setSelectedAttributeValue function', function () {
            productMock.variationModel.master = true;
            productMock.variationModel.selectedVariant = true;
            var productVariablesMock = {
                color: {
                    value: 'blue'
                }
            };
            productHelpers.getVariationModel(productMock, productVariablesMock);
            assert.isTrue(setSelectedAttributeValueSpy.calledWith('color', 'blue'));
        });
    });

    describe('getConfig function', function () {
        var params = {};
        beforeEach(function () {
            productMock.variationModel.master = true;
            productMock.master = true;
            productMock.optionModel = {
                options: 'someoption'
            };
            var productVariablesMock = {
                color: {
                    value: 'blue'
                }
            };
            params.variables = productVariablesMock;
            params.options = [];
            params.quantity = 1;
        });

        it('should return config object', function () {
            var config = productHelpers.getConfig(productMock, params);
            var expectedConfig = {
                variationModel: productMock.variationModel,
                options: params.options,
                optionModel: productMock.optionModel,
                promotions: 'promotions',
                quantity: params.quantity,
                variables: params.variables,
                apiProduct: productMock,
                productType: 'master'
            };
            assert.deepEqual(config, expectedConfig);
        });
    });

    describe('getLineItemOptions function', function () {
        var productIdMock = 'someProductId';
        it('should return lineItemOptions object', function () {
            var options = productHelpers.getLineItemOptions(optionProductLineItemsMock, productIdMock);
            var expectedOptions = [
                {
                    productId: 'someProductId',
                    optionId: 'optionId1',
                    selectedValueId: 'selectedValueId1'
                },
                {
                    productId: 'someProductId',
                    optionId: 'optionId2',
                    selectedValueId: 'selectedValueId2'
                }
            ];
            assert.deepEqual(options, expectedOptions);
        });
    });

    describe('getDefaultOptions function', function () {
        var optionsMock = [
            {
                displayName: 'displayName1'
            },
            {
                displayName: 'displayName2'
            }
        ];
        it('should return defaultOption object', function () {
            var options = productHelpers.getDefaultOptions(optionModelMock, optionsMock);
            var expectedOptions = [
                'displayName1: Value 1', 'displayName2: Value 1'
            ];
            assert.deepEqual(options, expectedOptions);
        });
    });

    describe('getLineItemOptionNames function', function () {
        it('should return defaultOption object', function () {
            var options = productHelpers.getLineItemOptionNames(optionProductLineItemsMock);
            var expectedOptions = [
                {
                    'displayName': 'productName1',
                    'optionId': 'optionId1',
                    'selectedValueId': 'selectedValueId1'
                },
                {
                    'displayName': 'productName2',
                    'optionId': 'optionId2',
                    'selectedValueId': 'selectedValueId2'
                }
            ];
            assert.deepEqual(options, expectedOptions);
        });
    });
});
