'use strict';

var server = require('server');
var productCarouselHelpers = require('*/cartridge/scripts/helpers/productCarouselHelpers');

server.extend(module.superModule);

server.append('Show', function (req, res, next) {
    res.setViewData({
        cartCarousel: productCarouselHelpers.getCarousel('heading.carousel.popular', 'newarrivals')
    });
    next();
});

module.exports = server.exports();
