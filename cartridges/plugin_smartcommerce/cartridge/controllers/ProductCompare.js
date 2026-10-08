'use strict';

/**
 * Comparison page. The selection lives in the shopper's browser and arrives as
 * ?pids=a,b,c, so the page holds no personal data and can be cached.
 * @module controllers/ProductCompare
 */

var server = require('server');
var cache = require('*/cartridge/scripts/middleware/cache');
var productCompare = require('*/cartridge/scripts/productCompare');

server.get('Show', cache.applyPromotionSensitiveCache, function (req, res, next) {
    res.render('smart/compare/page', { compare: productCompare.build(req.querystring.pids) });
    next();
});

module.exports = server.exports();
