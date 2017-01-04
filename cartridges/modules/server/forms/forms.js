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
        attributes: 'name = "' + form.htmlName + '" id = "' + form.htmlName + '"'
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

module.exports = function (session) {
    return {
        getForm: function (name) {
            var currentForm = session.forms[name];
            var result = parseForm(currentForm);
            result.base = currentForm;
            result.clear = function () {
                currentForm.clear();
            };
            return result;
        }
    };
};
