'use strict';

var server = require('server');

var cache = require('*/cartridge/scripts/middleware/cache');
var consentTracking = require('*/cartridge/scripts/middleware/consentTracking');
var pageMetaData = require('*/cartridge/scripts/middleware/pageMetaData');

/**
 * Creates the breadcrumbs object
 * @param {string} cgid - category ID from navigation and search
 * @param {string} pid - product ID
 * @param {Array} breadcrumbs - array of breadcrumbs object
 * @returns {Array} an array of breadcrumb objects
 */
function getAllBreadcrumbs(cgid, pid, breadcrumbs) {
    var URLUtils = require('dw/web/URLUtils');
    var CatalogMgr = require('dw/catalog/CatalogMgr');
    var ProductMgr = require('dw/catalog/ProductMgr');

    var category;
    var product;
    if (pid) {
        product = ProductMgr.getProduct(pid);
        category = product.variant
            ? product.masterProduct.primaryCategory
            : product.primaryCategory;
    } else if (cgid) {
        category = CatalogMgr.getCategory(cgid);
    }

    if (category) {
        breadcrumbs.push({
            htmlValue: category.displayName,
            url: URLUtils.url('Search-Show', 'cgid', category.ID)
        });

        if (category.parent && category.parent.ID !== 'root') {
            return getAllBreadcrumbs(category.parent.ID, null, breadcrumbs);
        }
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
    var Resource = require('dw/web/Resource');

    return {
        info_selectforstock: Resource.msg('info.selectforstock', 'product',
            'Select Styles for Availability')
    };
}

/**
 * Renders the Product Details Page
 * @param {Object} querystring - query string parameters
 * @param {Object} reqPageMetaData - request pageMetaData object
 * @param {Object} res - response object
 */
function showProductPage(querystring, reqPageMetaData, res) {
    var URLUtils = require('dw/web/URLUtils');
    var ProductFactory = require('*/cartridge/scripts/factories/product');
    var pageMetaHelper = require('*/cartridge/scripts/helpers/pageMetaHelper');

    var params = querystring;
    var product = ProductFactory.get(params);
    var addToCartUrl = URLUtils.url('Cart-AddProduct');
    var breadcrumbs = getAllBreadcrumbs(null, product.id, []).reverse();
    var template = 'product/productDetails';

    if (product.productType === 'bundle') {
        template = 'product/bundleDetails';
    } else if (product.productType === 'set') {
        template = 'product/setDetails';
    }

    pageMetaHelper.setPageMetaData(reqPageMetaData, product);
    pageMetaHelper.setPageMetaTags(reqPageMetaData, product);

    res.render(template, {
        product: product,
        addToCartUrl: addToCartUrl,
        resources: getResources(),
        breadcrumbs: breadcrumbs
    });
}

server.get('Show', cache.applyPromotionSensitiveCache, consentTracking.consent, function (req, res, next) {
    showProductPage(req.querystring, req.pageMetaData, res);
    next();
}, pageMetaData.computedPageMetaData);

server.get('ShowInCategory', cache.applyPromotionSensitiveCache, function (req, res, next) {
    showProductPage(req.querystring, req.pageMetaData, res);
    next();
});

server.get('Variation', function (req, res, next) {
    var priceHelper = require('*/cartridge/scripts/helpers/pricing');
    var ProductFactory = require('*/cartridge/scripts/factories/product');
    var renderTemplateHelper = require('*/cartridge/scripts/renderTemplateHelper');

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

server.get('ShowQuickView', cache.applyPromotionSensitiveCache, function (req, res, next) {
    var URLUtils = require('dw/web/URLUtils');
    var ProductFactory = require('*/cartridge/scripts/factories/product');

    var params = req.querystring;
    var product = ProductFactory.get(params);
    var addToCartUrl = URLUtils.url('Cart-AddProduct');
    var template = product.productType === 'set'
        ? 'product/setQuickView.isml'
        : 'product/quickView.isml';

    res.render(template, {
        product: product,
        addToCartUrl: addToCartUrl,
        resources: getResources()
    });

    next();
});

server.get('SizeChart', function (req, res, next) {
    var ContentMgr = require('dw/content/ContentMgr');

    var apiContent = ContentMgr.getContent(req.querystring.cid);

    if (apiContent) {
        res.json({
            success: true,
            content: apiContent.custom.body.markup
        });
    } else {
        res.json({});
    }
    next();
});

server.get('ShowBonusProducts', function (req, res, next) {
    var ProductFactory = require('*/cartridge/scripts/factories/product');
    var moreUrl = null;
    var pagingModel;
    var products = [];
    var product;
    var duuid = req.querystring.DUUID;
    var collections = require('*/cartridge/scripts/util/collections');
    var BasketMgr = require('dw/order/BasketMgr');
    var currentBasket = BasketMgr.getCurrentOrNewBasket();
    var showMoreButton;
    var selectedBonusProducts;

    if (duuid) {
        var bonusDiscountLineItem = collections.find(currentBasket.getBonusDiscountLineItems(), function (item) {
            return item.UUID === duuid;
        });

        if (bonusDiscountLineItem && bonusDiscountLineItem.bonusProductLineItems.length) {
            selectedBonusProducts = collections.map(bonusDiscountLineItem.bonusProductLineItems, function (bonusProductLineItem) {
                var option = {
                    optionid: '',
                    selectedvalue: ''
                };
                if (!bonusProductLineItem.optionProductLineItems.empty) {
                    option.optionid = bonusProductLineItem.optionProductLineItems[0].optionID;
                    option.optionid = bonusProductLineItem.optionProductLineItems[0].optionValueID;
                }
                return {
                    pid: bonusProductLineItem.productID,
                    name: bonusProductLineItem.productName,
                    submittedQty: (bonusProductLineItem.quantityValue),
                    option: option
                };
            });
        } else {
            selectedBonusProducts = [];
        }

        if (req.querystring.pids) {
            var params = req.querystring.pids.split(',');
            products = params.map(function (param) {
                product = ProductFactory.get({
                    pid: param,
                    pview: 'bonus',
                    duuid: duuid });
                return product;
            });
        } else {
            var URLUtils = require('dw/web/URLUtils');
            var PagingModel = require('dw/web/PagingModel');
            var pageStart = parseInt(req.querystring.pagestart, 10);
            var pageSize = parseInt(req.querystring.pagesize, 10);
            showMoreButton = true;

            var ProductSearchModel = require('dw/catalog/ProductSearchModel');
            var apiProductSearch = new ProductSearchModel();
            var productSearchHit;
            apiProductSearch.setPromotionID(bonusDiscountLineItem.promotionID);
            apiProductSearch.setPromotionProductType('bonus');
            apiProductSearch.search();
            pagingModel = new PagingModel(apiProductSearch.getProductSearchHits(), apiProductSearch.count);
            pagingModel.setStart(pageStart);
            pagingModel.setPageSize(pageSize);

            var totalProductCount = pagingModel.count;

            if (pageStart + pageSize > totalProductCount) {
                showMoreButton = false;
            }

            moreUrl = URLUtils.url('Product-ShowBonusProducts', 'DUUID', duuid, 'pagesize', pageSize, 'pagestart', pageStart + pageSize).toString();

            var iter = pagingModel.pageElements;
            while (iter !== null && iter.hasNext()) {
                productSearchHit = iter.next();
                product = ProductFactory.get({ pid: productSearchHit.getProduct().ID, pview: 'bonus', duuid: duuid });
                products.push(product);
            }
        }
    }

    var template = 'product/components/choiceOfBonusProducts/bonusProducts.isml';

    res.render(template, {
        products: products,
        selectedBonusProducts: selectedBonusProducts,
        maxPids: req.querystring.maxpids,
        moreUrl: moreUrl,
        showMoreButton: showMoreButton
    });

    next();
});

module.exports = server.exports();
