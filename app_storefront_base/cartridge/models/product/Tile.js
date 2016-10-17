'use strict';

var defaultImageViewTypes = ['medium', 'swatch'];
var dwHelpers = require('../../scripts/dwHelpers');
var PricingModel = require('./productPricingModel');
var URLUtils = require('dw/web/URLUtils');

var DEFAULT_SWATCH_ATTRIBUTES = ['color'];

/**
 * Retrieves the Demandware ProductVariationAttribute within a collection of such objects
 *
 * @param {dw.util.Collection} dwVariationAttrs - Collection of dw.catalog.ProductVariationAttribute
 *     objects
 * @param {dw.catalog.ProductVariationAttribute} attr - Instance of a ProductVariationAttribute to
 *     look for in dwVariationAttrs
 * @returns {dw.catalog.ProductVariationAttribute|null}
 */
function getDwVariationAttr(dwVariationAttrs, attr) {
    return dwHelpers.find(dwVariationAttrs, function (item) {
        return item.ID === attr;
    });
}

/**
 * Gets the ProductVariationAttributeValue with the provided value
 *
 * @param {dw.catalog.ProductVariationModel} dwVariationModel
 * @param {dw.catalog.ProductVariationAttribute} dwVariationAttr
 * @param {String|undefined} value
 */
function getVariationValue(dwVariationModel, dwAttr, value) {
    var dwAttrValues = dwVariationModel.getAllValues(dwAttr);
    return dwHelpers.find(dwAttrValues, function (item) {
        return item.value === value;
    });
}

/**
 * Updates a ProductVariationModel with the selected attributes
 *
 * @param {Object} args
 * @param {dw.catalog.Product} args.dwProduct - Product instance
 * @param {Object} args.attrs - Query parameter values of selected product attributes
 * @returns {dw.catalog.ProductVariationModel} - Updated ProductVariationModel with selected
 *     attributes taken into consideration
 */
function updateVariationSelection(args) {
    var dwProduct = args.dwProduct;
    var attrs = args.attrs;

    var dwVariationModel = dwProduct.getVariationModel();
    var dwVariationAttrs = dwVariationModel.getProductVariationAttributes();

    if (attrs) {
        Object.keys(attrs).forEach(function (attr) {
            var dwAttr = getDwVariationAttr(dwVariationAttrs, attr);
            var dwAttrValue = getVariationValue(dwVariationModel, dwAttr, attrs[attr].value);

            dwVariationModel.setSelectedAttributeValue(dwAttr.ID, dwAttrValue.ID);
        });
    }

    return dwVariationModel;
}

/**
 * Determines whether a product attribute has image swatches.  Currently, the only attribute that
 *     does is Color.
 * @param {String} dwAttributeId
 * @returns {boolean}
 */
function isSwatchable(dwAttributeId) {
    return DEFAULT_SWATCH_ATTRIBUTES.indexOf(dwAttributeId) > -1;
}

/**
 * Retrieve a Product's or Attribute Value's images
 *
 * @param {dw.catalog.Product | dw.catalog.ProductVariationAttributeValue} imageHolder - DW Script
 *     object that has a getImages method
 * @returns {Object[]} - List of image objects
 */
function getImages(imageHolder) {
    var images = {};

    defaultImageViewTypes.forEach(function (type) {
        var dwImages = imageHolder.getImages(type);
        images[type] = dwHelpers.map(dwImages, function (dwMediaFile) {
            return {
                alt: dwMediaFile.alt,
                url: dwMediaFile.URL.relative().toString(),
                title: dwMediaFile.title
            };
        });
    });

    return images;
}

/**
 * Constructs a swatch json object
 * @param swatchData - A variation value data used to display a swatch
 * @param pdpUrl - A link to that variation used if the swatch has been selected
 * @returns {Object} - Json object needed to display a swatch in a product tile.
 */
function createSwatchJson(swatchData, pdpUrl) {
    var mediumImage = swatchData.medium[0];
    var swatch = {
        title: mediumImage.title,
        alt: mediumImage.alt,
        url: swatchData.swatch[0].url,
        pdpUrl: pdpUrl,
        imageUrl: mediumImage.url
    };

    return swatch;
}

/**
 * Retrieve all attribute values
 *
 * @param {dw.catalog.ProductVariationModel} dwVariationModel - A product's variation model
 * @param {dw.catalog.ProductVariationAttributeValue} dwSelectedValue - Selected attribute value
 * @param {dw.catalog.ProductVariationAttribute} dwAttr - Attribute value
 * @returns {Object[]} - List of attribute value objects for template context
 */
function getAllAttrValues(dwVariationModel, dwSelectedValue, dwAttr) {
    var dwAttrValues = dwVariationModel.getAllValues(dwAttr);
    var actionEndpoint = 'Product-Variation';

    return dwHelpers.map(dwAttrValues, function (dwValue) {
        var isSelected = (dwSelectedValue && dwSelectedValue.equals(dwValue)) || false;

        var processedAttr = {
            isSelected: isSelected,
            isSelectable: dwVariationModel.hasOrderableVariants(dwAttr, dwValue)
        };

        if (processedAttr.isSelectable) {
            processedAttr.url = isSelected
                ? dwVariationModel.urlUnselectVariationValue(actionEndpoint, dwAttr)
                : dwVariationModel.urlSelectVariationValue(actionEndpoint, dwAttr, dwValue);
        }

        if (isSwatchable(dwAttr.attributeID)) {
            processedAttr.swatches = createSwatchJson(
                getImages(dwValue),
                processedAttr.url.replace('Variation', 'Show')
            );
        }

        return processedAttr;
    });
}

/**
 * Formats variation attributes into json to be used on product tile.
 * @param {Object} args
 * @param {dw.catalog.ProductVariationModel} args.dwVariationModel - ProductVariationModel to look
 *     up dw.catalog.ProductVariationAttributes
 * @returns {Object[]} - Swatch Objects used to build a product tile.
 */
function getSwatchAttrs(args) {
    var dwVariationModel = args.dwVariationModel;
    var variant = dwVariationModel.getSelectedVariant() || dwVariationModel.getDefaultVariant();
    var variantVariationModel = variant.getVariationModel();
    var dwAttrs = variantVariationModel.getProductVariationAttributes();
    var swatches = [];

    dwHelpers.forEach(dwAttrs, function (dwAttr) {
        var dwSelectedValue = dwVariationModel.getSelectedValue(dwAttr);
        var swatchArray = [];
        if (isSwatchable(dwAttr.attributeID)) {
            var allAttrValues = getAllAttrValues(dwVariationModel, dwSelectedValue, dwAttr);
            swatchArray = allAttrValues.map(function (value) {
                return value.swatches;
            });

            swatches = swatches.concat(swatchArray);
            return swatchArray;
        }
        return swatchArray;
    });

    return swatches;
}

/**
 * Product Model for Master and Variant Products
 *
 * @param {Object} args
 * @param {Object} args.params
 * @param {dw.catalog.Product} args.dwProduct - Product instance retrieved by calling
 *     ProductMgr.get(pid)
 * @param {Boolean} args.swatches - Flag for showing the swatches in a tile
 * @param {Boolean} args.reviews - Flag for showing the reviews in a tile
 * @param {Boolean} args.compare - Flag for showing the compare checkbox in a tile
 * @return {Object} - Product model instance for use in template context
 */
function Product(args) {
    var params = args.params;
    var dwProduct = args.dwProduct;

    var display = {
        swatches: params.swatches === 'true',
        reviews: params.reviews === 'true',
        compare: params.compare === 'true'
    };

    var updatedVariationModel = updateVariationSelection({
        dwProduct: dwProduct,
        attrs: params.variables
    });

    this.id = dwProduct.ID;
    this.name = dwProduct.name;
    this.url = URLUtils.url('Product-Show', 'pid', dwProduct.ID).toString();
    this.quickViewUrl = URLUtils.url(
      'Product-ShowTile',
      'pid', dwProduct.ID,
      'pview', 'quickview').toString();
    this.image = getImages(updatedVariationModel).medium[0];
    this.price = new PricingModel(dwProduct, []).formatted;
    this.display = display;
    this.swatches = getSwatchAttrs({
        dwVariationModel: updatedVariationModel
    });
}

Product.updateVariationSelection = updateVariationSelection;

module.exports = Product;
