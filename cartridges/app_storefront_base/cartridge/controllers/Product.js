'use strict';

var server = require('server');
var URLUtils = require('dw/web/URLUtils');
var priceHelper = require('../scripts/helpers/pricing');
var ProductFactory = require('../scripts/factories/product');
var Resource = require('dw/web/Resource');


/**
 * @typedef ProductDetailPageResourceMap
 * @type Object
 * @property {String} global_availability - Localized string for "Availability"
 * @property {String} label_instock - Localized string for "In Stock"
 * @property {String} global_availability - Localized string for "This item is currently not
 *     available"
 * @property {String} info_selectforstock - Localized string for "Select Styles for Availability"
 */

/**
 * Generates a map of string resources for the template
 *
 * @returns {ProductDetailPageResourceMap} - String resource map
 */
function getResources() {
    return {
        label_instock: Resource.msg('label.instock', 'common', 'In Stock'),
        label_allnotavailable: Resource.msg('label.allnotavailable', 'common',
            'This item is currently not available'),
        info_selectforstock: Resource.msg('info.selectforstock', 'product',
            'Select Styles for Availability')
    };
}

server.get('Show', function (req, res, next) {
    var params = req.querystring;
    var product = ProductFactory.get(params);
    var addToCartUrl = URLUtils.url('Cart-AddProduct');

    res.render('product/detail.isml', {
        CurrentPageMetaData: {
            title: product.productName
        },
        product: product,
        addToCartUrl: addToCartUrl,
        resources: getResources()
    });

    next();
});

server.get('Variation', function (req, res, next) {
    var params = req.querystring;
    var product = ProductFactory.get(params);

    product.price.html = priceHelper.renderHtml(priceHelper.getHtmlContext(product.price));

    res.json({
        product: product,
        resources: getResources()
    });

    next();
});

server.get('ShowTile', function (req, res, next) {
    // The req parameter has a property called querystring. In this use case the querystring could
    // have the following:
    // pid - the Product ID
    // compare - boolean to determine if the compare feature should be shown in the tile.
    // reviews - boolean to determine if the reviews should be shown in the tile.
    // swatches - boolean to determine if the swatches should be shown in the tile.
    //
    // pview - string to determine if the product factory returns a model for
    //         a tile or a pdp/quickview display
    var productTileParams = {
        pid: req.querystring.pid,
        compare: req.querystring.compare,
        reviews: req.querystring.reviews,
        swatches: req.querystring.swatches,
        pview: 'tile'
    };

    var product;
    var productUrl;
    var quickViewUrl;

    // TODO: remove this logic once the Product factory is
    // able to handle the different product types
    try {
        product = ProductFactory.get(productTileParams);
        productUrl = URLUtils.url('Product-Show', 'pid', product.id).relative().toString();
        quickViewUrl = URLUtils.url('Product-ShowQuickView', 'pid', product.id)
            .relative().toString();
    } catch (e) {
        product = false;
        productUrl = URLUtils.url('Home-Show');// TODO: change to coming soon page
        quickViewUrl = URLUtils.url('Home-Show');
    }

    res.render('product/gridTile.isml', {
        product: product,
        urls: {
            product: productUrl,
            quickView: quickViewUrl
        },
        display: {
            swatches: req.querystring.swatches,
            reviews: req.querystring.reviews,
            compare: req.querystring.compare
        }
    });

    next();
});

server.get('ShowQuickView', function (req, res, next) {
    var params = req.querystring;
    var product = ProductFactory.get(params);
    var addToCartUrl = URLUtils.url('Cart-AddProduct');

    res.render('product/quickview.isml', {
        product: product,
        addToCartUrl: addToCartUrl,
        resources: getResources()
    });

    next();
});

module.exports = server.exports();
