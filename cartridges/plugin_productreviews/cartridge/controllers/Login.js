'use strict';

var server = require('server');
server.extend(module.superModule);
server.append('Show', function (req, res, next) {
    if (String(req.querystring.rurl) === '3') {
        res.setViewData({ oAuthReentryEndpoint: 3 });
    }
    return next();
});
module.exports = server.exports();
