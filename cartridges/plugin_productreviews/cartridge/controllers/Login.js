'use strict';

/**
 * Preserve the inherited SFRA login route and select the review return endpoint
 * only for review-originated login requests (rurl=3).
 * @module controllers/Login
 */

var server = require('server');
server.extend(module.superModule);
server.append('Show', function (req, res, next) {
    if (String(req.querystring.rurl) === '3') {
        res.setViewData({ oAuthReentryEndpoint: 3 });
    }
    return next();
});
module.exports = server.exports();
