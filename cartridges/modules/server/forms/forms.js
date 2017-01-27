'use strict';

var field = require('./formfield');
var action = require('./formaction');

/**
 * Convert dw.web.Form or dw.web.FormGroup to plain JS object
 * @param  {dw.web.Form|dw.web.FormGroup} form Form to be parsed
 * @return {Object} Plain JS form object
 */
function parseForm(form) {
    var formField = require('dw/web/FormField');
    var formAction = require('dw/web/FormAction');
    var formGroup = require('dw/web/FormGroup');
    var result = {
        valid: form.valid,
        htmlName: form.htmlName,
        dynamicHtmlName: form.dynamicHtmlName,
        error: form.error || null,
        attributes: 'name = "' + form.htmlName + '" id = "' + form.htmlName + '"',
        formType: 'formGroup'
    };
    Object.keys(form).forEach(function (key) {
        if (form[key] instanceof formField) {
            result[key] = field(form[key]);
        } else if (form[key] instanceof formAction) {
            result[key] = action(form[key]);
        } else if (form[key] instanceof formGroup) {
            result[key] = parseForm(form[key]);
        }
    });

    return result;
}

/**
 * Copy the values of an object to form
 * @param {Object} object - the object to set the new form values to
 * @param  {dw.web.Form|dw.web.FormGroup} currentForm - Form to be parsed
 */
function copyObjectToForm(object, currentForm) {
    Object.keys(currentForm).forEach(function (key) {
        if (currentForm[key] && currentForm[key].formType === 'formGroup') {
            copyObjectToForm(object, currentForm[key]);
        } else if (object[key]) {
            currentForm[key].value = object[key]; // eslint-disable-line no-param-reassign
        }
    });
}

module.exports = function (session) {
    return {
        getForm: function (name) {
            var currentForm = session.forms[name];
            var result = parseForm(currentForm);
            result.base = currentForm;
            result.clear = function () {
                currentForm.clearFormElement();
            };
            result.copyFrom = function (object) {
                copyObjectToForm(object, result);
            };
            return result;
        }
    };
};
