'use strict';

/**
 * Gets the first item from dw.util.Collection subclass instance
 * @param {Object} param - the parameter that is supposed to exist
 * @param {string} name - the name of the parameter
 */
function assertRequiredParameter(param, name) {
    if (!param) throw new Error('"' + name + '" is a required parameter.');
}

module.exports = {
    assertRequiredParameter: assertRequiredParameter
};
