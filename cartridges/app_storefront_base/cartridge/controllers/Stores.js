'use strict';

var URLUtils = require('dw/web/URLUtils');
var BasketMgr = require('dw/order/BasketMgr');

var StoreHelpers = require('*/cartridge/scripts/helpers/storeHelpers');

var server = require('server');
var cache = require('*/cartridge/scripts/middleware/cache');

server.get('Find', server.middleware.https, cache.applyDefaultCache, function (req, res, next) {
    res.render('storelocator/storelocator', StoreHelpers.getModel(req));
    next();
});

// The req parameter in the unnamed callback function is a local instance of the request object.
// The req parameter has a property called querystring. In this use case the querystring could
// have the following:
// lat - The latitude of the users position.
// long - The longitude of the users position.
// radius - The radius that the user selected to refine the search
// or
// postalCode - The postal code that the user used to search.
// radius - The radius that the user selected to refine the search
server.get('FindStores', function (req, res, next) {
    res.json(StoreHelpers.getModel(req));
    next();
});

/**
 * Find stores within radius of location, which have all SKUs from Basket in stock
 */
server.get('FindAvailableStores', server.middleware.https, function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();
    if (!currentBasket) {
        res.json({
            error: true,
            cartError: true,
            fieldErrors: [],
            serverErrors: [],
            redirectUrl: URLUtils.url('Cart-Show').toString()
        });
        return;
    }

    var pliQtys;
    if (req.querystring.pid) {
        var pliQty = {
            productID: req.querystring.pid
        };
        if (req.querystring.qty) {
            pliQty.quantityValue = req.querystring.qty - 0;
        } else {
            pliQty.quantityValue = 1;
        }
        pliQtys = [pliQty];
    } else {
        pliQtys = currentBasket.productLineItems;
    }

    var storesModel = StoreHelpers.getModel(req);
    var availableStores = StoreHelpers.getFilteredStores(storesModel, pliQtys);

    res.json({
        availableStores: availableStores
    });

    next();
});

module.exports = server.exports();
