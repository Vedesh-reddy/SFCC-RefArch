'use strict';

var collections = require('*/cartridge/scripts/util/collections');

/**
 * @typedef {Object} ProductOptionValues
 * @type Object
 * @property {string} id - Product option value ID
 * @property {string} displayValue - Option value's display value
 * @property {string} price - Option values' price
 */

/**
 * Get a product option's values
 *
 * @param {dw.catalog.ProductOptionModel} optionModel - A product's option model
 * @param {dw.catalog.ProductOption} option - A product's option
 * @param {dw.util.Collection <dw.catalog.ProductOptionValue>} optionValues - Product option values
 * @return {ProductOptionValues} - View model for a product option's values
 */
function getOptionValues(optionModel, option, optionValues) {
    var action = 'Product-Option';
    var values = collections.map(optionValues, function (value) {
        var priceValue = optionModel.getPrice(value);
        var url = optionModel.urlSelectOptionValue(action, option, value);
        return {
            id: value.ID,
            displayValue: value.displayValue,
            price: priceValue.toFormattedString(),
            priceValue: priceValue.decimalValue,
            url: url.toString()
        };
    });

    return values.sort(function (a, b) {
        return a.priceValue - b.priceValue;
    });
}

/**
 * @typedef {Object} ProductOptions
 *
 * @property {string} id - Product option ID
 * @property {string} name - Product option name
 * @property {string} htmlName - HTML representation of product option name
 * @property {ProductOptionValues} values - A product option's values
 * @property {string} selectedValueId - Selected option value ID
 */

/**
 * Retrieve provided product's options
 *
 * @param {dw.catalog.ProductOptionModel} optionModel - Product's option model
 * @return {ProductOptions[]} - Parsed options for this product
 */
function getOptions(optionModel) {
    return collections.map(optionModel.options, function (option) {
        return {
            id: option.ID,
            name: option.displayName,
            htmlName: option.htmlName,
            values: getOptionValues(optionModel, option, option.optionValues),
            selectedValueId: optionModel.getSelectedOptionValue(option).ID
        };
    });
}

/**
 * @typedef SelectedOption
 * @type Object
 * @property {string} optionId - Product option ID
 * @property {string} productId - Product ID
 * @property {string} selectedValueId - Selected product option value ID
 */

/**
 * Provides a current option model by setting selected option values
 *
 * @param {dw.catalog.ProductOptionModel} optionModel - Product's option model
 * @param {SelectedOption[]} selectedOptions - Options selected in UI
 * @return {dw.catalog.ProductOptionModel} - Option model updated with selected options
 */
function getCurrentOptionModel(optionModel, selectedOptions) {
    var productOptions = optionModel.options;
    var selectedValue;
    var selectedValueId;

    if (selectedOptions && selectedOptions.length) {
        collections.forEach(productOptions, function (option) {
            selectedValueId = selectedOptions.filter(function (selectedOption) {
                return selectedOption.optionId === option.ID;
            })[0].selectedValueId;
            selectedValue = optionModel.getOptionValue(option, selectedValueId);
            optionModel.setSelectedOptionValue(option, selectedValue);
        });
    }

    return optionModel;
}

module.exports = {
    getOptionValues: getOptionValues,
    getOptions: getOptions,
    getCurrentOptionModel: getCurrentOptionModel
};
