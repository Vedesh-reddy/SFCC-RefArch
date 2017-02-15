'use strict';

function map() {
    var args = Array.from(arguments);
    var list = args[0];
    var callback = args[1];
    return list ? list.map(callback) : [];
}

function find() {
    var args = Array.from(arguments);
    var list = args[0];
    var callback = args[1];
    return list ? list.find(callback) : null;
}

function forEach() {
    var args = Array.from(arguments);
    var list = args[0];
    var callback = args[1];
    return list ? list.forEach(callback) : null;
}

module.exports = {
    find: find,
    forEach: forEach,
    map: map
};
