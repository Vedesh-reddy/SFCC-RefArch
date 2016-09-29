'use strict';

var server = require('server');
var BasketMgr = require('dw/order/BasketMgr');
var HookMgr = require('dw/system/HookMgr');
var locale = require('~/cartridge/scripts/middleware/locale');
var Order = require('~/cartridge/models/order');
var ProductLineItemModel = require('~/cartridge/models/productLineItem');
var ShippingModel = require('~/cartridge/models/shipping');
var ShippingMgr = require('dw/order/ShippingMgr');
var Totals = require('~/cartridge/models/totals');
var Transaction = require('dw/system/Transaction');

server.get('Test', locale, function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentOrNewBasket();
    var billing;
    var orderTotals;
    var productLineItemModel;
    var shippingModel;
    var shipmentShippingModel;

    Transaction.wrap(function () {
        if (currentBasket && !currentBasket.defaultShipment.shippingMethod) {
            ShippingModel.selectShippingMethod(currentBasket.defaultShipment);
        }
        if (currentBasket) {
            HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
        }
    });

    if (currentBasket) {
        shipmentShippingModel = ShippingMgr.getShipmentShippingModel(currentBasket.defaultShipment);
        shippingModel = new ShippingModel(currentBasket.defaultShipment, shipmentShippingModel);
        productLineItemModel = new ProductLineItemModel(currentBasket);
        orderTotals = new Totals(currentBasket);
    }

    var order = new Order(currentBasket, shippingModel, billing, orderTotals, productLineItemModel);

    res.json(order);
    next();
});

server.get('Confirm', locale, function (req, res, next) {
    // =====================================================
    // Danger after checkout is complete remove testOrder
    // TODO Remove testOrder and the everything between the ==== signs
    var testOrder = require('~/cartridge/scripts/OrderTest');
    // res.json(testOrder.orderTest(req));
    res.render('checkout/confirmation/confirmation', testOrder.orderTest(req));
    // res.render('checkout/confirmation/confirmation', testOrder.getOrderTest(req));
    // =====================================================

    next();
});

module.exports = server.exports();
