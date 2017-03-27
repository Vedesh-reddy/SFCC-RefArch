'use strict';

var CatalogMgr = require('dw/catalog/CatalogMgr');
var server = require('server');


server.post('Show', function (req, res, next) {
    var compareProductsForm = req.form;
    var category = CatalogMgr.getCategory(compareProductsForm.cgid);
    var pids = Object.keys(compareProductsForm)
        .filter(function (key) { return key.indexOf('pid') === 0; })
        .map(function (pid) { return compareProductsForm[pid]; });
    res.render('product/comparison', {
        category: {
            name: category.displayName,
            imgUrl: category.image.url.toString()
        },
        pids: pids
    });

    next();
});

module.exports = server.exports();
