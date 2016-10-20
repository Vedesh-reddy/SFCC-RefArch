'use strict';

var resource = require('dw/web/Resource');

/**
 * Function to conver <dw.web.FormField> object to plain JS object.
 * @param  {dw.web.FormField} field original formfield object.
 * @return {Object} Plain JS object representing formfield.
 */
function formField(field) {
    var result = {};
    var attributesToCopy = {
        string: ['maxLength', 'minLength', 'regEx'],
        bool: ['checked', 'selected'],
        int: ['maxValue', 'minValue'],
        common: ['htmlValue', 'mandatory', 'value',
            'dynamicHtmlName', 'htmlName', 'valid'],
        resources: ['error', 'description', 'label']
    };

    attributesToCopy.common.forEach(function (item) {
        if (item !== 'valid') {
            result[item] = field[item] || '';
        } else {
            result.valid = field.valid;
        }
    });

    attributesToCopy.resources.forEach(function (item) {
        if (field[item]) {
            result[item] = resource.msg(field[item], 'forms', null);
        }
    });

    if (field.options && field.options.optionsCount > 0) {
        result.options = [];
        for (var i = 0, l = field.options.optionsCount; i < l; i++) {
            result.options.push({
                checked: field.options[i].checked,
                htmlValue: field.options[i].htmlValue,
                label: field.options[i].label
                    ? resource.msg(field.options[i].label, 'forms', null)
                    : '',
                id: field.options[i].optionId,
                selected: field.options[i].selected,
                value: field.options[i].value
            });
        }
        result.selectedOption = field.selectedOption ? field.selectedOption.optionId : '';
    }

    result.attributes = 'name = "' + result.htmlName + '"';
    if (result.mandatory) {
        result.attributes += ' required';
    }

    switch (field.type) {
        case field.FIELD_TYPE_BOOLEAN:
            attributesToCopy.bool.forEach(function (item) {
                result[item] = field[item];
            });
            break;
        case field.FIELD_TYPE_DATE:
        case field.FIELD_TYPE_INTEGER:
        case field.FIELD_TYPE_NUMBER:
            attributesToCopy.int.forEach(function (item) {
                result[item] = field[item];
            });
            result.attributes += ' value = "' + result.htmlValue + '"';
            if (result.maxValue) {
                result.attributes += ' max = "' + result.maxValue + '"';
            }
            if (result.minValue) {
                result.attributes += ' min = "' + result.minValue + '"';
            }
            break;
        case field.FIELD_TYPE_STRING:
            attributesToCopy.string.forEach(function (item) {
                result[item] = field[item];
            });
            result.attributes += ' value = "' + result.htmlValue + '"';
            if (result.maxLength) {
                result.attributes += ' maxLength = "' + result.maxLength + '"';
            }
            if (result.minLength) {
                result.attributes += ' minLength = "' + result.minLength + '"';
            }
            if (result.regEx) {
                result.attributes += ' pattern = "' + result.regEx + '"';
            }
            break;
        default:
            break;
    }

    return result;
}

module.exports = formField;
