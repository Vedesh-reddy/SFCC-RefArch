'use strict';

var server = require('server');
var URLUtils = require('dw/web/URLUtils');
var priceHelper = require('../scripts/helpers/pricing');
var ProductFactory = require('../scripts/factories/product');
var Resource = require('dw/web/Resource');
var CatalogMgr = require('dw/catalog/CatalogMgr');
var ProductMgr = require('dw/catalog/ProductMgr');
var renderTemplateHelper = require('~/cartridge/scripts/renderTemplateHelper');

/**
 * Creates the breadcrumbs object
 * @param {string} cgid - category ID from navigation and search
 * @param {string} pid - product ID
 * @param {Array} breadcrumbs - array of breadcrumbs object
 * @returns {Array} an array of breadcrumb objects
 */
function getAllBreadcrumbs(cgid, pid, breadcrumbs) {
    var primaryCategory;
    var product;
    if (pid) {
        product = ProductMgr.getProduct(pid);
        primaryCategory = product.variant
            ? product.masterProduct.primaryCategory
            : product.primaryCategory;
    }
    var category = cgid && cgid !== 'root'
        ? CatalogMgr.getCategory(cgid)
        : primaryCategory;
    breadcrumbs.push({
        htmlValue: category.displayName,
        url: URLUtils.url('Search-Show', 'cgid', category.ID)
    });
    if (category.parent && category.parent.ID !== 'root') {
        return getAllBreadcrumbs(category.parent.ID, null, breadcrumbs);
    }
    return breadcrumbs;
}

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
        label_outofstock: Resource.msg('label.outofstock', 'common', 'Out of Stock'),
        label_allnotavailable: Resource.msg('label.allnotavailable', 'common',
            'This item is currently not available'),
        info_selectforstock: Resource.msg('info.selectforstock', 'product',
            'Select Styles for Availability')
    };
}

/**
 * Renders the Product Details Page
 * @param {Object} querystring - query string parameters
 * @param {Object} res - response object
 */
function showProductPage(querystring, res) {
    var params = querystring;
    var product = ProductFactory.get(params);
    var addToCartUrl = URLUtils.url('Cart-AddProduct');
    var breadcrumbs = getAllBreadcrumbs(querystring.cgid, product.id, []).reverse();
    var template = 'product/productDetails';

    if (product.productType === 'bundle') {
        template = 'product/bundleDetails';
    } else if (product.productType === 'set') {
        template = 'product/setDetails';
    }

    res.render(template, {
        CurrentPageMetaData: {
            title: product.productName
        },
        product: product,
        addToCartUrl: addToCartUrl,
        resources: getResources(),
        breadcrumbs: breadcrumbs
    });
}

server.get('Show', function (req, res, next) {
    showProductPage(req.querystring, res);
    next();
});

server.get('ShowInCategory', function (req, res, next) {
    showProductPage(req.querystring, res);
    next();
});

server.get('Variation', function (req, res, next) {
    var params = req.querystring;
    var product = ProductFactory.get(params);

    product.price.html = priceHelper.renderHtml(priceHelper.getHtmlContext(product.price));

    var attributeContext = { product: { attributes: product.attributes } };
    var attributeTemplate = 'product/components/attributesPre';
    product.attributesHtml = renderTemplateHelper.getRenderedHtml(
        attributeContext,
        attributeTemplate
    );

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
    // comparisonPage - boolean to determine if this tile will be rendered for product comparison
    // reviews - boolean to determine if the reviews should be shown in the tile.
    // swatches - boolean to determine if the swatches should be shown in the tile.
    //
    // pview - string to determine if the product factory returns a model for
    //         a tile or a pdp/quickview display
    var productTileParams = {
        pid: req.querystring.pid,
        compare: req.querystring.compare,
        comparisonPage: req.querystring.comparisonPage,
        reviews: req.querystring.reviews,
        swatches: req.querystring.swatches,
        pview: 'tile'
    };

    var product;
    var productUrl;
    var quickViewUrl;
    var cgid = req.querystring.cgid;

    // TODO: remove this logic once the Product factory is
    // able to handle the different product types
    try {
        product = ProductFactory.get(productTileParams);
        productUrl = cgid ?
            URLUtils.url('Product-Show', 'pid', product.id, 'cgid', cgid).relative().toString() :
            URLUtils.url('Product-Show', 'pid', product.id).relative().toString();
        quickViewUrl = cgid ?
            URLUtils.url('Product-ShowQuickView', 'pid', product.id, 'cgid', cgid)
                .relative().toString() :
            URLUtils.url('Product-ShowQuickView', 'pid', product.id).relative().toString();
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
            compare: req.querystring.compare === 'true',
            comparisonPage: !!productTileParams.comparisonPage
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
