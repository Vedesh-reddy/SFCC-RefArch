'use strict';

var server = require('server');
var productCarouselHelpers = require('*/cartridge/scripts/helpers/productCarouselHelpers');

server.extend(module.superModule);

server.append('Show', function (req, res, next) {
    res.setViewData({
        productCarousels: [
            productCarouselHelpers.getCarousel('heading.carousel.new', 'newarrivals'),
            productCarouselHelpers.getCarousel('heading.carousel.women', 'womens'),
            productCarouselHelpers.getCarousel('heading.carousel.men', 'mens')
        ]
    });
    next();
});

module.exports = server.exports();
