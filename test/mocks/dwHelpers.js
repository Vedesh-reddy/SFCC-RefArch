'use strict';

function map() {
    var args = Array.from(arguments);
    var list = args[0];
    var callback = args[1];
    return list.map(callback);
}

function find() {
    var args = Array.from(arguments);
    var list = args[0];
    var callback = args[1];
    return list.find(callback);
}

module.exports = {
    find: find,
    map: map
};
