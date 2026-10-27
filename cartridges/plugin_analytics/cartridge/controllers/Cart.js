'use strict';

var server = require('server');

server.extend(module.superModule);

// Records a successful add to cart with the quantity and the basket's own price.
server.append('AddProduct', function (req, res, next) {
    if (!res.getViewData().error) {
        require('*/cartridge/scripts/helpers/analyticsHelpers').addToCart(require('dw/order/BasketMgr').getCurrentBasket(), req.form, res.getViewData().pliUUID);
    }
    next();
});

module.exports = server.exports();
