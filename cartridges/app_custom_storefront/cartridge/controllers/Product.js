'use strict';

var server = require('server');
var productCarouselHelpers = require('*/cartridge/scripts/helpers/productCarouselHelpers');

server.extend(module.superModule);

server.append('Show', function (req, res, next) {
    var product = res.getViewData().product;
    res.setViewData({
        relatedCarousel: product ? productCarouselHelpers.getRelatedCarousel(product.id) : null
    });
    next();
});

module.exports = server.exports();
