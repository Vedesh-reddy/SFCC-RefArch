'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var ArrayList = require('../../../../mocks/dw.util.Collection');
var toProductMock = require('../../../../util');

describe('productBase', function () {
    var ProductBase = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/models/product/productBase', {
        './productImages': function () {},
        './productAttributes': function () { return []; },
        '../../scripts/dwHelpers': proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/dwHelpers', {
            'dw/util/ArrayList': ArrayList
        }),
        '../../scripts/factories/price': { getPrice: function () {} },
        'dw/web/Resource': {
            msgf: function (params) { return params; },
            msg: function (params) { return params; }
        }
    });

    var attributeModel = {
        visibleAttributeGroups: new ArrayList([{
            ID: 'some ID',
            displayName: 'some name'
        }]),
        getVisibleAttributeDefinitions: function () {
            return new ArrayList([{
                multiValueType: false,
                displayName: 'some name'
            }]);
        },
        getDisplayValue: function () {
            return 'some value';
        }
    };

    var stockLevels = {
        inStock: {
            value: 2
        },
        preorder: {
            value: 0
        },
        backorder: {
            value: 0
        },
        notAvailable: {
            value: 0
        }
    };

    var availabilityModelMock = {
        getAvailabilityLevels: {
            return: stockLevels,
            type: 'function'
        },
        inventoryRecord: {
            inStockDate: {
                toDateString: function () {
                    return 'some date';
                }
            }
        }
    };

    var multiValueTypeAttribute = {
        visibleAttributeGroups: new ArrayList([{
            ID: 'some ID',
            displayName: 'some name'
        }]),
        getVisibleAttributeDefinitions: function () {
            return new ArrayList([{
                multiValueType: true,
                displayName: 'some name'
            }]);
        },
        getDisplayValue: function () {
            return [1, 2, 3];
        }
    };

    var promotions = new ArrayList([{
        calloutMsg: { markup: 'Super duper promotion discount' },
        details: { markup: 'Some Details' },
        enabled: true,
        ID: 'SuperDuperPromo',
        name: 'Super Duper Promo',
        promotionClass: 'Some Class',
        rank: null
    }]);

    var promotionsNull = new ArrayList([{
        calloutMsg: { markup: 'Super duper promotion discount' },
        details: null,
        enabled: true,
        ID: 'SuperDuperPromo',
        name: 'Super Duper Promo',
        promotionClass: 'Some Class',
        rank: null
    }]);

    var promotionsCallOutMsgNull = new ArrayList([{
        calloutMsg: null,
        details: null,
        enabled: true,
        ID: 'SuperDuperPromo',
        name: 'Super Duper Promo',
        promotionClass: 'Some Class',
        rank: null
    }]);


    var productVariantMock = {
        ID: '1234567',
        name: 'test product',
        variant: false,
        variationGroup: false,
        productSet: false,
        bundle: false,
        master: true,
        attributeModel: attributeModel,
        availabilityModel: availabilityModelMock,
        minOrderQuantity: {
            value: 2
        }
    };

    var productMock = {
        variationModel: {
            productVariationAttributes: new ArrayList([{
                attributeID: '',
                value: ''
            }]),
            setSelectedAttributeValue: {
                return: null,
                type: 'function'
            },
            selectedVariant: productVariantMock,
            getAllValues: {
                return: new ArrayList([]),
                type: 'function'
            }
        },
        attributeModel: attributeModel,
        master: false,
        variant: false,
        variationGroup: false,
        productSet: false,
        bundle: false,
        optionProduct: false,
        availabilityModel: availabilityModelMock,
        minOrderQuantity: {
            value: 2
        }
    };

    it('should create a simple product with no query string params', function () {
        var mock = toProductMock(productMock);
        var product = new ProductBase(mock);

        assert.equal(product.productName, 'test product');
        assert.equal(product.id, 1234567);
        assert.equal(product.rating, 4);
    });

    it('should create a product with query string params', function () {
        var tempMock = Object.assign({}, productMock);
        var tempVariationAttributes = new ArrayList([{
            attributeID: 'color'
        }]);
        var tempGetAllValues = {
            return: new ArrayList([{
                value: 123
            }]),
            type: 'function'
        };
        tempMock.variationModel.selectedVariant.variant = true;
        tempMock.variationModel.productVariationAttributes = tempVariationAttributes;
        tempMock.variationModel.getAllValues = tempGetAllValues;
        var mock = toProductMock(tempMock);
        var product = new ProductBase(mock, { color: { value: 123 } });

        assert.equal(product.productName, 'test product');
        assert.equal(product.id, 1234567);
        assert.equal(product.rating, 4);
    });

    it('should create a product with default variant', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.variationModel.selectedVariant = null;
        tempMock = Object.assign({}, productVariantMock, tempMock);
        tempMock.variant = false;
        tempMock.variationGroup = true;
        var product = new ProductBase(toProductMock(tempMock), { color: { value: 123 } }, null);

        assert.equal(product.productName, 'test product');
        assert.equal(product.id, 1234567);
        assert.equal(product.rating, 4);
    });

    it('should contain an array of promotions', function () {
        var expectedPromotions = [{
            calloutMsg: 'Super duper promotion discount',
            details: 'Some Details',
            enabled: true,
            id: 'SuperDuperPromo',
            name: 'Super Duper Promo',
            promotionClass: 'Some Class',
            rank: null
        }];

        var tempMock = Object.assign({}, productMock);
        tempMock.variationModel.selectedVariant = null;
        tempMock = Object.assign({}, productVariantMock, tempMock);
        tempMock.variant = false;
        tempMock.variationGroup = true;
        var product = new ProductBase(toProductMock(tempMock), null, promotions);

        assert.deepEqual(product.promotions, expectedPromotions);
    });

    it('should handle null value for promotion.details', function () {
        var expectedPromotions = [{
            calloutMsg: 'Super duper promotion discount',
            details: null,
            enabled: true,
            id: 'SuperDuperPromo',
            name: 'Super Duper Promo',
            promotionClass: 'Some Class',
            rank: null
        }];

        var tempMock = Object.assign({}, productMock);
        tempMock.variationModel.selectedVariant = null;
        tempMock = Object.assign({}, productVariantMock, tempMock);
        tempMock.variant = false;
        tempMock.variationGroup = true;
        var product = new ProductBase(toProductMock(tempMock), null, promotionsNull);

        assert.deepEqual(product.promotions, expectedPromotions);
    });

    it('should handle null value for promotion.calloutMsg', function () {
        var expectedPromotions = [{
            calloutMsg: null,
            details: null,
            enabled: true,
            id: 'SuperDuperPromo',
            name: 'Super Duper Promo',
            promotionClass: 'Some Class',
            rank: null
        }];

        var tempMock = Object.assign({}, productMock);
        tempMock.variationModel.selectedVariant = null;
        tempMock = Object.assign({}, productVariantMock, tempMock);
        tempMock.variant = false;
        tempMock.variationGroup = true;
        var product = new ProductBase(toProductMock(tempMock), null, promotionsCallOutMsgNull);

        assert.deepEqual(product.promotions, expectedPromotions);
    });

    it('should handle no promotions provided', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock = Object.assign({}, productVariantMock, tempMock);
        var product = new ProductBase(toProductMock(tempMock), null);

        assert.equal(product.promotions, null);
    });

    it('should handle visible attribute groups', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock = Object.assign({}, productVariantMock, tempMock);
        var product = new ProductBase(toProductMock(tempMock), null);

        assert.equal(product.attributes.length, 1);
        assert.equal(product.attributes[0].ID, 'some ID');
        assert.equal(product.attributes[0].name, 'some name');
        assert.equal(product.attributes[0].attributes.length, 1);
    });

    it('should handle multi value type attribute definition', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.attributeModel = multiValueTypeAttribute;
        tempMock = Object.assign({}, productVariantMock, tempMock);
        var product = new ProductBase(toProductMock(tempMock), null);

        assert.equal(product.attributes.length, 1);
        assert.equal(product.attributes[0].ID, 'some ID');
        assert.equal(product.attributes[0].name, 'some name');
        assert.equal(product.attributes[0].attributes.length, 1);
        assert.equal(product.attributes[0].attributes[0].label, 'some name');
        assert.equal(product.attributes[0].attributes[0].value.length, 3);
    });

    it('should handle no visible attribute groups', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.attributeModel.visibleAttributeGroups = new ArrayList([]);
        tempMock = Object.assign({}, productVariantMock, tempMock);
        var product = new ProductBase(toProductMock(tempMock), null);

        assert.equal(product.attributes, null);
    });

    it('should create a product which is not a master and not a variant ', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.variationModel.selectedVariant = null;
        tempMock.variant = false;
        tempMock.variationModel.master = false;
        tempMock = Object.assign({}, productVariantMock, tempMock);
        var product = new ProductBase(toProductMock(tempMock));

        assert.equal(product.productName, 'test product');
        assert.equal(product.id, 1234567);
        assert.equal(product.rating, 4);
    });

    it('should create a master product', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.variationModel.selectedVariant = null;
        tempMock = Object.assign({}, productVariantMock, tempMock);
        tempMock.variant = false;
        tempMock.variationModel.master = true;
        var product = new ProductBase(toProductMock(tempMock));

        assert.equal(product.productName, 'test product');
        assert.equal(product.id, 1234567);
        assert.equal(product.rating, 4);
    });

    it('should create a product of type standard', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.variationModel = {};
        tempMock = Object.assign({}, productVariantMock, tempMock);

        var product = new ProductBase(toProductMock(tempMock), null);
        assert.equal(product.productType, 'standard');
    });

    it('should create a product of type master', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.variationModel = {};
        tempMock.master = true;
        tempMock = Object.assign({}, productVariantMock, tempMock);

        var product = new ProductBase(toProductMock(tempMock), null);
        assert.equal(product.productType, 'master');
    });

    it('should create a product of type bundle', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.variationModel = {};
        tempMock.bundle = true;
        tempMock = Object.assign({}, productVariantMock, tempMock);

        var product = new ProductBase(toProductMock(tempMock), null);
        assert.equal(product.productType, 'bundle');
    });

    it('should create a product of type productSet', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.variationModel = {};
        tempMock.productSet = true;
        tempMock = Object.assign({}, productVariantMock, tempMock);

        var product = new ProductBase(toProductMock(tempMock), null);
        assert.equal(product.productType, 'set');
    });

    it('should create a product of type optionProduct', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.variationModel = {};
        tempMock.optionProduct = true;
        tempMock = Object.assign({}, productVariantMock, tempMock);

        var product = new ProductBase(toProductMock(tempMock), null);
        assert.equal(product.productType, 'optionProduct');
    });

    it('should create a product of type variationGroup', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.variationModel = {};
        tempMock.variationGroup = true;
        tempMock = Object.assign({}, productVariantMock, tempMock);

        var product = new ProductBase(toProductMock(tempMock), null);
        assert.equal(product.productType, 'variationGroup');
    });

    it('should receive product in stock availability message', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock = Object.assign({}, productVariantMock, tempMock);

        var product = new ProductBase(toProductMock(tempMock), null);

        assert.equal(product.availability.messages.length, 1);
        assert.equal(product.availability.messages[0], 'label.instock');
        assert.equal(product.availability.inStockDate, 'some date');
    });

    it('should receive product pre order stock availability message', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.availabilityModel.getAvailabilityLevels.return.inStock.value = 0;
        tempMock.availabilityModel.getAvailabilityLevels.return.preorder.value = 2;
        tempMock = Object.assign({}, productVariantMock, tempMock);

        var product = new ProductBase(toProductMock(tempMock), null);

        assert.equal(product.availability.messages.length, 1);
        assert.equal(product.availability.messages[0], 'label.preorder');
    });

    it('should receive product back order stock availability message', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.availabilityModel.getAvailabilityLevels.return.inStock.value = 0;
        tempMock.availabilityModel.getAvailabilityLevels.return.preorder.value = 0;
        tempMock.availabilityModel.getAvailabilityLevels.return.backorder.value = 2;
        tempMock = Object.assign({}, productVariantMock, tempMock);

        var product = new ProductBase(toProductMock(tempMock), null);

        assert.equal(product.availability.messages.length, 1);
        assert.equal(product.availability.messages[0], 'label.back.order');
    });

    it('should receive product not available message', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.availabilityModel.getAvailabilityLevels.return.inStock.value = 0;
        tempMock.availabilityModel.getAvailabilityLevels.return.preorder.value = 0;
        tempMock.availabilityModel.getAvailabilityLevels.return.backorder.value = 0;
        tempMock.availabilityModel.getAvailabilityLevels.return.notAvailable.value = 2;
        tempMock = Object.assign({}, productVariantMock, tempMock);

        var product = new ProductBase(toProductMock(tempMock), null);

        assert.equal(product.availability.messages.length, 1);
        assert.equal(product.availability.messages[0], 'label.not.available');
    });

    it('should receive in stock and not available messages', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.availabilityModel.getAvailabilityLevels.return.inStock.value = 1;
        tempMock.availabilityModel.getAvailabilityLevels.return.preorder.value = 0;
        tempMock.availabilityModel.getAvailabilityLevels.return.backorder.value = 0;
        tempMock.availabilityModel.getAvailabilityLevels.return.notAvailable.value = 1;
        tempMock = Object.assign({}, productVariantMock, tempMock);

        var product = new ProductBase(toProductMock(tempMock), null);

        assert.equal(product.availability.messages.length, 2);
        assert.equal(product.availability.messages[0], 'label.quantity.in.stock');
        assert.equal(product.availability.messages[1], 'label.not.available.items');
    });

    it('should receive in stock and pre order messages', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.availabilityModel.getAvailabilityLevels.return.inStock.value = 1;
        tempMock.availabilityModel.getAvailabilityLevels.return.preorder.value = 1;
        tempMock.availabilityModel.getAvailabilityLevels.return.backorder.value = 0;
        tempMock.availabilityModel.getAvailabilityLevels.return.notAvailable.value = 0;
        tempMock = Object.assign({}, productVariantMock, tempMock);

        var product = new ProductBase(toProductMock(tempMock), null);

        assert.equal(product.availability.messages.length, 2);
        assert.equal(product.availability.messages[0], 'label.quantity.in.stock');
        assert.equal(product.availability.messages[1], 'label.preorder.items');
    });

    it('should receive in stock and back order messages', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.availabilityModel.getAvailabilityLevels.return.inStock.value = 1;
        tempMock.availabilityModel.getAvailabilityLevels.return.preorder.value = 0;
        tempMock.availabilityModel.getAvailabilityLevels.return.backorder.value = 1;
        tempMock.availabilityModel.getAvailabilityLevels.return.notAvailable.value = 0;
        tempMock = Object.assign({}, productVariantMock, tempMock);

        var product = new ProductBase(toProductMock(tempMock), null);

        assert.equal(product.availability.messages.length, 2);
        assert.equal(product.availability.messages[0], 'label.quantity.in.stock');
        assert.equal(product.availability.messages[1], 'label.back.order.items');
    });

    it('should receive in stock date null', function () {
        var tempMock = Object.assign({}, productMock);
        tempMock.availabilityModel.inventoryRecord = null;
        tempMock = Object.assign({}, productVariantMock, tempMock);

        var product = new ProductBase(toProductMock(tempMock), null);

        assert.equal(product.availability.inStockDate, null);
    });
});
