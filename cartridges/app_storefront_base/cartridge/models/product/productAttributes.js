'use strict';

var dwHelpers = require('../../scripts/dwHelpers');
var ImageModel = require('./productImages');

/**
 * Determines whether a product attribute has image swatches.  Currently, the only attribute that
 *     does is Color.
 * @param {string} dwAttributeId - Id of the attribute to check
 * @returns {boolean} flag that specifies if the current attribute should be displayed as a swatch
 */
function isSwatchable(dwAttributeId) {
    var imageableAttrs = ['color'];
    return imageableAttrs.indexOf(dwAttributeId) > -1;
}

/**
 * Retrieve all attribute values
 *
 * @param {dw.catalog.ProductVariationModel} variationModel - A product's variation model
 * @param {dw.catalog.ProductVariationAttributeValue} selectedValue - Selected attribute value
 * @param {dw.catalog.ProductVariationAttribute} attr - Attribute value'
 * @param {string} endPoint - The end point to use in the Product Controller
 * @returns {Object[]} - List of attribute value objects for template context
 */
function getAllAttrValues(variationModel, selectedValue, attr, endPoint) {
    var attrValues = variationModel.getAllValues(attr);
    var actionEndpoint = 'Product-' + endPoint;

    return dwHelpers.map(attrValues, function (value) {
        var isSelected = (selectedValue && selectedValue.equals(value)) || false;

        var processedAttr = {
            id: value.ID,
            description: value.description,
            displayValue: value.displayValue,
            value: value.value,
            selected: isSelected,
            selectable: variationModel.hasOrderableVariants(attr, value)
        };

        if (processedAttr.selectable) {
            processedAttr.url = (isSelected && endPoint !== 'Show')
                ? variationModel.urlUnselectVariationValue(actionEndpoint, attr)
                : variationModel.urlSelectVariationValue(actionEndpoint, attr, value);
        }

        if (isSwatchable(attr.attributeID)) {
            processedAttr.images = new ImageModel(value, { types: ['swatch'], quantity: 'all' });
        }

        return processedAttr;
    });
}

/**
 * Gets the Url needed to relax the given attribute selection, this will not return
 * anything for attributes represented as swatches.
 *
 * @param {Array} values - Attribute values
 * @param {string} attrID - id of the attribute
 * @returns {string} -the Url that will remove the selected attribute.
 */
function getAttrResetUrl(values, attrID) {
    var urlReturned;
    var value;

    for (var i = 0; i < values.length; i++) {
        value = values[i];
        if (!value.images) {
            if (value.selected) {
                urlReturned = value.url;
                break;
            }

            if (value.selectable) {
                urlReturned = value.url.replace(attrID + '=' + value.value, attrID + '=');
                break;
            }
        }
    }

    return urlReturned;
}

/**
 * @constructor
 * @classdesc Get a list of available attributes that matches provided config
 *
 * @param {dw.catalog.ProductVariationModel} variationModel - current product variation
 * @param {Object} attrConfig - attributes to select
 * @param {Array} attrConfig.attributes - an array of strings,representing the
 *                                        id's of product attributes.
 * @param {string} attrConfig.attributes - If this is a string and equal to '*' it signifies
 *                                         that all attributes should be returned.
 *                                         If the string is 'selected', then this is comming
 *                                         from something like a product line item, in that
 *                                         all the attributes have been selected.
 *
 * @param {string} attrConfig.endPoint - the endpoint to use when generating urls for
 *                                       product attributes
 */
function VariationAttributesModel(variationModel, attrConfig) {
    var allAttributes = variationModel.productVariationAttributes;
    var result = [];
    dwHelpers.forEach(allAttributes, function (attr) {
        var selectedValue = variationModel.getSelectedValue(attr);
        var values = getAllAttrValues(variationModel, selectedValue, attr, attrConfig.endPoint);
        var resetUrl = getAttrResetUrl(values, attr.ID);

        if ((Array.isArray(attrConfig.attributes)
            && attrConfig.attributes.indexOf(attr.attributeID) > -1)
            || attrConfig.attributes === '*') {
            result.push({
                attributeId: attr.attributeID,
                displayName: attr.displayName,
                id: attr.ID,
                swatchable: isSwatchable(attr.attributeID),
                values: values,
                resetUrl: resetUrl
            });
        } else if (attrConfig.attributes === 'selected') {
            result.push({
                displayName: attr.displayName,
                displayValue: selectedValue.displayValue,
                attributeId: attr.attributeID,
                id: attr.ID
            });
        }
    });
    result.forEach(function (item) {
        this.push(item);
    }, this);
}

VariationAttributesModel.prototype = [];

module.exports = VariationAttributesModel;
