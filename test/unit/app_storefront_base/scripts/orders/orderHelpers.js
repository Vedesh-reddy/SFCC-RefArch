'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var mockCollections = require('../../../../mocks/util/collections');
var ArrayList = require('../../../../mocks/dw.util.Collection');

describe('format number', function () {
    var orderHelpers = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/order/orderHelpers', {
        'dw/util/StringUtils': {
            formatNumber: function () {
                return 'formatted number';
            },
            formatCalendar: function () {
                return 'formatted date';
            }
        },
        'dw/util/Calendar': function () { return {}; },
        'dw/util/HashMap': {},
        'dw/net/Mail': {},
        'dw/order/OrderMgr': {},
        'dw/order/Order': {},
        'dw/system/Site': {},
        'dw/util/Template': {},
        'dw/web/Resource': {},
        'dw/web/URLUtils': {
            url: function () {
                return 'url';
            }
        },
        '*/cartridge/scripts/helpers/formatHelpers': proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/helpers/formatHelpers', {
            'dw/util/StringUtils': {
                formatNumber: function () {
                    return 'formatted number';
                }
            }
        }),
        '*/cartridge/scripts/util/collections': mockCollections,
        '*/cartridge/models/order': {}
    });

    var order = {
        currencyCode: 'US',
        createdBy: 'Someone',
        merchandizeTotalNetPrice: { value: 'merchandizeTotalNetPrice' },
        merchandizeTotalTax: { value: 'merchandizeTotalTax' },
        merchandizeTotalGrossPrice: { value: 'merchandizeTotalGrossPrice' },
        shippingTotalNetPrice: { value: 'shippingTotalNetPrice' },
        shippingTotalTax: { value: 'shippingTotalTax' },
        shippingTotalGrossPrice: { value: 'shippingTotalGrossPrice' },
        adjustedMerchandizeTotalNetPrice: { value: 'adjustedMerchandizeTotalNetPrice' },
        adjustedMerchandizeTotalTax: { value: 'adjustedMerchandizeTotalTax' },
        adjustedMerchandizeTotalGrossPrice: { value: 'adjustedMerchandizeTotalGrossPrice' },
        adjustedShippingTotalNetPrice: { value: 'adjustedShippingTotalNetPrice' },
        adjustedShippingTotalTax: { value: 'adjustedShippingTotalTax' },
        adjustedShippingTotalGrossPrice: { value: 'adjustedShippingTotalGrossPrice' },
        totalNetPrice: { value: 'totalNetPrice' },
        totalTax: { value: 'totalTax' },
        totalGrossPrice: { value: 'totalGrossPrice' },
        priceAdjustments: new ArrayList([{
            campaignID: 'Some ID',
            promotionID: 'Some ID',
            price: {
                value: 'some price'
            },
            isCustom: function () { return; },
            basedOnCoupon: true
        }]),
        shipments: new ArrayList([{
            shippingPriceAdjustments: new ArrayList([{
                campaignID: 'some ID',
                promotionID: 'some ID',
                price: { value: 'some price' },
                isCustom: function () { return; },
                basedOnCoupon: true
            }]),
            productLineItems: new ArrayList([{
                productID: 'product id',
                productName: 'product name',
                UUID: 'UUID',
                quantity: { value: 'quantity' },
                basePrice: { value: 'base price' },
                netPrice: { value: 'net price' },
                tax: { value: 'tax' },
                grossPrice: { value: 'gross price' },
                adjustedNetPrice: { value: 'adjusted Net Price' },
                adjustedTax: { value: 'adjustedTax' },
                adjustedGrossPrice: { value: 'adjustedGrossPrice' },
                manufacturerName: 'manufacturerName',
                bonusProductLineItem: 'bonusProductLineItem',
                priceAdjustments: new ArrayList([{
                    UUID: 'UUID',
                    campaignID: 'some ID',
                    promotionID: 'some ID',
                    price: { value: 'some price' },
                    isCustom: function () { return; },
                    basedOnCoupon: false
                }])
            }])
        }])
    };

    it('should get the reporting URLs', function () {
        var result = orderHelpers.getReportingUrls(order);
        assert.equal(result.length, 5);
    });
});
