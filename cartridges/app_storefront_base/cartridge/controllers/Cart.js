'use strict';

var server = require('server');

var BasketMgr = require('dw/order/BasketMgr');
var HookMgr = require('dw/system/HookMgr');
var Resource = require('dw/web/Resource');
var ShippingMgr = require('dw/order/ShippingMgr');
var Transaction = require('dw/system/Transaction');

var Cart = require('~/cartridge/models/cart');
var ProductLineItemModel = require('~/cartridge/models/productLineItems');
var ShippingModel = require('~/cartridge/models/shipping');
var Totals = require('~/cartridge/models/totals');
var cartHelpers = require('~/cartridge/scripts/cart/cartHelpers');

server.get('MiniCart', server.middleware.include, function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentOrNewBasket();
    var quantityTotal = ProductLineItemModel.getTotalQuantity(currentBasket.allProductLineItems);
    res.render('/components/header/minicart', { quantityTotal: quantityTotal });
    next();
});

// FIXME: This is just a temporary endpoint to add a simple variant from the Product Detail Page.
server.post('AddProduct', function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentOrNewBasket();
    var productId = req.querystring.pid;
    var quantity = parseInt(req.querystring.quantity, 10);

    cartHelpers.addProductToCart(currentBasket, productId, quantity);

    var quantityTotal = ProductLineItemModel.getTotalQuantity(currentBasket.allProductLineItems);

    res.json({ quantityTotal: quantityTotal });
    next();
});

server.get('Show', function (req, res, next) {
    var cartTotals;
    var currentBasket = BasketMgr.getCurrentBasket();
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
        shipmentShippingModel = ShippingMgr.getShipmentShippingModel(
            currentBasket.defaultShipment
        );
        shippingModel = new ShippingModel(currentBasket.defaultShipment, shipmentShippingModel);
    }

    productLineItemModel = new ProductLineItemModel(currentBasket);
    cartTotals = new Totals(currentBasket);

    var basket = new Cart(currentBasket, shippingModel, productLineItemModel, cartTotals);

    res.render('cart/cart', basket);
    next();
});

server.get('Test', function (req, res, next) {
    var cartTotals;
    var currentBasket = BasketMgr.getCurrentBasket();
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
        shipmentShippingModel = ShippingMgr.getShipmentShippingModel(
            currentBasket.defaultShipment
        );
        shippingModel = new ShippingModel(currentBasket.defaultShipment, shipmentShippingModel);
    }

    productLineItemModel = new ProductLineItemModel(currentBasket);
    cartTotals = new Totals(currentBasket);

    var basket = new Cart(currentBasket, shippingModel, productLineItemModel, cartTotals);

    res.json(basket);
    next();
});

server.get('RemoveProductLineItem', function (req, res, next) {
    var cartTotals;
    var currentBasket = BasketMgr.getCurrentBasket();
    var productLineItemModel;
    var shipmentShippingModel;
    var shippingModel;
    var isProductLineItemFound = false;

    Transaction.wrap(function () {
        if (req.querystring.pid && req.querystring.uuid) {
            var productLineItems = currentBasket.getAllProductLineItems(req.querystring.pid);
            for (var i = 0; i < productLineItems.length; i++) {
                var item = productLineItems[i];
                if ((item.UUID === req.querystring.uuid)) {
                    currentBasket.removeProductLineItem(item);
                    isProductLineItemFound = true;
                    break;
                }
            }
            HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
        }
    });

    if (currentBasket) {
        shipmentShippingModel = ShippingMgr.getShipmentShippingModel(currentBasket.defaultShipment);
        shippingModel = new ShippingModel(currentBasket.defaultShipment, shipmentShippingModel);
    }

    if (isProductLineItemFound) {
        productLineItemModel = new ProductLineItemModel(currentBasket);
        cartTotals = new Totals(currentBasket);
        var basket = new Cart(currentBasket, shippingModel, productLineItemModel, cartTotals);

        res.json(basket);
        next();
    } else {
        res.setStatusCode(500);
        res.json({ errorMessage: Resource.msg('error.cannot.remove.product', 'cart', null) });
        next();
    }
});

server.get('UpdateQuantity', function (req, res, next) {
    var cartTotals;
    var currentBasket = BasketMgr.getCurrentBasket();
    var productLineItemModel;
    var shipmentShippingModel;
    var shippingModel;
    var isProductLineItemFound = false;
    var error = false;

    Transaction.wrap(function () {
        if (req.querystring.pid && req.querystring.uuid) {
            var productLineItems = currentBasket.getAllProductLineItems(req.querystring.pid);
            for (var i = 0; i < productLineItems.length; i++) {
                var item = productLineItems[i];
                if ((req.querystring.quantity && item.UUID === req.querystring.uuid)) {
                    var updatedQuantity = parseInt(req.querystring.quantity, 10);

                    if (updatedQuantity >= item.product.minOrderQuantity.value &&
                        updatedQuantity < item.product.availabilityModel.inventoryRecord.ATS.value
                    ) {
                        item.setQuantityValue(updatedQuantity);
                        isProductLineItemFound = true;
                        break;
                    } else {
                        error = true;
                        return;
                    }
                }
            }
            HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
        }
    });

    if (currentBasket) {
        shipmentShippingModel = ShippingMgr.getShipmentShippingModel(currentBasket.defaultShipment);
        shippingModel = new ShippingModel(currentBasket.defaultShipment, shipmentShippingModel);
    }

    if (isProductLineItemFound && !error) {
        productLineItemModel = new ProductLineItemModel(currentBasket);
        cartTotals = new Totals(currentBasket);
        var basket = new Cart(currentBasket, shippingModel, productLineItemModel, cartTotals);

        res.json(basket);
        next();
    } else {
        res.setStatusCode(500);
        res.json({
            errorMessage: Resource.msg('error.cannot.update.product.quantity', 'cart', null)
        });
        next();
    }
});

server.get('SelectShippingMethod', function (req, res, next) {
    var cartTotals;
    var currentBasket = BasketMgr.getCurrentBasket();
    var error = false;
    var productLineItemModel;
    var shipmentShippingModel;
    var shippingModel;

    if (req.querystring.methodID) {
        Transaction.wrap(function () {
            ShippingModel.selectShippingMethod(
                currentBasket.defaultShipment,
                req.querystring.methodID
            );

            if (currentBasket && !currentBasket.defaultShipment.shippingMethod) {
                error = true;
                return;
            }

            HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
        });
    }

    if (currentBasket) {
        shipmentShippingModel = ShippingMgr.getShipmentShippingModel(currentBasket.defaultShipment);
        shippingModel = new ShippingModel(currentBasket.defaultShipment, shipmentShippingModel);
    }

    if (!error) {
        productLineItemModel = new ProductLineItemModel(currentBasket);
        cartTotals = new Totals(currentBasket);
        var basket = new Cart(currentBasket, shippingModel, productLineItemModel, cartTotals);

        res.json(basket);
        next();
    } else {
        res.setStatusCode(500);
        res.json({
            errorMessage: Resource.msg('error.cannot.select.shipping.method', 'cart', null)
        });
        next();
    }
});

server.get('MiniCartShow', function (req, res, next) {
    var totalsModel;
    var currentBasket = BasketMgr.getCurrentBasket();
    var productLineItemsModel;

    Transaction.wrap(function () {
        if (currentBasket && !currentBasket.defaultShipment.shippingMethod) {
            ShippingModel.selectShippingMethod(currentBasket.defaultShipment);
        }

        if (currentBasket) {
            HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
        }
    });

    productLineItemsModel = new ProductLineItemModel(currentBasket);
    totalsModel = new Totals(currentBasket);

    var basket = new Cart(currentBasket, null, productLineItemsModel, totalsModel);

    res.render('checkout/cart/miniCart', basket);
    next();
});

module.exports = server.exports();
