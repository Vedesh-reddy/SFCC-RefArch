'use strict';

var server = require('server');

/**
 * Analytics-Collect : receives the beacons of the storefront analytics script. Pages are
 * cached, so they cannot carry a session CSRF token; instead only same-origin requests are
 * read, every event is checked against the allowlist, and nothing here can move money or
 * orders. The answer is always empty, so the shopper never waits on analytics.
 * @name AnalyticsCollect
 * @function
 * @param {middleware} - server.middleware.https
 * @param {serverfunction} - post
 */
server.post('Collect', server.middleware.https, function (req, res, next) {
    var origin = String(request.httpHeaders.get('origin') || request.httpHeaders.get('referer') || '');
    var host = /^https:\/\/([^/?#]+)/.exec(origin);
    if (host && host[1].toLowerCase() === String(request.httpHost).toLowerCase()) {
        try {
            require('*/cartridge/scripts/helpers/analyticsHelpers').collect(request.httpParameterMap.requestBodyAsString);
        } catch (e) {
            require('dw/system/Logger').getLogger('plugin-analytics', 'analytics-collect').error('Beacon not stored: {0}', e.message);
        }
    }
    res.setStatusCode(204);
    res.print('');
    next();
});

module.exports = server.exports();
