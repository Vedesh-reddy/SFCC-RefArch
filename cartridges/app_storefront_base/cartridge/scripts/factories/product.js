'use strict';

var ProductMgr = require('dw/catalog/ProductMgr');
var PromotionMgr = require('dw/campaign/PromotionMgr');
var collections = require('*/cartridge/scripts/util/collections');
var productHelper = require('*/cartridge/scripts/helpers/productHelpers');
var productTile = require('*/cartridge/models/product/productTile');
var fullProduct = require('*/cartridge/models/product/fullProduct');
var productSet = require('*/cartridge/models/product/productSet');
var productBundle = require('*/cartridge/models/product/productBundle');
var productLineItem = require('*/cartridge/models/productLineItem/productLineItem');
var bundleProductLineItem = require('*/cartridge/models/productLineItem/bundleLineItem');

/**
 * Return type of the current product
 * @param  {dw.catalog.ProductVariationModel} product - Current product
 * @return {string} type of the current product
 */
function getProductType(product) {
    var result;
    if (product.master) {
        result = 'master';
    } else if (product.variant) {
        result = 'variant';
    } else if (product.variationGroup) {
        result = 'variationGroup';
    } else if (product.productSet) {
        result = 'set';
    } else if (product.bundle) {
        result = 'bundle';
    } else if (product.optionProduct) {
        result = 'optionProduct';
    } else {
        result = 'standard';
    }
    return result;
}

/**
 * Normalize product and return Product variation model
 * @param  {dw.catalog.Product} product - Product instance returned from the API
 * @param  {Object} productVariables - variables passed in the query string to
 *                                     target product variation group
 * @return {dw.catalog.ProductVarationModel} Normalized variation model
 */
function getVariationModel(product, productVariables) {
    var variationModel = product.variationModel;
    if (!variationModel.master && !variationModel.selectedVariant) {
        variationModel = null;
    } else if (productVariables) {
        var variationAttrs = variationModel.productVariationAttributes;
        Object.keys(productVariables).forEach(function (attr) {
            if (attr && productVariables[attr].value) {
                var dwAttr = collections.find(variationAttrs,
                    function (item) { return item.ID === attr; });
                var dwAttrValue = collections.find(variationModel.getAllValues(dwAttr),
                    function (item) { return item.value === productVariables[attr].value; });
                if (dwAttr && dwAttrValue) {
                    variationModel.setSelectedAttributeValue(dwAttr.ID, dwAttrValue.ID);
                }
            }
        });
    }
    return variationModel;
}

/**
 * Get information for model creation
 * @param {dw.catalog.Product} apiProduct - Product from the API
 * @param {Object} params - Parameters passed by querystring
 *
 * @returns {Object} - Config object
 */
function getConfig(apiProduct, params) {
    var variations = getVariationModel(apiProduct, params.variables);
    if (variations) {
        apiProduct = variations.selectedVariant || apiProduct; // eslint-disable-line
    }

    var promotions = PromotionMgr.activeCustomerPromotions.getProductPromotions(apiProduct);
    var optionsModel = productHelper.getCurrentOptionModel(apiProduct.optionModel, params.options);
    var options = {
        variationModel: variations,
        options: params.options,
        optionModel: optionsModel,
        promotions: promotions,
        quantity: params.quantity,
        variables: params.variables,
        apiProduct: apiProduct,
        productType: getProductType(apiProduct)
    };

    return options;
}

/**
 * Retrieve product's options and default selected values from product line item
 *
 * @param {dw.util.Collection.<dw.order.ProductLineItem>} optionProductLineItems - Option product
 *     line items
 * @param {string} productId - Line item product ID
 * @return {string []} - Product line item options
 */
function getLineItemOptions(optionProductLineItems, productId) {
    return collections.map(optionProductLineItems, function (item) {
        return {
            productId: productId,
            optionId: item.optionID,
            selectedValueId: item.optionValueID
        };
    });
}

/**
 * Retrieve product's options and default values
 *
 * @param {dw.catalog.ProductOptionModel} optionModel - A product's option model
 * @param {dw.util.Collection.<dw.catalog.ProductOption>} options - A product's configured options
 * @return {string []} - Product line item options
 */
function getDefaultOptions(optionModel, options) {
    return collections.map(options, function (option) {
        var selectedValue = optionModel.getSelectedOptionValue(option);
        return option.displayName + ': ' + selectedValue.displayValue;
    });
}

/**
 * Retrieve product's options and default selected values from product line item
 *
 * @param {dw.util.Collection.<dw.order.ProductLineItem>} optionProductLineItems - Option product
 *     line items
 * @return {string[]} - Product line item option display values
 */
function getLineItemOptionNames(optionProductLineItems) {
    return collections.map(optionProductLineItems, function (item) {
        return item.productName;
    });
}

module.exports = {
    get: function (params) {
        var productId = params.pid;
        var apiProduct = ProductMgr.getProduct(productId);
        var productType = getProductType(apiProduct);
        var product = Object.create(null);
        var options = null;
        var promotions;

        switch (params.pview) {
            case 'tile':
                product = productTile(product, apiProduct, getProductType(apiProduct));
                break;
            case 'productLineItem':
                promotions = PromotionMgr.activeCustomerPromotions.getProductPromotions(apiProduct);
                options = {
                    promotions: promotions,
                    quantity: params.quantity,
                    variables: params.variables,
                    lineItem: params.lineItem,
                    productType: getProductType(apiProduct)
                };

                switch (productType) {
                    case 'bundle':

                        product = bundleProductLineItem(product, apiProduct, options, this);

                        break;
                    default:
                        var variations = getVariationModel(apiProduct, params.variables);
                        if (variations) {
                            apiProduct = variations.getSelectedVariant() || apiProduct; // eslint-disable-line
                        }

                        var optionModel = apiProduct.optionModel;
                        var optionLineItems = params.lineItem.optionProductLineItems;
                        var currentOptionModel = productHelper.getCurrentOptionModel(
                            optionModel,
                            getLineItemOptions(optionLineItems, productId)
                        );
                        var lineItemOptions = optionLineItems.length
                            ? getLineItemOptionNames(optionLineItems)
                            : getDefaultOptions(optionModel, optionModel.options);


                        options.variationModel = variations;
                        options.lineItemOptions = lineItemOptions;
                        options.currentOptionModel = currentOptionModel;

                        product = productLineItem(product, apiProduct, options);

                        break;
                }

                break;
            default: // PDP
                options = getConfig(apiProduct, params);

                switch (productType) {
                    case 'set':
                        product = productSet(product, options.apiProduct, options, this);
                        break;
                    case 'bundle':
                        product = productBundle(product, options.apiProduct, options, this);
                        break;
                    default:
                        product = fullProduct(product, options.apiProduct, options);
                        break;
                }
        }

        return product;
    }
};
