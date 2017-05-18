'use strict';

/**
 * Returns an array of all property keys for an object
 * @param {Array} array - the target object
 * @param {Array} matcher - function that returns true if match is found
 * @return {scope} the array of property keys
 */
function find(array, matcher) {
    var result;

    for (var i = 0, l = array.length; i < l; i++) {
        if (matcher(array[i], i)) {
            return array[i];
        }
    }

    return result;
}

module.exports = {
    find: find
};
