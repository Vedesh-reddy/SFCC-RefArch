'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var sinon = require('sinon');
var mockDwHelpers = require('../../../../mocks/dwHelpers');


describe('priceFactory', function () {
    var price;
    var product;

    var mockDefaultPrice = sinon.spy();
    var mockRangePrice = sinon.stub();
    var mockTieredPrice = sinon.spy();
    var mockGetProductPromotions = sinon.stub();
    mockGetProductPromotions.returns([]);

    var PROMOTION_CLASS_PRODUCT = 'awesome promotion';

    var priceFactory = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/factories/price.js', {
        'dw/value/Money': { NOT_AVAILABLE: null },
        '../dwHelpers': {
            find: mockDwHelpers.find
        },
        '../helpers/pricing': {
            getRootPriceBook: function () { return { ID: '123' }; }
        },
        'dw/campaign/PromotionMgr': {
            activeCustomerPromotions: {
                getProductPromotions: mockGetProductPromotions
            }
        },
        '../../models/price/default': mockDefaultPrice,
        '../../models/price/range': mockRangePrice,
        '../../models/price/tiered': mockTieredPrice,
        'dw/campaign/Promotion': {
            PROMOTION_CLASS_PRODUCT: PROMOTION_CLASS_PRODUCT
        }
    });

    describe('Tiered Price', function () {
        var priceTable;

        afterEach(function () {
            mockTieredPrice.reset();
        });

        it('should produce a tiered price if price tables have more than 1 quantity', function () {
            priceTable = { quantities: { length: 3 } };
            product = {
                getPriceModel: function () {
                    return {
                        getPriceTable: function () { return priceTable; }
                    };
                }
            };
            price = priceFactory.getPrice(product);
            assert.isTrue(mockTieredPrice.calledWithNew());
        });

        it('should not produce a tiered price if a price table has only 1 quantity', function () {
            priceTable = { quantities: { length: 1 } };
            product = {
                master: false,
                priceModel: {
                    priceRange: false,
                    price: {
                        valueOrNull: null
                    },
                    minPrice: '$5',
                    getPriceTable: function () {
                        return priceTable;
                    }
                },
                getPriceModel: function () {
                    return this.priceModel;
                },
                variationModel: {
                    variants: [{}, {}]
                }
            };
            price = priceFactory.getPrice(product);
            assert.isFalse(mockTieredPrice.calledWithNew());
        });
    });

    describe('Range Price', function () {
        beforeEach(function () {
            product = {
                master: true,
                priceModel: {
                    price: { valueOrNull: 'value' },
                    priceInfo: { priceBook: {} },
                    priceRange: true,
                    getPriceTable: function () {
                        return {
                            quantities: { length: 1 }
                        };
                    },
                    getPriceBookPrice: function () {
                        return { available: true };
                    }
                },
                getPriceModel: function () {
                    return this.priceModel;
                },
                variationModel: {
                    variants: [{}, {}]
                }
            };
        });

        afterEach(function () {
            mockRangePrice.reset();
        });

        it('should produce a range price', function () {
            var expectedRangePrice = {
                min: { value: 3 },
                max: { value: 7 }
            };
            mockRangePrice.returns(expectedRangePrice);
            price = priceFactory.getPrice(product);
            assert.equal(price, expectedRangePrice);
        });

        it('should not produce a range price if min and max values are equal', function () {
            var rangePrice = {
                min: { value: 3 },
                max: { value: 3 }
            };
            mockRangePrice.returns(rangePrice);
            product.variationModel = { variants: [] };

            price = priceFactory.getPrice(product);
            assert.notEqual(price, rangePrice);
        });
    });

    describe('Default Price', function () {
        var priceModel = {};
        var variantPriceModel = {};

        beforeEach(function () {

        });

        afterEach(function () {
            mockDefaultPrice.reset();
        });

        it('should use the first variant if product is a master', function () {
            var expectedPrice = { available: true };
            priceModel = {
                price: { valueOrNull: 'value' },
                priceInfo: { priceBook: {} },
                priceRange: false,
                getPriceTable: function () {
                    return {
                        quantities: { length: 1 }
                    };
                },
                getPriceBookPrice: function () { return expectedPrice; }
            };
            variantPriceModel = {
                price: { valueOrNull: null },
                priceInfo: { priceBook: {} },
                priceRange: false,
                minPrice: '$8',
                getPriceTable: function () {
                    return {
                        quantities: { length: 1 }
                    };
                },
                getPriceBookPrice: function () { return expectedPrice; }
            };
            product = {
                master: true,
                priceModel: priceModel,
                getPriceModel: function () { return priceModel; },
                variationModel: {
                    variants: [{ priceModel: variantPriceModel }, {}]
                }
            };
            price = priceFactory.getPrice(product);
            assert.isTrue(mockDefaultPrice.calledWith(variantPriceModel.minPrice));
        });

        it('should assign list price to root pricebook price when available', function () {
            var expectedPrice = { available: true };
            product = {
                master: false,
                priceModel: {
                    price: { valueOrNull: 'value' },
                    priceInfo: { priceBook: {} },
                    priceRange: false,
                    getPriceTable: function () {
                        return {
                            quantities: { length: 1 }
                        };
                    },
                    getPriceBookPrice: function () { return expectedPrice; }
                },
                getPriceModel: function () { return this.priceModel; },
                variationModel: {
                    variants: [{}, {}]
                }
            };
            price = priceFactory.getPrice(product);
            assert.isTrue(mockDefaultPrice.calledWith(expectedPrice));
        });

        it('should assign list price to priceModel price when root pricebook price not available', function () {
            var expectedPrice = { available: false };
            product = {
                master: false,
                priceModel: {
                    price: {
                        available: true,
                        valueOrNull: 'value'
                    },
                    priceInfo: { priceBook: {} },
                    priceRange: false,
                    getPriceTable: function () {
                        return {
                            quantities: { length: 1 }
                        };
                    },
                    getPriceBookPrice: function () { return expectedPrice; }
                },
                getPriceModel: function () { return this.priceModel; }
            };
            price = priceFactory.getPrice(product);
            assert.isTrue(mockDefaultPrice.calledWith(product.priceModel.price));
        });

        it('should assign list price to priceModel minPrice when root pricebook and priceModel price not available', function () {
            var expectedPrice = { available: false };
            product = {
                master: false,
                priceModel: {
                    price: {
                        available: false,
                        valueOrNull: 'value'
                    },
                    minPrice: '$3',
                    priceInfo: { priceBook: {} },
                    priceRange: false,
                    getPriceTable: function () {
                        return {
                            quantities: { length: 1 }
                        };
                    },
                    getPriceBookPrice: function () { return expectedPrice; }
                },
                getPriceModel: function () { return this.priceModel; }
            };
            price = priceFactory.getPrice(product);
            assert.isTrue(mockDefaultPrice.calledWith(product.priceModel.minPrice));
        });

        describe('with promotional prices', function () {
            var listPrice = { available: true };
            var salesPrice = { valueOrNull: 'value' };
            var promotionalPrice = '$1';
            var promotions = [{
                promotionClass: {
                    equals: function () { return true; }
                },
                getPromotionalPrice: function () {
                    return promotionalPrice;
                }
            }];

            beforeEach(function () {
                mockGetProductPromotions.returns(promotions);
            });

            afterEach(function () {
                mockDefaultPrice.reset();
            });

            it('should get a promotional price when an option product is provided', function () {
                product = {
                    master: false,
                    priceModel: {
                        price: salesPrice,
                        priceInfo: { priceBook: {} },
                        getPriceTable: function () {
                            return {
                                quantities: { length: 1 }
                            };
                        },
                        getPriceBookPrice: function () { return listPrice; }
                    },
                    getPriceModel: function () { return this.priceModel; }
                };
                price = priceFactory.getPrice(product, null, null, true);
                assert.isTrue(mockDefaultPrice.calledWith(listPrice, salesPrice, promotionalPrice));
            });

            it('should get a promotional price when an option product is not provided', function () {
                product = {
                    master: false,
                    priceModel: {
                        price: salesPrice,
                        priceInfo: { priceBook: {} },
                        getPriceTable: function () {
                            return {
                                quantities: { length: 1 }
                            };
                        },
                        getPriceBookPrice: function () { return listPrice; }
                    },
                    getPriceModel: function () { return this.priceModel; }
                };
                price = priceFactory.getPrice(product, null, null, false);
                assert.isTrue(mockDefaultPrice.calledWith(listPrice, salesPrice, promotionalPrice));
            });
        });
    });
});
