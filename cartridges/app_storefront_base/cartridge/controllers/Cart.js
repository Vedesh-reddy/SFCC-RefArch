'use strict';

var server = require('server');

var BasketMgr = require('dw/order/BasketMgr');
var HookMgr = require('dw/system/HookMgr');
var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');
var URLUtils = require('dw/web/URLUtils');

var CartModel = require('~/cartridge/models/cart');
var ProductLineItemsModel = require('~/cartridge/models/productLineItems');

var Collections = require('~/cartridge/scripts/util/collections');
var CartHelper = require('~/cartridge/scripts/cart/cartHelpers');
var ShippingHelper = require('~/cartridge/scripts/checkout/shippingHelpers');


server.get('MiniCart', server.middleware.include, function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentOrNewBasket();
    var quantityTotal = ProductLineItemsModel.getTotalQuantity(currentBasket.productLineItems);

    res.render('/components/header/minicart', { quantityTotal: quantityTotal });
    next();
});

server.post('AddProduct', function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentOrNewBasket();
    var productId = req.form.pid;
    var childPids = Object.hasOwnProperty.call(req.form, 'childPids')
        ? decodeURIComponent(req.form.childPids).split(',')
        : [];
    var quantity = parseInt(req.form.quantity, 10);
    var result;

    if (currentBasket) {
        Transaction.wrap(function () {
            result = CartHelper.addProductToCart(currentBasket, productId, quantity, childPids);
            if (!result.error) {
                CartHelper.ensureAllShipmentsHaveMethods(currentBasket);
                HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
            }
        });
    }

    var quantityTotal = ProductLineItemsModel.getTotalQuantity(currentBasket.productLineItems);
    var cartModel = new CartModel(currentBasket);

    res.json({
        quantityTotal: quantityTotal,
        message: result.message,
        cart: cartModel,
        error: result.error
    });

    next();
});

server.get('Show', server.middleware.https, function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();

    if (currentBasket) {
        Transaction.wrap(function () {
            if (currentBasket.currencyCode !== req.session.currency.currencyCode) {
                currentBasket.updateCurrency();
            }
            CartHelper.ensureAllShipmentsHaveMethods(currentBasket);

            HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
        });
    }

    var basketModel = new CartModel(currentBasket);

    res.render('cart/cart', basketModel);
    next();
});

server.get('Get', function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();

    if (currentBasket) {
        Transaction.wrap(function () {
            CartHelper.ensureAllShipmentsHaveMethods(currentBasket);

            HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
        });
    }

    var basketModel = new CartModel(currentBasket);

    res.json(basketModel);
    next();
});

server.get('RemoveProductLineItem', function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();
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
        }
        HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
    });

    if (isProductLineItemFound) {
        var basketModel = new CartModel(currentBasket);

        res.json(basketModel);
        next();
    } else {
        res.setStatusCode(500);
        res.json({ errorMessage: Resource.msg('error.cannot.remove.product', 'cart', null) });
        next();
    }
});

server.get('UpdateQuantity', function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();
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
                        updatedQuantity <= item.product.availabilityModel.inventoryRecord.ATS.value
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

    if (isProductLineItemFound && !error) {
        var basketModel = new CartModel(currentBasket);

        res.json(basketModel);
        next();
    } else {
        res.setStatusCode(500);
        res.json({
            errorMessage: Resource.msg('error.cannot.update.product.quantity', 'cart', null)
        });
        next();
    }
});


server.post('SelectShippingMethod', server.middleware.https, function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();

    if (!currentBasket) {
        res.json({
            error: true,
            redirectUrl: URLUtils.url('Cart-Show').toString()
        });
        return next();
    }

    var error = false;

    var shipUUID = req.querystring.shipmentUUID || req.form.shipmentUUID;
    var methodID = req.querystring.methodID || req.form.methodID;
    var shipment;
    if (shipUUID) {
        shipment = ShippingHelper.getShipmentByUUID(currentBasket, shipUUID);
    } else {
        shipment = currentBasket.defaultShipment;
    }

    Transaction.wrap(function () {
        ShippingHelper.selectShippingMethod(shipment, methodID);

        if (currentBasket && !shipment.shippingMethod) {
            error = true;
            return;
        }

        HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
    });

    if (!error) {
        var basketModel = new CartModel(currentBasket);

        res.json(basketModel);
    } else {
        res.setStatusCode(500);
        res.json({
            errorMessage: Resource.msg('error.cannot.select.shipping.method', 'cart', null)
        });
    }
    return next();
});

server.get('MiniCartShow', function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();

    if (currentBasket) {
        Transaction.wrap(function () {
            if (currentBasket.currencyCode !== req.session.currency.currencyCode) {
                currentBasket.updateCurrency();
            }
            CartHelper.ensureAllShipmentsHaveMethods(currentBasket);
            HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
        });
    }

    var basketModel = new CartModel(currentBasket);

    res.render('checkout/cart/miniCart', basketModel);
    next();
});

server.get('AddCoupon', server.middleware.https, function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();

    if (!currentBasket) {
        res.setStatusCode(500);
        res.json({ errorMessage: Resource.msg('error.add.coupon', 'cart', null) });
        return next();
    }

    var error = false;
    var errorMessage;

    try {
        Transaction.wrap(function () {
            return currentBasket.createCouponLineItem(req.querystring.couponCode, true);
        });
    } catch (e) {
        error = true;
        var errorCodes = {
            COUPON_CODE_ALREADY_IN_BASKET: 'error.coupon.already.in.cart',
            COUPON_ALREADY_IN_BASKET: 'error.coupon.cannot.be.combined',
            COUPON_CODE_ALREADY_REDEEMED: 'error.coupon.already.redeemed',
            COUPON_CODE_UNKNOWN: 'error.unable.to.add.coupon',
            COUPON_DISABLED: 'error.unable.to.add.coupon',
            REDEMPTION_LIMIT_EXCEEDED: 'error.unable.to.add.coupon',
            TIMEFRAME_REDEMPTION_LIMIT_EXCEEDED: 'error.unable.to.add.coupon',
            NO_ACTIVE_PROMOTION: 'error.unable.to.add.coupon',
            default: 'error.unable.to.add.coupon'
        };

        var errorMessageKey = errorCodes[e.errorCode] || errorCodes.default;
        errorMessage = Resource.msg(errorMessageKey, 'cart', null);
    }

    if (error) {
        res.json({
            error: error,
            errorMessage: errorMessage
        });
        return next();
    }

    Transaction.wrap(function () {
        HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
    });

    var basketModel = new CartModel(currentBasket);

    res.json(basketModel);
    return next();
});


server.get('RemoveCouponLineItem', function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();
    var couponLineItem;

    if (currentBasket && req.querystring.uuid) {
        couponLineItem = Collections.find(currentBasket.couponLineItems, function (item) {
            return item.UUID === req.querystring.uuid;
        });

        if (couponLineItem) {
            Transaction.wrap(function () {
                currentBasket.removeCouponLineItem(couponLineItem);
                HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
            });

            var basketModel = new CartModel(currentBasket);

            res.json(basketModel);
            return next();
        }
    }

    res.setStatusCode(500);
    res.json({ errorMessage: Resource.msg('error.cannot.remove.coupon', 'cart', null) });
    return next();
});

module.exports = server.exports();
