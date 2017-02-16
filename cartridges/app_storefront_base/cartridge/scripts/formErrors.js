'use strict';

module.exports = function getFormErrors(form) {
    var results = {};

    if (form === null) {
        return {};
    }
    Object.keys(form).forEach(function (key) {
        if (form[key]) {
            if (form[key].formType === 'formField' && form[key].error) {
                results[form[key].htmlName] = form[key].error;
            }
            if (form[key].formType === 'formGroup') {
                var innerFormResult = getFormErrors(form[key]);
                Object.keys(innerFormResult).forEach(function (innerKey) {
                    results[innerKey] = innerFormResult[innerKey];
                });
            }
        }
    });
    return results;
};
