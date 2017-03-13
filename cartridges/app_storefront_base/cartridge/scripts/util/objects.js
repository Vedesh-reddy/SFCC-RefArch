'use strict';

/**
 * Returns an array of all property keys for an object
 * @param {Object} obj - the target object
 * @return {Array} the array of property keys
 */
function keys(obj) {
    return Object.keys(obj);
}

/**
 * Returns an array of all property values for an object
 * @param {Object} obj - the target object
 * @return {Array} the array of property keys
 */
function values(obj) {
    var objKeys = keys(obj);
    return objKeys.map(function (key) {
        return obj[key];
    });
}

/**
 * Returns a new class instance with class and instance
 * @param {Object} prototype - the class properties
 * @param {Object} properties - the instance properties
 * @return {Object} the output object
 */
function createClass(prototype, properties) {
    var $model = Object.create(prototype || {});
    if (properties) {
        var propKeys = keys(properties);
        propKeys.forEach(function (key) {
            $model[key] = properties[key];
        });
    }
    return $model;
}

/**
 * Returns the value of a key path applied to an object
 * @param {Object} context - the target object
 * @param {string} keyPath - the keyPath to evaluate against the context
 * @return {Object} the output value
 */
function get(context, keyPath) {
    var keyPathKeys = keyPath.split('.');
    var value = context;

    try {
        for (var i = 0, ii = keyPathKeys.length; i < ii; i++) {
            value = value ? value[keyPathKeys[i]] : null;
        }
    } catch (e) {
        value = null;
    }

    return value;
}

module.exports = {
    keys: keys,
    values: values,
    createClass: createClass,
    get: get
};
