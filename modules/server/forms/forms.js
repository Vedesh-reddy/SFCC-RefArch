'use strict';

var field = require('./formfield');
var action = require('./formaction');


/**
 * Convert dw.web.Form or dw.web.FormGroup to plain JS object
 * @param  {dw.web.Form|dw.web.FormGroup} form Form to be parsed
 * @return {Object} Plain JS form object
 */
function parseForm(form) {
    var dwweb = require('dw/web');
    var result = {
        valid: form.valid,
        htmlName: form.htmlName,
        dynamicHtmlName: form.dynamicHtmlName,
        error: form.error || null,
        attributes: 'name = "' + form.htmlName + '" id = "' + form.htmlName + '"'
    };
    Object.keys(form).forEach(function (key) {
        if (form[key] instanceof dwweb.FormField) {
            result[key] = field(form[key]);
        } else if (form[key] instanceof dwweb.FormAction) {
            result[key] = action(form[key]);
        } else if (form[key] instanceof dwweb.FormGroup) {
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
            return result;
        }
    };
};
