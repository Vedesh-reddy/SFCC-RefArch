'use strict';

var server = require('server');

var BasketMgr = require('dw/order/BasketMgr');
var HookMgr = require('dw/system/HookMgr');
var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');
var URLUtils = require('dw/web/URLUtils');

var CartModel = require('*/cartridge/models/cart');
var ProductLineItemsModel = require('*/cartridge/models/productLineItems');

var collections = require('*/cartridge/scripts/util/collections');
var cartHelper = require('*/cartridge/scripts/cart/cartHelpers');
var shippingHelper = require('*/cartridge/scripts/checkout/shippingHelpers');

var csrfProtection = require('*/cartridge/scripts/middleware/csrf');

server.get('MiniCart', server.middleware.include, function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentOrNewBasket();
    var quantityTotal = ProductLineItemsModel.getTotalQuantity(currentBasket.productLineItems);

    res.render('/components/header/minicart', { quantityTotal: quantityTotal });
    next();
});

server.post('AddProduct', function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentOrNewBasket();
    var productId = req.form.pid;
    var childProducts = Object.hasOwnProperty.call(req.form, 'childProducts')
        ? JSON.parse(req.form.childProducts)
        : [];
    var options = req.form.options ? JSON.parse(req.form.options) : [];
    var quantity;
    var result;
    var pidsObj;

    if (currentBasket) {
        Transaction.wrap(function () {
            if (!req.form.pidsObj) {
                quantity = parseInt(req.form.quantity, 10);
                result = cartHelper.addProductToCart(
                    currentBasket,
                    productId,
                    quantity,
                    childProducts,
                    options
                );
            } else {
                // product set
                pidsObj = JSON.parse(req.form.pidsObj);
                result = {
                    error: false,
                    message: Resource.msg('text.alert.addedtobasket', 'product', null)
                };

                pidsObj.forEach(function (PIDObj) {
                    quantity = parseInt(PIDObj.qty, 10);
                    var pidOptions = PIDObj.options ? JSON.parse(PIDObj.options) : {};
                    var PIDObjResult = cartHelper.addProductToCart(
                        currentBasket,
                        PIDObj.pid,
                        quantity,
                        childProducts,
                        pidOptions
                    );
                    if (PIDObjResult.error) {
                        result.error = PIDObjResult.error;
                        result.message = PIDObjResult.message;
                    }
                });
            }
            if (!result.error) {
                cartHelper.ensureAllShipmentsHaveMethods(currentBasket);
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

server.get(
    'Show',
    server.middleware.https,
    csrfProtection.generateToken,
    function (req, res, next) {
        var currentBasket = BasketMgr.getCurrentBasket();

        if (currentBasket) {
            Transaction.wrap(function () {
                if (currentBasket.currencyCode !== req.session.currency.currencyCode) {
                    currentBasket.updateCurrency();
                }
                cartHelper.ensureAllShipmentsHaveMethods(currentBasket);

                HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
            });
        }

        var basketModel = new CartModel(currentBasket);

        res.render('cart/cart', basketModel);
        next();
    }
);

server.get('Get', function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();

    if (currentBasket) {
        Transaction.wrap(function () {
            cartHelper.ensureAllShipmentsHaveMethods(currentBasket);

            HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
        });
    }

    var basketModel = new CartModel(currentBasket);

    res.json(basketModel);
    next();
});

server.get('RemoveProductLineItem', function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();

    if (!currentBasket) {
        res.setStatusCode(500);
        res.json({
            error: true,
            redirectUrl: URLUtils.url('Cart-Show').toString()
        });

        return next();
    }

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
    } else {
        res.setStatusCode(500);
        res.json({ errorMessage: Resource.msg('error.cannot.remove.product', 'cart', null) });
    }

    return next();
});

server.get('UpdateQuantity', function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();

    if (!currentBasket) {
        res.setStatusCode(500);
        res.json({
            error: true,
            redirectUrl: URLUtils.url('Cart-Show').toString()
        });

        return next();
    }

    var productId = req.querystring.pid;
    var updateQuantity = parseInt(req.querystring.quantity, 10);
    var uuid = req.querystring.uuid;
    var productLineItems = currentBasket.productLineItems;
    var matchingLineItem = collections.find(productLineItems, function (item) {
        return item.productID === productId && item.UUID === uuid;
    });
    var availableToSell = 0;

    var totalQtyRequested = 0;
    var qtyAlreadyInCart = 0;
    var minOrderQuantity = 0;
    var canBeUpdated = false;
    var bundleItems;

    if (matchingLineItem) {
        if (matchingLineItem.product.bundle) {
            bundleItems = matchingLineItem.bundledProductLineItems;
            canBeUpdated = collections.every(bundleItems, function (item) {
                var quantityToUpdate = updateQuantity *
                    matchingLineItem.product.getBundledProductQuantity(item.product).value;
                qtyAlreadyInCart = cartHelper.getQtyAlreadyInCart(
                    item.productID,
                    productLineItems,
                    item.UUID
                );
                totalQtyRequested = quantityToUpdate + qtyAlreadyInCart;
                availableToSell = item.product.availabilityModel.inventoryRecord.ATS.value;
                minOrderQuantity = item.product.minOrderQuantity.value;
                return (totalQtyRequested <= availableToSell) &&
                    (quantityToUpdate >= minOrderQuantity);
            });
        } else {
            availableToSell = matchingLineItem.product.availabilityModel.inventoryRecord.ATS.value;
            qtyAlreadyInCart = cartHelper.getQtyAlreadyInCart(
                productId,
                productLineItems,
                matchingLineItem.UUID
            );
            totalQtyRequested = updateQuantity + qtyAlreadyInCart;
            minOrderQuantity = matchingLineItem.product.minOrderQuantity.value;
            canBeUpdated = (totalQtyRequested <= availableToSell) &&
                (updateQuantity >= minOrderQuantity);
        }
    }

    if (canBeUpdated) {
        Transaction.wrap(function () {
            matchingLineItem.setQuantityValue(updateQuantity);
            HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
        });
    }

    if (matchingLineItem && canBeUpdated) {
        var basketModel = new CartModel(currentBasket);
        res.json(basketModel);
    } else {
        res.setStatusCode(500);
        res.json({
            errorMessage: Resource.msg('error.cannot.update.product.quantity', 'cart', null)
        });
    }

    return next();
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
        shipment = shippingHelper.getShipmentByUUID(currentBasket, shipUUID);
    } else {
        shipment = currentBasket.defaultShipment;
    }

    Transaction.wrap(function () {
        shippingHelper.selectShippingMethod(shipment, methodID);

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
            cartHelper.ensureAllShipmentsHaveMethods(currentBasket);
            HookMgr.callHook('dw.ocapi.shop.basket.calculate', 'calculate', currentBasket);
        });
    }

    var basketModel = new CartModel(currentBasket);

    res.render('checkout/cart/miniCart', basketModel);
    next();
});

server.get(
    'AddCoupon',
    server.middleware.https,
    csrfProtection.validateAjaxRequest,
    function (req, res, next) {
        var data = res.getViewData();
        if (data && data.csrfError) {
            res.json();
            return next();
        }

        var currentBasket = BasketMgr.getCurrentBasket();

        if (!currentBasket) {
            res.setStatusCode(500);
            res.json({
                error: true,
                redirectUrl: URLUtils.url('Cart-Show').toString()
            });

            return next();
        }

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
    }
);


server.get('RemoveCouponLineItem', function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();

    if (!currentBasket) {
        res.setStatusCode(500);
        res.json({
            error: true,
            redirectUrl: URLUtils.url('Cart-Show').toString()
        });

        return next();
    }

    var couponLineItem;

    if (currentBasket && req.querystring.uuid) {
        couponLineItem = collections.find(currentBasket.couponLineItems, function (item) {
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
