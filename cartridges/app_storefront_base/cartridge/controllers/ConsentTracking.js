'use strict';

var server = require('server');
var cache = require('*/cartridge/scripts/middleware/cache');

server.get('SetSession', cache.applyDefaultCache, function (req, res, next) {
    var consent = (req.querystring.consent === 'true');
    req.session.raw.setTrackingAllowed(consent);
    req.session.privacyCache.set('consent', consent);
    res.json({ success: true });
    next();
});

server.get('GetContent', cache.applyDefaultCache, function (req, res, next) {
    var ContentMgr = require('dw/content/ContentMgr');
    var ContentModel = require('*/cartridge/models/content');

    var apiContent = ContentMgr.getContent(req.querystring.cid);

    if (apiContent) {
        var content = new ContentModel(apiContent, 'components/content/contentAssetInc');
        if (content.template) {
            res.render(content.template, { content: content });
        }
    }
    next();
});

module.exports = server.exports();
