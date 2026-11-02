'use strict';

var CatalogMgr = require('dw/catalog/CatalogMgr');
var ProductMgr = require('dw/catalog/ProductMgr');
var ProductSearchModel = require('dw/catalog/ProductSearchModel');
var URLUtils = require('dw/web/URLUtils');

var CAROUSEL_SIZE = 10;
var MINIMUM_PRODUCTS = 3;

/**
 * Finds orderable product IDs in a category, including its sub-categories
 * @param {string} categoryId - Category ID
 * @param {string} [excludeId] - Product ID to leave out
 * @returns {string[]} Product IDs, at most CAROUSEL_SIZE
 */
function getProductIds(categoryId, excludeId) {
    var category = CatalogMgr.getCategory(categoryId);
    var ids = [];
    if (!category || !category.online) {
        return ids;
    }
    var search = new ProductSearchModel();
    search.setCategoryID(categoryId);
    search.setRecursiveCategorySearch(true);
    search.setOrderableProductsOnly(true);
    search.search();

    var hits = search.getProductSearchHits();
    while (hits.hasNext() && ids.length < CAROUSEL_SIZE) {
        var productId = hits.next().getProductID();
        if (productId !== excludeId) {
            ids.push(productId);
        }
    }
    return ids;
}

/**
 * Builds the view data for one product carousel
 * @param {string} titleKey - Heading key in the storefront resource bundle
 * @param {string} categoryId - Category supplying the products
 * @param {string} [excludeId] - Product ID to leave out
 * @returns {Object|null} Carousel, or null when the category has too few products to scroll
 */
function getCarousel(titleKey, categoryId, excludeId) {
    var productIds = getProductIds(categoryId, excludeId);
    if (productIds.length < MINIMUM_PRODUCTS) {
        return null;
    }
    return {
        id: 'carousel-' + categoryId.toLowerCase(),
        titleKey: titleKey,
        url: URLUtils.url('Search-Show', 'cgid', categoryId).toString(),
        productIds: productIds
    };
}

/**
 * Builds the carousel of products related to the one on the product page
 * @param {string} productId - Product shown on the page
 * @returns {Object|null} Carousel, or null when the product has no usable category
 */
function getRelatedCarousel(productId) {
    var product = ProductMgr.getProduct(productId);
    if (!product) {
        return null;
    }
    var master = product.isVariant() ? product.getMasterProduct() : product;
    var category = master.getPrimaryCategory() || master.getClassificationCategory();
    return category ? getCarousel('heading.carousel.related', category.getID(), master.getID()) : null;
}

module.exports = {
    getCarousel: getCarousel,
    getRelatedCarousel: getRelatedCarousel
};
