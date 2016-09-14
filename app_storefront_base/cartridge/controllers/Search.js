'use strict';

var server = require('server');
var locale = require('~/cartridge/scripts/middleware/locale');
var ProductSearchModel = require('dw/catalog/ProductSearchModel');

/**
 * Creates a plain object of parsed refinements from querystring
 * @param {Object} querystring - querystring from the local request object
 * @returns {Array} an array of objects of refinements
 */
function parseRefinements(querystring) {
    var refinements = {};
    Object.keys(querystring).forEach(function (key) {
        if (key.indexOf('pref') === 0) {
            var index = key.substr(5);
            if (!isNaN(parseInt(index, 10))) {
                if (key.charAt(4) === 'n') {
                    if (!refinements[index]) {
                        refinements[index] = { name: querystring[key] };
                    } else {
                        refinements[index].name = querystring[key];
                    }
                } else if (key.charAt(4) === 'v') {
                    if (!refinements[index]) {
                        refinements[index] = { value: querystring[key] };
                    } else {
                        refinements[index].value = querystring[key];
                    }
                }
            }
        }
    });

    return Object.keys(refinements).map(function (index) {
        return refinements[index];
    });
}

/**
 * Creates a plain object of the product search model
 * @param {Object} req - local instance of request object
 * @returns {Object} a plain object of the product search model
 */
function getModel(req) {
    var SearchModel = require('~/cartridge/models/search');
    var productSearchModel = new ProductSearchModel();
    var dataForSearch = {
        refinements: parseRefinements(req.querystring),
        querystring: req.querystring
    };
    return new SearchModel(productSearchModel, dataForSearch);
}

server.get('Show', locale, function (req, res, next) {
    res.render('search/searchresult', getModel(req));
    next();
});

module.exports = server.exports();
