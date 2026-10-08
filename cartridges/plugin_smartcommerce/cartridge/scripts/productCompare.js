'use strict';

/**
 * Side-by-side comparison of 2-4 products. Rows are the attribute IDs listed in the
 * smartCompareAttributes site preference (e.g. metal, karatage, grossWeight, stone,
 * diamondClarity), followed by price, availability, offers and delivery estimate
 * from the base product model.
 * @module scripts/productCompare
 */

var ProductMgr = require('dw/catalog/ProductMgr');
var ShippingMgr = require('dw/order/ShippingMgr');
var Site = require('dw/system/Site');
var URLUtils = require('dw/web/URLUtils');
var Collection = require('dw/util/Collection');
var EnumValue = require('dw/value/EnumValue');
var MarkupText = require('dw/content/MarkupText');
var ProductFactory = require('*/cartridge/scripts/factories/product');

var MAX_PRODUCTS = 4;

/**
 * @param {*} value - Attribute value: string, number, EnumValue, collection or MarkupText
 * @returns {string} Display text
 */
function display(value) {
    // Script API objects throw on unknown properties, so type checks must use instanceof.
    if (value === null || value === undefined) {
        return '';
    }
    if (value instanceof Collection) {
        return value.toArray().map(display).join(', ');
    }
    if (value instanceof EnumValue) {
        return String(value.displayValue);
    }
    if (value instanceof MarkupText) {
        return value.markup;
    }
    return String(value);
}

/**
 * @param {dw.catalog.Product} product - Product
 * @returns {string} First non-pickup shipping method with its estimate
 */
function deliveryEstimate(product) {
    var method = ShippingMgr.getProductShippingModel(product).getApplicableShippingMethods().toArray().filter(function (candidate) {
        return !candidate.custom.storePickupEnabled;
    })[0];
    if (!method) {
        return '';
    }
    return method.custom.estimatedArrivalTime ? method.displayName + ' (' + method.custom.estimatedArrivalTime + ')' : method.displayName;
}

/**
 * @param {string} pids - Comma-separated product IDs from the request
 * @returns {Object|null} Columns and attribute rows, null for fewer than two valid products
 */
function build(pids) {
    var seen = {};
    var products = String(pids || '').split(',').map(function (pid) {
        return pid.trim();
    }).filter(function (pid) {
        var fresh = pid && !seen[pid];
        seen[pid] = true;
        return fresh;
    }).slice(0, MAX_PRODUCTS).map(function (pid) {
        return ProductMgr.getProduct(pid);
    }).filter(function (product) {
        return product && product.online;
    });
    if (products.length < 2) {
        return null;
    }

    var attributeIDs = String(Site.current.getCustomPreferenceValue('smartCompareAttributes') || '').split(',').map(function (id) {
        return id.trim();
    }).filter(Boolean);
    var definitions = products[0].describe();
    // Reading an undefined custom attribute throws, so IDs mistyped in the preference are skipped.
    var rows = attributeIDs.filter(function (id) {
        return !!definitions.getCustomAttributeDefinition(id);
    }).map(function (id) {
        return {
            label: definitions.getCustomAttributeDefinition(id).displayName,
            values: products.map(function (product) {
                return display(product.custom[id]);
            })
        };
    }).filter(function (row) {
        return row.values.some(Boolean);
    });

    return {
        rows: rows,
        columns: products.map(function (product) {
            var model = ProductFactory.get({ pid: product.ID });
            var image = model.images && model.images.small ? model.images.small[0] : null;
            return {
                id: product.ID,
                name: model.productName,
                url: URLUtils.url('Product-Show', 'pid', product.ID),
                image: image,
                price: model.price,
                availability: model.availability ? model.availability.messages : [],
                promotions: model.promotions || [],
                delivery: deliveryEstimate(product)
            };
        })
    };
}

module.exports = {
    build: build
};
